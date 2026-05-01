/**
 * sendFcmNotification — Firebase Cloud Messaging HTTP v1
 * OAuth2 via Service Account JSON (FIREBASE_SERVICE_ACCOUNT_JSON)
 * Project: cdl-app-4743c
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ── Encode base64url (RFC 4648) ───────────────────────────────────────────────
function base64url(data) {
  let base64;
  if (typeof data === 'string') {
    base64 = btoa(unescape(encodeURIComponent(data)));
  } else {
    // Uint8Array
    base64 = btoa(String.fromCharCode(...data));
  }
  return base64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// ── Generate OAuth2 access token from Service Account ────────────────────────
async function getAccessToken(sa) {
  if (!sa.private_key || !sa.client_email || !sa.project_id) {
    throw new Error('[OAuth] Service Account JSON invalide — champs manquants: private_key / client_email / project_id');
  }

  console.log('[OAuth] project_id:', sa.project_id);
  console.log('[OAuth] client_email:', sa.client_email);

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

  // Parse PEM private key
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

  console.log('[OAuth] JWT length:', jwt.length, '— sending to token endpoint...');

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
    console.error('[OAuth] ERROR', res.status, JSON.stringify(data));
    throw new Error(`[OAuth] ${res.status} — ${data.error}: ${data.error_description}`);
  }

  console.log('[OAuth] ✅ Access token obtained — expires_in:', data.expires_in);
  return data.access_token;
}

// ── Send FCM message to a single token ───────────────────────────────────────
async function sendToToken(accessToken, projectId, fcmToken, title, body, data = {}) {
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  console.log('[FCM] Sending to token:', fcmToken.slice(0, 25) + '...');

  // Convert all data values to strings (FCM requirement)
  const dataPayload = {};
  for (const [k, v] of Object.entries(data)) {
    dataPayload[k] = String(v);
  }
  // Include title/body in data for Capacitor native handler (app closed)
  dataPayload.title = title;
  dataPayload.body = body;

  const message = {
    token: fcmToken,
    // notification block shows system tray notification even when app is closed
    notification: {
      title,
      body,
    },
    data: dataPayload,
    android: {
      priority: 'high',
      ttl: '86400s',
      notification: {
        channel_id: 'default',
        sound: 'default',
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message }),
  });

  let result;
  try {
    result = await res.json();
  } catch (_) {
    result = { raw: await res.text() };
  }

  if (res.ok) {
    console.log('[FCM] ✅ 200 OK — messageId:', result?.name);
  } else {
    // Full FCM error details
    const errCode    = result?.error?.code;
    const errMsg     = result?.error?.message;
    const errStatus  = result?.error?.status;
    const errDetails = JSON.stringify(result?.error?.details || []);
    console.error(`[FCM] ❌ ${res.status} ERROR`);
    console.error('[FCM] error.code:', errCode);
    console.error('[FCM] error.message:', errMsg);
    console.error('[FCM] error.status:', errStatus);
    console.error('[FCM] error.details:', errDetails);
  }

  return { ok: res.ok, status: res.status, result, token: fcmToken };
}

// ── Main handler ──────────────────────────────────────────────────────────────
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

    // Load and parse service account
    const rawJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') || '';
    if (!rawJson) {
      return Response.json({ error: 'Secret FIREBASE_SERVICE_ACCOUNT_JSON manquant' }, { status: 500 });
    }

    let sa;
    try {
      sa = JSON.parse(rawJson);
    } catch (e) {
      return Response.json({ error: 'FIREBASE_SERVICE_ACCOUNT_JSON invalide (JSON parse error): ' + e.message }, { status: 500 });
    }

    const projectId = sa.project_id;
    console.log('[sendFcmNotification] project_id:', projectId);
    console.log('[sendFcmNotification] client_email:', sa.client_email);

    // Get OAuth2 access token
    const accessToken = await getAccessToken(sa);

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

    // Send to all tokens
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
        const errStatus = r.status === 'fulfilled' ? r.value.result?.error?.status : null;
        details.push({ token: fcmTokens[i].slice(0, 20) + '...', status: 'failed', error: errResult });

        // Auto-disable invalid tokens
        if (errStatus === 'NOT_FOUND' || errStatus === 'INVALID_ARGUMENT') {
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