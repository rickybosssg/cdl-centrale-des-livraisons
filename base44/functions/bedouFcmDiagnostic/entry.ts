/**
 * bedouFcmDiagnostic — Diagnostic complet du flux FCM Bedou
 * 
 * Vérifie :
 * 1. Admins trouvés
 * 2. Tokens FCM admin enregistrés
 * 3. Token partiel + metadata
 * 4. Envoie un test FCM direct à tous les tokens admin
 * 
 * Retourne les logs complets pour identifier le problème
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

async function getOAuthToken(sa) {
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

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );

  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(signingInput));
  const jwt = `${signingInput}.${base64url(new Uint8Array(sig))}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`OAuth2 failed: ${data.error}`);
  return data.access_token;
}

async function sendFcmTest(accessToken, projectId, token, title, body) {
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        notification: { title, body },
        data: { type: 'test_diagnostic', test_mode: 'true' },
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
      },
    }),
  });

  const result = await res.json().catch(() => ({}));
  return {
    ok: res.status === 200,
    status: res.status,
    msgId: result?.name,
    error: result?.error?.message,
  };
}

Deno.serve(async (req) => {
  const t0 = Date.now();
  const logs = [];
  const L = (msg) => { logs.push(msg); console.log(`[BEDOU_FCM_DIAG] ${msg}`); };

  try {
    L('=== START DIAGNOSTIC ===');

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    L(`user_actuel=${user.email}`);

    // ── ÉTAPE 1 : Récupérer admins ──────────────────────────────────────────
    const allUsers = await base44.asServiceRole.entities.User.list(null, 200);
    const admins = allUsers.filter(u => u.role === 'admin' || (u.data?.user_roles && u.data.user_roles.includes('admin')));
    L(`admins_trouvés=${admins.length}`);
    admins.forEach(a => L(`  - ${a.email}`));

    // ── ÉTAPE 2 : Récupérer tokens FCM actifs ───────────────────────────────
    const allTokens = await base44.asServiceRole.entities.FcmToken.filter({ is_active: true });
    L(`tokens_fcm_total_actifs=${allTokens.length}`);

    // ── ÉTAPE 3 : Matcher tokens avec admins ────────────────────────────────
    const adminEmails = admins.map(a => a.email.toLowerCase());
    const adminTokens = allTokens.filter(t => adminEmails.includes((t.user_email || '').toLowerCase()));
    L(`tokens_admin_trouvés=${adminTokens.length}`);
    adminTokens.forEach(t => {
      L(`  - email=${t.user_email} device=${t.device_id || 'unknown'} token=${(t.token || '').slice(0, 20)}... registered=${t.registered_at}`);
    });

    // ── ÉTAPE 4 : Afficher tokens non-matchés ───────────────────────────────
    const nonAdminTokens = allTokens.filter(t => !adminEmails.includes((t.user_email || '').toLowerCase()));
    if (nonAdminTokens.length > 0) {
      L(`tokens_non_admin=${nonAdminTokens.length}`);
      nonAdminTokens.forEach(t => {
        L(`  - email=${t.user_email} device=${t.device_id || 'unknown'} token=${(t.token || '').slice(0, 20)}...`);
      });
    }

    // ── ÉTAPE 5 : Test FCM direct ───────────────────────────────────────────
    if (adminTokens.length > 0) {
      L('test_fcm_start');
      const sa = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') || '{}');
      const accessToken = await getOAuthToken(sa);

      for (const tokenRecord of adminTokens) {
        try {
          const result = await sendFcmTest(accessToken, sa.project_id, tokenRecord.token, '🧪 Test Diagnostic Bedou', 'Si tu vois ce message, FCM fonctionne');
          L(`  fcm_test result=${JSON.stringify(result)}`);
          if (!result.ok) {
            L(`  fcm_test_failed: ${result.error}`);
            if (result.status === 404 || result.status === 400) {
              L(`  action: ce token devrait être désactivé (${result.status})`);
            }
          } else {
            L(`  fcm_test_success: msgId=${result.msgId}`);
          }
        } catch (e) {
          L(`  fcm_test_error: ${e.message}`);
        }
      }
    }

    L(`=== DIAGNOSTIC COMPLETE === elapsed=${Date.now() - t0}ms`);

    return Response.json({
      status: 'ok',
      admins_count: admins.length,
      tokens_total: allTokens.length,
      admin_tokens_found: adminTokens.length,
      elapsed_ms: Date.now() - t0,
      logs,
    });
  } catch (err) {
    L(`ERROR: ${err.message}`);
    return Response.json({ error: err.message, logs }, { status: 500 });
  }
});