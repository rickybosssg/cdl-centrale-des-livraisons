/**
 * sendCdlNotification — Fonction centrale FCM CDL
 *
 * Appelée depuis les automations via base44.functions.invoke (avec token auto)
 * ou depuis le frontend (avec token utilisateur).
 *
 * Cas 1 : notifier un utilisateur précis → { user_email, title, body, data }
 * Cas 2 : notifier un rôle entier       → { role, title, body, data }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SA_JSON = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') || '';

// ── Firebase OAuth2 JWT → Access Token ───────────────────────────────────────
async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: sa.client_email, sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  };
  const enc = (obj) => btoa(JSON.stringify(obj)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const header = enc({ alg: 'RS256', typ: 'JWT' });
  const pl     = enc(payload);
  const input  = `${header}.${pl}`;

  const pem = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, '');
  const key = await crypto.subtle.importKey(
    'pkcs8', Uint8Array.from(atob(pem), c => c.charCodeAt(0)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(input));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const jwt = `${input}.${sigB64}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const d = await res.json();
  if (!d.access_token) throw new Error('OAuth failed: ' + JSON.stringify(d));
  return d.access_token;
}

// ── Envoi FCM à un token ──────────────────────────────────────────────────────
async function sendToToken(accessToken, projectId, fcmToken, title, body, data = {}) {
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  const stringData = {};
  for (const [k, v] of Object.entries(data)) {
    stringData[k] = v == null ? '' : String(v);
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token: fcmToken,
        notification: { title, body },
        data: stringData,
        android: {
          priority: 'high',
          notification: {
            channel_id: 'default',
            sound: 'default',
            visibility: 'PUBLIC',
            default_vibrate_timings: true,
            notification_priority: 'PRIORITY_MAX',
          },
        },
        webpush: {
          notification: {
            icon: 'https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg',
            badge: 'https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg',
            vibrate: [200, 100, 200],
          },
        },
      },
    }),
  });
  const result = await res.json();
  if (!res.ok) {
    console.warn(`[sendCdlNotification] FCM HTTP ${res.status}:`, JSON.stringify(result));
  }
  return { ok: res.ok, result, token: fcmToken };
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { user_email, role, title, body: msgBody, data = {} } = body;

    if (!title || !msgBody) {
      return Response.json({ error: 'title et body requis' }, { status: 400 });
    }
    if (!user_email && !role) {
      return Response.json({ error: 'user_email ou role requis' }, { status: 400 });
    }
    if (!SA_JSON) {
      return Response.json({ error: 'FIREBASE_SERVICE_ACCOUNT_JSON manquant' }, { status: 500 });
    }

    // asServiceRole fonctionne toujours dans les fonctions hébergées Base44
    // (que ce soit un appel frontend avec token ou un appel inter-fonction SDK)
    const base44 = createClientFromRequest(req);
    const sa = JSON.parse(SA_JSON);
    const projectId = sa.project_id;
    console.log(`[sendCdlNotification] project_id=${projectId} | user=${user_email || ''} | role=${role || ''}`);

    const accessToken = await getAccessToken(sa);

    // ── Récupérer les tokens FCM cibles ───────────────────────────────────────
    let tokenRecords = [];

    if (user_email) {
      tokenRecords = await base44.asServiceRole.entities.FcmToken.filter({
        user_email: user_email.toLowerCase(),
        is_active: true,
      });
      console.log(`[sendCdlNotification] user=${user_email} → ${tokenRecords.length} token(s)`);

    } else if (role === 'admin') {
      const adminUsers = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
      for (const u of adminUsers) {
        const tokens = await base44.asServiceRole.entities.FcmToken.filter({
          user_email: u.email.toLowerCase(),
          is_active: true,
        });
        tokenRecords.push(...tokens);
      }
      console.log(`[sendCdlNotification] role=admin → ${tokenRecords.length} token(s)`);

    } else if (role) {
      const profiles = await base44.asServiceRole.entities.UserProfile.filter({
        profile_type: role,
        status: 'actif',
        deleted: false,
      });
      const emails = [...new Set(profiles.map(p => p.user_email.toLowerCase()))];
      for (const email of emails) {
        const tokens = await base44.asServiceRole.entities.FcmToken.filter({
          user_email: email,
          is_active: true,
        });
        tokenRecords.push(...tokens);
      }
      console.log(`[sendCdlNotification] role=${role} → ${tokenRecords.length} token(s)`);
    }

    if (tokenRecords.length === 0) {
      console.warn('[sendCdlNotification] Aucun token FCM actif trouvé');
      return Response.json({ sent: 0, failed: 0, total: 0, note: 'Aucun token FCM actif' });
    }

    // ── Envoi FCM ─────────────────────────────────────────────────────────────
    let sent = 0, failed = 0;
    const invalidRecords = [];

    for (const record of tokenRecords) {
      try {
        const { ok, result } = await sendToToken(accessToken, projectId, record.token, title, msgBody, data);
        if (ok) {
          sent++;
          console.log(`[sendCdlNotification] ✅ sent to ${record.user_email}`);
        } else {
          failed++;
          const errCode = result?.error?.details?.[0]?.errorCode || result?.error?.status || '';
          console.warn(`[sendCdlNotification] ❌ FCM error=${errCode} | user=${record.user_email}`);
          if (['UNREGISTERED', 'INVALID_ARGUMENT'].includes(errCode)) {
            invalidRecords.push(record);
          }
        }
      } catch (e) {
        failed++;
        console.error('[sendCdlNotification] send error:', e.message);
      }
    }

    // Désactiver les tokens invalides (best-effort)
    for (const r of invalidRecords) {
      base44.asServiceRole.entities.FcmToken.update(r.id, { is_active: false }).catch(() => {});
      console.log(`[sendCdlNotification] Token désactivé: ${r.token?.slice(0, 20)}...`);
    }

    console.log(`[sendCdlNotification] ✅ sent=${sent} failed=${failed} total=${tokenRecords.length}`);
    return Response.json({ sent, failed, total: tokenRecords.length });

  } catch (err) {
    console.error('[sendCdlNotification] ERREUR:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});