/**
 * testFcmSend — Direct FCM v1 send test
 * 1. Get OAuth2 token (reuse getAccessToken logic)
 * 2. Get active FCM token from DB
 * 3. Send to FCM messages:send endpoint
 * 4. Log full response
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function base64url(data) {
  let base64;
  if (typeof data === 'string') {
    base64 = btoa(unescape(encodeURIComponent(data)));
  } else {
    base64 = btoa(String.fromCharCode(...data));
  }
  return base64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);

  const headerStr = JSON.stringify({ alg: 'RS256', typ: 'JWT' });
  const payloadStr = JSON.stringify({
    iss: sa.client_email,
    sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  });

  const headerB64  = base64url(headerStr);
  const payloadB64 = base64url(payloadStr);
  const signingInput = `${headerB64}.${payloadB64}`;

  const pem = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\r\n|\n|\r/g, '');
  const binaryKey = Uint8Array.from(atob(pem), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const sigB64 = base64url(new Uint8Array(signatureBuffer));
  const jwt = `${signingInput}.${sigB64}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`OAuth2 failed: ${res.status} — ${data.error}`);
  }

  console.log('[testFcmSend] OAuth2 ✅ — token obtained');
  return data.access_token;
}

Deno.serve(async (req) => {
  try {
    console.log('[testFcmSend] START');

    // Load Service Account
    const rawJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') || '';
    if (!rawJson) {
      return Response.json({ error: 'FIREBASE_SERVICE_ACCOUNT_JSON not set' }, { status: 500 });
    }

    const sa = JSON.parse(rawJson);
    const projectId = sa.project_id;
    console.log('[testFcmSend] Project ID:', projectId);

    // Get OAuth2 token
    console.log('[testFcmSend] Getting OAuth2 token...');
    const accessToken = await getAccessToken(sa);

    // Get active FCM token from DB
    console.log('[testFcmSend] Getting active FCM token from database...');
    const base44 = createClientFromRequest(req);

    const tokens = await base44.asServiceRole.entities.FcmToken.filter({
      is_active: true,
    }, '-registered_at', 1);

    if (!tokens || tokens.length === 0) {
      return Response.json({ error: 'No active FCM token in database' }, { status: 404 });
    }

    const fcmToken = tokens[0].token;
    const tokenId = tokens[0].id;
    console.log('[testFcmSend] FCM Token found:', fcmToken.slice(0, 25) + '...');
    console.log('[testFcmSend] Token ID:', tokenId);
    console.log('[testFcmSend] Device type:', tokens[0].device_type);
    console.log('[testFcmSend] User email:', tokens[0].user_email);
    console.log('[testFcmSend] Registered at:', tokens[0].registered_at);

    // Build FCM message
    const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
    const message = {
      token: fcmToken,
      notification: {
        title: 'Test CDL FCM v1',
        body: 'This is a test notification',
      },
      data: {
        title: 'Test CDL FCM v1',
        body: 'This is a test notification',
        notif_route: '/mes-notifications',
      },
      android: {
        priority: 'HIGH',
        notification: {
          channel_id: 'default',
        },
      },
    };

    const requestBody = { message };

    console.log('[testFcmSend] URL:', url);
    console.log('[testFcmSend] Request body:', JSON.stringify(requestBody, null, 2));
    console.log('[testFcmSend] Authorization Bearer:', accessToken.substring(0, 50) + '...');

    // Send to FCM
    console.log('[testFcmSend] Sending to FCM...');
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    let result;
    try {
      result = await res.json();
    } catch (parseErr) {
      const rawText = await res.text();
      console.error('[testFcmSend] JSON parse error:', parseErr.message);
      console.error('[testFcmSend] Raw response:', rawText);
      result = { raw: rawText };
    }

    console.log('[testFcmSend] Response status:', res.status, res.statusText);
    console.log('[testFcmSend] Response headers:');
    for (const [key, value] of res.headers.entries()) {
      console.log(`  ${key}: ${value}`);
    }
    console.log('[testFcmSend] Full response body:', JSON.stringify(result, null, 2));

    if (res.ok) {
      console.log('[testFcmSend] ✅ SUCCESS — messageId:', result?.name);
      return Response.json({
        success: true,
        status: res.status,
        messageId: result?.name,
        response: result,
      });
    } else {
      console.error('[testFcmSend] ❌ FAILED');
      if (result?.error) {
        console.error('[testFcmSend] error.code:', result.error.code);
        console.error('[testFcmSend] error.message:', result.error.message);
        console.error('[testFcmSend] error.status:', result.error.status);
        if (result.error.details) {
          console.error('[testFcmSend] error.details:', JSON.stringify(result.error.details, null, 2));
        }
      }
      return Response.json({
        success: false,
        status: res.status,
        statusText: res.statusText,
        error: result?.error || result,
        full_response: result,
      }, { status: res.status });
    }

  } catch (error) {
    console.error('[testFcmSend] EXCEPTION:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});