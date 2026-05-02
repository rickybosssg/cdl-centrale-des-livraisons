/**
 * sendCdlNotification — Fonction centrale CDL
 * Double notification : interne BDD + push FCM Android
 *
 * PAYLOAD FCM OBLIGATOIRE :
 * - notification.title + notification.body
 * - data.type, data.screen, data.id (notif_route)
 * - android.priority HIGH + channel importance HIGH
 * - default_sound/vibrate/light_settings = true
 *
 * Cas 1 : notifier un utilisateur précis → { user_email, title, body, data }
 * Cas 2 : notifier un rôle entier        → { role, title, body, data }
 *
 * RÈGLE : jamais bloquer l'action principale si push échoue.
 * LOGS : action, destinataires, tokens, sent, failed, délai total.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SA_JSON = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') || '';

const BLACKLISTED_TOKENS = ['test_diagnostic_token', 'test_public_endpoint', 'test_e2e_audit'];
function isTestToken(token) {
  if (!token) return true;
  const t = String(token).toLowerCase();
  return BLACKLISTED_TOKENS.some(b => t.includes(b)) || t.includes('_test_') || t.startsWith('test_');
}

// ── Firebase OAuth2 ───────────────────────────────────────────────────────────
async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const enc = (obj) => btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const header = enc({ alg: 'RS256', typ: 'JWT' });
  const pl = enc({
    iss: sa.client_email, sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  });
  const input = `${header}.${pl}`;
  const pem = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\r\n|\n|\r/g, '');
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

// ── Envoi FCM v1 ──────────────────────────────────────────────────────────────
async function sendToToken(accessToken, projectId, fcmToken, title, body, data = {}, urgence = 'normal') {
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  // Tous les champs data en string (obligatoire FCM)
  const stringData = {};
  for (const [k, v] of Object.entries(data)) {
    stringData[k] = v == null ? '' : String(v);
  }
  // Toujours inclure title/body dans data pour app fermée
  stringData.title = title;
  stringData.body = body;

  const isTresUrgent = urgence === 'tres_urgent';

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token: fcmToken,
        // notification block obligatoire pour affichage system tray (app fermée)
        notification: { title, body },
        // data block pour deep link et foreground handler
        data: stringData,
        android: {
          priority: 'HIGH',
          ttl: '86400s',
          notification: {
            channel_id: isTresUrgent ? 'urgent' : 'default',
            sound: 'default',
            visibility: 'PUBLIC',
            notification_priority: isTresUrgent ? 'PRIORITY_MAX' : 'PRIORITY_HIGH',
            default_sound: true,
            default_vibrate_timings: true,
            default_light_settings: true,
          },
        },
        webpush: {
          notification: {
            icon: 'https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg',
            badge: 'https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg',
            requireInteraction: isTresUrgent,
          },
        },
      },
    }),
  });

  const result = await res.json().catch(() => ({}));
  const errCode = !res.ok
    ? (result?.error?.details?.[0]?.errorCode || result?.error?.status || 'FCM_ERROR')
    : null;

  if (res.ok) {
    console.log(`[CDL-FCM] ✅ OK → token:${fcmToken.slice(0, 20)}... msgId:${result?.name}`);
  } else {
    console.error(`[CDL-FCM] ❌ err=${errCode} HTTP=${res.status} token:${fcmToken.slice(0, 20)}...`);
  }
  return { ok: res.ok, result, errCode, token: fcmToken };
}

// ── Notification interne BDD ──────────────────────────────────────────────────
async function createInternalNotif(base44, { destinataire_email, title, body, data = {}, notifType = 'info' }) {
  try {
    // Mapper data.type → notifType CDL
    const typeMap = {
      bedou_recharge_request: 'warning',
      bedou_recharge_approved: 'success',
      bedou_recharge_rejected: 'danger',
      bedou_withdrawal_request: 'warning',
      bedou_withdrawal_approved: 'success',
      bedou_withdrawal_rejected: 'danger',
      new_course: 'info',
      course_created: 'success',
      course_assigned: 'warning',
      course_accepted: 'success',
      course_in_progress: 'info',
      course_delivered: 'success',
      course_delivered_driver: 'success',
      course_cancelled: 'danger',
      payment_validated: 'success',
      new_profile_request: 'warning',
      profile_pending_review: 'warning',
      profile_validated: 'success',
      profile_refused: 'danger',
      profile_suspended: 'danger',
      new_order: 'info',
      new_marketplace_order: 'info',
      order_accepted: 'success',
      order_delivering: 'info',
      order_delivered: 'success',
      order_cancelled: 'danger',
    };
    const type = typeMap[data?.type] || notifType;
    await base44.asServiceRole.entities.Notification.create({
      destinataire_email,
      titre: title,
      message: body,
      type,
      lue: false,
      target_screen: data?.notif_route || '/',
      target_entity_type: data?.entity_type || '',
      target_entity_id: data?.entity_id || '',
    });
  } catch (e) {
    console.warn('[CDL-Notif] Notif interne BDD échouée (non-fatal):', e.message);
  }
}

const FATAL_FCM_ERRORS = ['UNREGISTERED', 'INVALID_ARGUMENT'];

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const t0 = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const { user_email, role, title, body: msgBody, data = {}, urgence = 'normal' } = body;

    if (!title || !msgBody) {
      return Response.json({ error: 'title et body requis' }, { status: 400 });
    }
    if (!user_email && !role) {
      return Response.json({ error: 'user_email ou role requis' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    console.log(`[sendCdlNotification] START | user=${user_email || ''} | role=${role || ''} | type=${data?.type || ''} | urgence=${urgence}`);

    // ── 1. Résoudre les destinataires (emails) ────────────────────────────────
    let targetEmails = [];

    if (user_email) {
      targetEmails = [user_email.toLowerCase()];
    } else if (role === 'admin') {
      const adminUsers = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
      targetEmails = adminUsers.map(u => u.email.toLowerCase());
      console.log(`[sendCdlNotification] admins trouvés: ${targetEmails.length} → ${targetEmails.join(', ')}`);
    } else if (role) {
      const profiles = await base44.asServiceRole.entities.UserProfile.filter({
        profile_type: role,
        status: 'actif',
        deleted: false,
      });
      targetEmails = [...new Set(profiles.map(p => p.user_email.toLowerCase()))];
      console.log(`[sendCdlNotification] role=${role} → ${targetEmails.length} profil(s) actif(s)`);
    }

    if (targetEmails.length === 0) {
      console.warn(`[sendCdlNotification] ⚠️ Aucun destinataire trouvé — skip | +${Date.now() - t0}ms`);
      return Response.json({ sent: 0, failed: 0, total: 0, note: 'Aucun destinataire' });
    }
    console.log(`[sendCdlNotification] Destinataires: ${targetEmails.length}`);

    // ── 2. Notifications internes BDD (SYNCHRONES, toujours) ─────────────────
    await Promise.allSettled(
      targetEmails.map(email => createInternalNotif(base44, {
        destinataire_email: email,
        title,
        body: msgBody,
        data,
      }))
    );
    console.log(`[sendCdlNotification] Notifs internes BDD créées | +${Date.now() - t0}ms`);

    // ── 3. FCM Push ──────────────────────────────────────────────────────────
    if (!SA_JSON) {
      console.warn('[sendCdlNotification] FIREBASE_SERVICE_ACCOUNT_JSON manquant — skip FCM');
      return Response.json({ sent: 0, failed: 0, total: 0, note: 'FCM désactivé' });
    }

    // Récupérer tous les tokens actifs des destinataires en parallèle
    const tokenResults = await Promise.allSettled(
      targetEmails.map(email => base44.asServiceRole.entities.FcmToken.filter({
        user_email: email,
        is_active: true,
      }))
    );

    let tokenRecords = [];
    for (const r of tokenResults) {
      if (r.status === 'fulfilled') {
        tokenRecords.push(...(r.value || []).filter(t => !isTestToken(t.token)));
      }
    }

    console.log(`[sendCdlNotification] Tokens FCM actifs: ${tokenRecords.length} | +${Date.now() - t0}ms`);

    if (tokenRecords.length === 0) {
      console.warn('[sendCdlNotification] ⚠️ Aucun token FCM actif');
      return Response.json({ sent: 0, failed: 0, total: 0, note: 'Aucun token FCM' });
    }

    const sa = JSON.parse(SA_JSON);
    const projectId = sa.project_id;
    const accessToken = await getAccessToken(sa);

    let sent = 0, failed = 0;
    const tokensToDeactivate = [];

    const fcmResults = await Promise.allSettled(
      tokenRecords.map(record => sendToToken(accessToken, projectId, record.token, title, msgBody, data, urgence))
    );

    for (let i = 0; i < fcmResults.length; i++) {
      const r = fcmResults[i];
      if (r.status === 'fulfilled' && r.value.ok) {
        sent++;
        base44.asServiceRole.entities.FcmToken.update(tokenRecords[i].id, {
          last_used: new Date().toISOString(),
        }).catch(() => {});
      } else {
        failed++;
        const errCode = r.status === 'fulfilled' ? r.value.errCode : 'EXCEPTION';
        if (FATAL_FCM_ERRORS.includes(errCode)) {
          tokensToDeactivate.push(tokenRecords[i]);
        }
      }
    }

    // Désactiver tokens invalides (UNREGISTERED/INVALID_ARGUMENT)
    for (const r of tokensToDeactivate) {
      base44.asServiceRole.entities.FcmToken.update(r.id, {
        is_active: false,
        deactivation_reason: 'firebase_fatal_error',
        deactivated_at: new Date().toISOString(),
      }).catch(() => {});
    }

    const elapsed = Date.now() - t0;
    console.log(`[sendCdlNotification] ✅ DONE | sent=${sent} failed=${failed} total=${tokenRecords.length} deactivated=${tokensToDeactivate.length} | délai=${elapsed}ms`);
    return Response.json({ sent, failed, total: tokenRecords.length, deactivated: tokensToDeactivate.length, elapsed_ms: elapsed });

  } catch (err) {
    console.error('[sendCdlNotification] ERREUR CRITIQUE:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});