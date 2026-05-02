/**
 * sendFcmNotificationSafe — Alias de sendFcmNotification avec même logique FCM v1
 * Payload : notification + data + android HIGH priority
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
  const headerB64  = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payloadB64 = base64url(JSON.stringify({
    iss: sa.client_email,
    sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  }));
  const signingInput = `${headerB64}.${payloadB64}`;
  const pem = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\r\n|\n|\r/g, '');
  const binaryKey = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey('pkcs8', binaryKey.buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(signingInput));
  const jwt = `${signingInput}.${base64url(new Uint8Array(sig))}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(`OAuth2 failed: ${data.error}`);
  return data.access_token;
}

async function sendToToken(accessToken, projectId, fcmToken, title, body, dataPayload = {}) {
  const strData = {};
  for (const [k, v] of Object.entries(dataPayload)) strData[k] = String(v);
  strData.title = title;
  strData.body = body;

  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token: fcmToken,
        notification: { title, body },
        data: strData,
        android: {
          priority: 'HIGH',
          ttl: '86400s',
          notification: {
            channel_id: 'default',
            sound: 'default',
            notification_priority: 'PRIORITY_HIGH',
            visibility: 'PUBLIC',
          },
        },
      },
    }),
  });
  const result = await res.json().catch(() => ({}));
  console.log(`[FCM-Safe] token=${fcmToken.slice(0, 20)}... status=${res.status} ok=${res.ok}`);
  return { ok: res.ok, status: res.status, result, token: fcmToken };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const { recipient_email, user_email, title, body, data = {} } = payload;
    const targetEmail = recipient_email || user_email;

    if (!targetEmail || !title || !body) {
      return Response.json({ error: 'recipient_email (ou user_email), title, body requis' }, { status: 400 });
    }

    const rawJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') || '';
    if (!rawJson) return Response.json({ error: 'FIREBASE_SERVICE_ACCOUNT_JSON manquant' }, { status: 500 });
    const sa = JSON.parse(rawJson);

    const tokens = await base44.asServiceRole.entities.FcmToken.filter({ user_email: targetEmail, is_active: true });
    if (!tokens || tokens.length === 0) {
      console.log(`[FCM-Safe] Aucun token actif pour: ${targetEmail}`);
      return Response.json({ success: false, message: 'Aucun token actif', tokens_sent: 0 });
    }

    console.log(`[FCM-Safe] ${tokens.length} token(s) pour: ${targetEmail}`);
    const accessToken = await getAccessToken(sa);

    const results = await Promise.allSettled(
      tokens.map(r => sendToToken(accessToken, sa.project_id, r.token, title, body, data))
    );

    let sent = 0, failed = 0;
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === 'fulfilled' && r.value.ok) {
        sent++;
        await base44.asServiceRole.entities.FcmToken.update(tokens[i].id, { last_used: new Date().toISOString() }).catch(() => {});
      } else {
        failed++;
        const errStatus = r.status === 'fulfilled' ? r.value?.result?.error?.status : null;
        if (errStatus === 'NOT_FOUND' || errStatus === 'INVALID_ARGUMENT') {
          base44.asServiceRole.entities.FcmToken.update(tokens[i].id, { is_active: false }).catch(() => {});
        }
      }
    }

    return Response.json({ success: sent > 0, tokens_sent: sent, tokens_failed: failed, total: tokens.length });
  } catch (error) {
    console.error('[FCM-Safe] FATAL:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});