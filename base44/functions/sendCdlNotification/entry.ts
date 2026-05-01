/**
 * sendCdlNotification — Fonction centrale FCM CDL
 *
 * LOGIQUE DÉFINITIVE (NE PAS MODIFIER) :
 * - Utilise UNIQUEMENT les tokens is_active=true
 * - Désactive un token UNIQUEMENT sur erreur Firebase UNREGISTERED ou INVALID_ARGUMENT
 * - Jamais désactiver un token pour une autre raison
 * - Log clair de chaque tentative avec réponse Firebase exacte
 *
 * Cas 1 : notifier un utilisateur précis → { user_email, title, body, data }
 * Cas 2 : notifier un rôle entier        → { role, title, body, data }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SA_JSON = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') || '';

// Tokens de test à ignorer
const BLACKLISTED_TOKENS = ['test_diagnostic_token', 'test_public_endpoint', 'test_e2e_audit'];
function isTestToken(token) {
  if (!token) return true;
  const t = String(token).toLowerCase();
  return BLACKLISTED_TOKENS.some(b => t.includes(b)) || t.includes('_test_') || t.startsWith('test_');
}

// ── Firebase OAuth2 JWT → Access Token ───────────────────────────────────────
async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: sa.client_email, sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  };
  const enc = (obj) => btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const header = enc({ alg: 'RS256', typ: 'JWT' });
  const pl = enc(payload);
  const input = `${header}.${pl}`;

  const pem = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, '');
  const key = await crypto.subtle.importKey(
    'pkcs8', Uint8Array.from(atob(pem), c => c.charCodeAt(0)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(input));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
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

// ── Envoi FCM à un token ─────────────────────────────────────────────────────
async function sendToToken(accessToken, projectId, fcmToken, title, body, data = {}, urgence = 'normal') {
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  const stringData = {};
  for (const [k, v] of Object.entries(data)) {
    stringData[k] = v == null ? '' : String(v);
  }

  const isUrgent = urgence === 'urgent' || urgence === 'tres_urgent';
  const isTresUrgent = urgence === 'tres_urgent';

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
            channel_id: isTresUrgent ? 'urgent' : 'default',
            sound: 'default',
            visibility: 'PUBLIC',
            default_vibrate_timings: !isTresUrgent,
            notification_priority: isTresUrgent ? 'PRIORITY_MAX' : isUrgent ? 'PRIORITY_HIGH' : 'PRIORITY_DEFAULT',
          },
        },
        webpush: {
          notification: {
            icon: 'https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg',
            badge: 'https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg',
            vibrate: isTresUrgent ? [200, 100, 200, 100, 400] : [200, 100, 200],
            requireInteraction: isUrgent,
          },
        },
      },
    }),
  });

  const result = await res.json();

  // Extraire le code d'erreur Firebase exact
  const errCode = !res.ok
    ? (result?.error?.details?.[0]?.errorCode || result?.error?.status || 'FCM_ERROR')
    : null;

  if (res.ok) {
    console.log(`[sendCdlNotification] ✅ OK → token: ${fcmToken.slice(0, 20)}... | messageId: ${result?.name}`);
  } else {
    console.error(`[sendCdlNotification] ❌ Firebase error=${errCode} | HTTP=${res.status} | token: ${fcmToken.slice(0, 20)}... | response: ${JSON.stringify(result)}`);
  }

  return { ok: res.ok, result, errCode, token: fcmToken };
}

// ── Erreurs Firebase qui justifient la désactivation du token ─────────────────
const FATAL_FCM_ERRORS = ['UNREGISTERED', 'INVALID_ARGUMENT'];

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { user_email, role, title, body: msgBody, data = {}, urgence = 'normal' } = body;

    if (!title || !msgBody) {
      return Response.json({ error: 'title et body requis' }, { status: 400 });
    }
    if (!user_email && !role) {
      return Response.json({ error: 'user_email ou role requis' }, { status: 400 });
    }
    if (!SA_JSON) {
      return Response.json({ error: 'FIREBASE_SERVICE_ACCOUNT_JSON manquant' }, { status: 500 });
    }

    const base44 = createClientFromRequest(req);
    const sa = JSON.parse(SA_JSON);
    const projectId = sa.project_id;
    console.log(`[sendCdlNotification] project_id=${projectId} | user=${user_email || ''} | role=${role || ''} | urgence=${urgence}`);

    const accessToken = await getAccessToken(sa);

    // ── Récupérer les tokens FCM actifs cibles ────────────────────────────────
    let tokenRecords = [];

    if (user_email) {
      tokenRecords = await base44.asServiceRole.entities.FcmToken.filter({
        user_email: user_email.toLowerCase(),
        is_active: true,
      });
      // Filtrer les tokens de test
      tokenRecords = tokenRecords.filter(r => !isTestToken(r.token));
      console.log(`[sendCdlNotification] user=${user_email} → ${tokenRecords.length} token(s) actif(s)`);

    } else if (role === 'admin') {
      const adminUsers = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
      for (const u of adminUsers) {
        const tokens = await base44.asServiceRole.entities.FcmToken.filter({
          user_email: u.email.toLowerCase(),
          is_active: true,
        });
        tokenRecords.push(...tokens.filter(r => !isTestToken(r.token)));
      }
      console.log(`[sendCdlNotification] role=admin → ${tokenRecords.length} token(s) actif(s)`);

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
        tokenRecords.push(...tokens.filter(r => !isTestToken(r.token)));
      }
      console.log(`[sendCdlNotification] role=${role} → ${tokenRecords.length} token(s) actif(s)`);
    }

    if (tokenRecords.length === 0) {
      console.warn('[sendCdlNotification] ⚠️ Aucun token FCM actif trouvé — notifications impossibles');
      return Response.json({ sent: 0, failed: 0, total: 0, note: 'Aucun token FCM actif' });
    }

    // ── Envoi FCM ─────────────────────────────────────────────────────────────
    let sent = 0, failed = 0;
    const logDetails = [];
    const tokensToDeactivate = []; // UNIQUEMENT sur erreur Firebase fatale

    for (const record of tokenRecords) {
      try {
        const { ok, result, errCode } = await sendToToken(
          accessToken, projectId, record.token, title, msgBody, data, urgence
        );

        if (ok) {
          sent++;
          // Mettre à jour last_used sur succès
          base44.asServiceRole.entities.FcmToken.update(record.id, {
            last_used: new Date().toISOString(),
          }).catch(() => {});
          logDetails.push({ user_email: record.user_email, status: 'success', device_type: record.device_type });
        } else {
          failed++;
          logDetails.push({
            user_email: record.user_email,
            status: 'failed',
            error: errCode,
            firebase_response: result,
            device_type: record.device_type,
          });
          // Désactiver UNIQUEMENT sur erreur Firebase fatale confirmée
          if (FATAL_FCM_ERRORS.includes(errCode)) {
            tokensToDeactivate.push(record);
            console.warn(`[sendCdlNotification] ⛔ Token désactivé (${errCode}): ${record.token.slice(0, 20)}...`);
          }
          // Pour toute autre erreur : NE PAS désactiver — peut être temporaire
        }
      } catch (e) {
        failed++;
        console.error('[sendCdlNotification] Erreur envoi:', e.message);
        logDetails.push({ user_email: record.user_email, status: 'error', error: e.message });
      }
    }

    // Désactiver les tokens irrémédiablement invalides (UNREGISTERED / INVALID_ARGUMENT)
    for (const r of tokensToDeactivate) {
      base44.asServiceRole.entities.FcmToken.update(r.id, {
        is_active: false,
        deactivation_reason: 'firebase_fatal_error',
        deactivated_at: new Date().toISOString(),
      }).catch(() => {});
    }

    console.log(`[sendCdlNotification] ✅ DONE — sent=${sent} failed=${failed} total=${tokenRecords.length} deactivated=${tokensToDeactivate.length}`);
    return Response.json({
      sent,
      failed,
      total: tokenRecords.length,
      deactivated: tokensToDeactivate.length,
      details: logDetails,
    });

  } catch (err) {
    console.error('[sendCdlNotification] ERREUR CRITIQUE:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});