/**
 * validateFirebaseSend — Test PUR du backend Firebase
 * 
 * Objective:
 * 1. Load Firebase service account
 * 2. Generate OAuth2 token
 * 3. Get ONE real FCM token from database
 * 4. Send notification via FCM HTTP v1 API
 * 5. Log EVERY step and full Firebase response
 * 6. Return success or complete Firebase error
 * 
 * NO APK involved. Pure backend test.
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

Deno.serve(async (req) => {
  const logs = [];
  const log = (msg) => {
    console.log(msg);
    logs.push(msg);
  };

  try {
    log('[VALIDATION] === Firebase Backend Send Test ===');

    // ── 1. Load service account ──────────────────────────────────────────────
    log('[1] Loading Firebase service account...');
    const rawJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') || '';
    if (!rawJson) {
      log('❌ FIREBASE_SERVICE_ACCOUNT_JSON not set');
      return Response.json({
        success: false,
        step: 'load_sa',
        error: 'Missing FIREBASE_SERVICE_ACCOUNT_JSON secret',
        logs,
      }, { status: 200 });
    }

    let sa;
    try {
      sa = JSON.parse(rawJson);
    } catch (e) {
      log('❌ Service account JSON parse error: ' + e.message);
      return Response.json({
        success: false,
        step: 'parse_sa',
        error: 'Invalid JSON in FIREBASE_SERVICE_ACCOUNT_JSON',
        logs,
      }, { status: 200 });
    }

    log(`✅ Service account loaded`);
    log(`   - client_email: ${sa.client_email}`);
    log(`   - project_id: ${sa.project_id}`);
    log(`   - Has private_key: ${!!sa.private_key}`);

    // ── 2. Get OAuth2 token ──────────────────────────────────────────────────
    log('[2] Getting OAuth2 access token...');
    let accessToken;
    try {
      accessToken = await getAccessToken(sa);
      log(`✅ OAuth2 token obtained (${accessToken.substring(0, 30)}...)`);
    } catch (e) {
      log('❌ OAuth2 failed: ' + e.message);
      return Response.json({
        success: false,
        step: 'oauth2',
        error: e.message,
        logs,
      }, { status: 200 });
    }

    // ── 3. Get one FCM token from database ────────────────────────────────────
    log('[3] Fetching FCM token from database...');
    const base44 = createClientFromRequest(req);

    let fcmTokens;
    try {
      fcmTokens = await base44.asServiceRole.entities.FcmToken.filter(
        { is_active: true },
        '-registered_at',
        1
      );
    } catch (e) {
      log('❌ Failed to fetch tokens: ' + e.message);
      return Response.json({
        success: false,
        step: 'fetch_tokens',
        error: e.message,
        logs,
      }, { status: 200 });
    }

    if (!fcmTokens || fcmTokens.length === 0) {
      log('❌ No active FCM tokens in database');
      return Response.json({
        success: false,
        step: 'no_tokens',
        error: 'No active FCM tokens found',
        logs,
      }, { status: 200 });
    }

    const token = fcmTokens[0];
    log(`✅ Token found:`);
    log(`   - User: ${token.user_email}`);
    log(`   - Device: ${token.device_type}`);
    log(`   - Registered: ${token.registered_at}`);
    log(`   - Token: ${token.token.substring(0, 50)}...`);

    // ── 4. Send notification via FCM HTTP v1 ────────────────────────────────
    log('[4] Sending notification via FCM HTTP v1...');

    const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
    const message = {
      token: token.token,
      notification: {
        title: '✅ Validation Backend — Notification Test',
        body: 'Cette notification vient du serveur Firebase.',
      },
      data: {
        test: 'validation_backend',
        timestamp: new Date().toISOString(),
      },
      android: {
        priority: 'HIGH',
        notification: {
          channel_id: 'default',
        },
      },
    };

    log(`   URL: ${url}`);
    log(`   Method: POST`);
    log(`   Payload: ${JSON.stringify(message, null, 2)}`);

    const fcmRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    });

    let fcmData;
    try {
      fcmData = await fcmRes.json();
    } catch (_) {
      const text = await fcmRes.text();
      log(`   Raw response: ${text}`);
      fcmData = { raw: text };
    }

    log(`   Status: ${fcmRes.status} ${fcmRes.statusText}`);
    log(`   Response: ${JSON.stringify(fcmData, null, 2)}`);

    if (fcmRes.ok) {
      log(`✅ ✅ ✅ NOTIFICATION SENT SUCCESSFULLY ✅ ✅ ✅`);
      log(`   Message ID: ${fcmData.name}`);
      return Response.json({
        success: true,
        step: 'send_complete',
        message_id: fcmData.name,
        user_email: token.user_email,
        device_type: token.device_type,
        logs,
      }, { status: 200 });
    } else {
      log(`❌ FCM rejected request`);
      log(`   Error code: ${fcmData.error?.code}`);
      log(`   Error message: ${fcmData.error?.message}`);
      log(`   Error status: ${fcmData.error?.status}`);
      if (fcmData.error?.details) {
        log(`   Details: ${JSON.stringify(fcmData.error.details, null, 2)}`);
      }

      return Response.json({
        success: false,
        step: 'fcm_error',
        http_status: fcmRes.status,
        firebase_error_code: fcmData.error?.code,
        firebase_error_message: fcmData.error?.message,
        firebase_error_status: fcmData.error?.status,
        firebase_error_details: fcmData.error?.details,
        logs,
      }, { status: 200 });
    }

  } catch (error) {
    log(`❌ EXCEPTION: ${error.message}`);
    return Response.json({
      success: false,
      step: 'exception',
      error: error.message,
      logs,
    }, { status: 200 });
  }
});