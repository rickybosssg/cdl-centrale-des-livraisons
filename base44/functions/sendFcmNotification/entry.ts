/**
 * sendFcmNotification — Firebase Cloud Messaging HTTP v1
 * Uses same working logic as testFcmSend (which successfully receives notifications on Android)
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

  return data.access_token;
}

async function sendToToken(accessToken, projectId, fcmToken, title, body, data = {}) {
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  // Build data payload - convert all to strings
  const dataPayload = {};
  for (const [k, v] of Object.entries(data)) {
    dataPayload[k] = String(v);
  }
  dataPayload.title = title;
  dataPayload.body = body;

  // Exact FCM v1 format (same as testFcmSend which works)
  const message = {
    token: fcmToken,
    notification: {
      title,
      body,
    },
    data: dataPayload,
    android: {
      priority: 'HIGH',
      ttl: '86400s',
      notification: {
        channel_id: 'default',
        sound: 'default',
        notification_priority: 'PRIORITY_MAX',
        visibility: 'PUBLIC',
        default_sound: true,
        default_vibrate_timings: true,
        default_light_settings: true,
      },
    },
  };

  const requestBody = { message };

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
    console.error('[FCM] JSON parse error:', parseErr.message);
    console.error('[FCM] Raw response:', rawText);
    result = { raw: rawText };
  }

  if (res.ok) {
    console.log('[FCM] ✅ 200 OK — messageId:', result?.name, '| token:', fcmToken.slice(0, 25));
  } else {
    console.error('[FCM] ❌ Status', res.status, '| token:', fcmToken.slice(0, 25));
    console.error('[FCM] Full response:', JSON.stringify(result, null, 2));
    if (result?.error?.details) {
      console.error('[FCM] error.details:', JSON.stringify(result.error.details));
    }
  }

  return { ok: res.ok, status: res.status, result, token: fcmToken };
}

Deno.serve(async (req) => {
  try {
    const bodyText = await req.text();
    let parsedBody = {};
    try { parsedBody = JSON.parse(bodyText); } catch (_) {}

    // Support auth_token in body for native Android clients
    const bodyAuthToken = parsedBody.auth_token || '';
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    let effectiveReq = req;
    if (!authHeader && bodyAuthToken) {
      const newHeaders = new Headers(req.headers);
      newHeaders.set('Authorization', `Bearer ${bodyAuthToken}`);
      effectiveReq = new Request(req.url, { method: req.method, headers: newHeaders });
    }

    const base44 = createClientFromRequest(effectiveReq);
    const { user_email, tokens: directTokens, title, body, data = {} } = parsedBody;

    if (!title || !body) {
      return Response.json({ error: 'title et body sont requis' }, { status: 400 });
    }

    // Load Service Account
    const rawJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') || '';
    if (!rawJson) {
      return Response.json({ error: 'Secret FIREBASE_SERVICE_ACCOUNT_JSON manquant' }, { status: 500 });
    }

    let sa;
    try {
      sa = JSON.parse(rawJson);
    } catch (e) {
      return Response.json({ error: 'FIREBASE_SERVICE_ACCOUNT_JSON parse error: ' + e.message }, { status: 500 });
    }

    const projectId = sa.project_id;
    console.log('[sendFcmNotification] project_id:', projectId);

    // Get OAuth2 access token
    const accessToken = await getAccessToken(sa);
    console.log('[sendFcmNotification] OAuth2 token obtained');

    // Resolve FCM tokens
    let fcmTokens = Array.isArray(directTokens) ? directTokens : [];
    if (user_email && fcmTokens.length === 0) {
      const records = await base44.asServiceRole.entities.FcmToken.filter({
        user_email,
        is_active: true,
      });
      fcmTokens = records.map(r => r.token).filter(Boolean);
      console.log('[sendFcmNotification] Tokens found for', user_email, ':', fcmTokens.length);
    }

    if (fcmTokens.length === 0) {
      return Response.json({
        success: false,
        sent: 0,
        message: `Aucun token FCM actif pour ${user_email}`,
      });
    }

    // Send to all tokens in parallel
    const results = await Promise.allSettled(
      fcmTokens.map(token => sendToToken(accessToken, projectId, token, title, body, data))
    );

    let sent = 0;
    let failed = 0;
    const details = [];

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === 'fulfilled' && r.value.ok) {
        sent++;
        details.push({ token: fcmTokens[i].slice(0, 20) + '...', status: 'ok', messageId: r.value.result?.name });
      } else {
        failed++;
        const errResult = r.status === 'fulfilled' ? r.value.result : { error: r.reason?.message };
        details.push({ token: fcmTokens[i].slice(0, 20) + '...', status: 'failed', error: errResult });

        // Auto-disable invalid tokens
        if (r.status === 'fulfilled' && r.value.result?.error?.status === 'NOT_FOUND') {
          try {
            const records = await base44.asServiceRole.entities.FcmToken.filter({ token: fcmTokens[i] });
            if (records?.[0]) {
              await base44.asServiceRole.entities.FcmToken.update(records[0].id, { is_active: false });
              console.log('[FCM] Token marked inactive:', fcmTokens[i].slice(0, 25));
            }
          } catch (_) {}
        }
      }
    }

    console.log(`[sendFcmNotification] DONE — sent: ${sent} | failed: ${failed}`);

    return Response.json({
      success: sent > 0,
      sent,
      failed,
      total: fcmTokens.length,
      details,
    });

  } catch (error) {
    console.error('[sendFcmNotification] FATAL:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});