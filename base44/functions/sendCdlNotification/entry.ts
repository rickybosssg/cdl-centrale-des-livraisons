/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  sendCdlNotification — SYSTÈME VERROUILLÉ v4.0 — SOURCE UNIQUE CDL    ║
 * ║  CANAL OFFICIEL UNIQUE = cdl_critical_alerts_v2                         ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║  🔒 CANAL VERROUILLÉ : cdl_critical_alerts_v2 (importance=HIGH)        ║
 * ║  🔒 FCM_TOKEN_LOCK : 1 seul token actif par user_email                 ║
 * ║     → cleanup automatique des doublons avant chaque push               ║
 * ║     → UNREGISTERED → suppression auto                                  ║
 * ║     → sélection du token le plus récent (last_used ou registered_at)   ║
 * ║  🔒 ANTI-DOUBLON : clé event_type+entity_id+recipient_email (60s)     ║
 * ║  🔒 LOG OBLIGATOIRE : [CDL_PUSH_SENT] sur chaque push réussi           ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * RÈGLE ABSOLUE :
 * Toute notification CDL (push Android + BDD interne) DOIT passer par cette fonction.
 * Aucune logique FCM directe n'est autorisée dans les autres fonctions.
 *
 * Modules couverts :
 *   Bedou recharge/retrait · Courses · Dispatch livreur · Profils
 *   Commandes Mall · Publicités · Messages
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SA_JSON = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') || '';

// ── Helpers ───────────────────────────────────────────────────────────────────

const BLACKLISTED_TOKENS = ['test_diagnostic_token', 'test_public_endpoint', 'test_e2e_audit'];
function isTestToken(token) {
  if (!token) return true;
  const t = String(token).toLowerCase();
  return BLACKLISTED_TOKENS.some(b => t.includes(b)) || t.includes('_test_') || t.startsWith('test_');
}

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

// 🔒 CANAL UNIQUE VERROUILLÉ — NE JAMAIS MODIFIER
const CDL_CHANNEL = 'cdl_critical_alerts_v2';

const FATAL_FCM_ERRORS = ['UNREGISTERED', 'INVALID_ARGUMENT'];

async function sendToToken(accessToken, projectId, fcmToken, title, body, data = {}) {
  try {
    const sentAt = new Date().toISOString();
    const stringData = {};
    for (const [k, v] of Object.entries(data)) stringData[k] = v == null ? '' : String(v);
    stringData.title = title;
    stringData.body = body;
    stringData.notification_sent_at = sentAt;
    stringData.event_created_at = stringData.event_created_at || sentAt;
    if (!stringData.screen && stringData.notif_route) stringData.screen = stringData.notif_route;
    if (!stringData.deep_link && stringData.notif_route) stringData.deep_link = stringData.notif_route;

    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token: fcmToken,
          notification: { title, body },
          data: stringData,
          android: {
            priority: 'HIGH',
            ttl: '86400s',
            notification: {
              channel_id: CDL_CHANNEL,
              sound: 'default',
              visibility: 'PUBLIC',
              notification_priority: 'PRIORITY_HIGH',
              default_sound: true,
              default_vibrate_timings: true,
              default_light_settings: true,
              notification_count: 1,
              tag: `cdl_${data?.type || 'notif'}_${data?.entity_id || Date.now()}`,
            },
          },
          webpush: {
            notification: {
              icon: 'https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg',
              badge: 'https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg',
              requireInteraction: true,
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
      console.log(`[CDL-FCM] ✅ OK | channel=${CDL_CHANNEL} | token:${fcmToken.slice(0, 20)}... | msgId:${result?.name} | sent_at=${sentAt}`);
    } else {
      console.error(`[CDL-FCM] ❌ FAIL | err=${errCode} | HTTP=${res.status} | token:${fcmToken.slice(0, 20)}...`);
    }
    return { ok: res.ok, result, errCode, token: fcmToken, msgId: result?.name || null };
  } catch (e) {
    console.error(`[CDL-FCM] ❌ EXCEPTION | token:${fcmToken.slice(0, 20)}... | ${e.message}`);
    return { ok: false, result: null, errCode: 'EXCEPTION', token: fcmToken, msgId: null };
  }
}

// ── Anti-doublon : clé event_type+entity_id+recipient_email (fenêtre 60s) ────
async function isDuplicate(base44, recipientEmail, data, title) {
  try {
    const entityId = data?.entity_id || '';
    const eventType = data?.type || '';
    if (!entityId || !eventType || !recipientEmail) return false;
    const notifKey = `${recipientEmail}__${eventType}__${entityId}__${title}`;
    const since60s = new Date(Date.now() - 60000).toISOString();
    const existing = await base44.asServiceRole.entities.Notification.filter({
      destinataire_email: recipientEmail,
      notification_key: notifKey,
    }, '-created_date', 1);
    if (existing?.length > 0 && existing[0].created_date > since60s) {
      console.log(`[CDL_ANTI_DOUBLON] skip | key=${notifKey} | age=${Date.now() - new Date(existing[0].created_date).getTime()}ms`);
      return true;
    }
    return false;
  } catch (_) { return false; }
}

// ── Notification interne BDD ─────────────────────────────────────────────────
async function createInternalNotif(base44, { recipientEmail, title, body, data = {} }) {
  const typeMap = {
    bedou_recharge_request: 'warning', bedou_recharge_approved: 'success',
    bedou_recharge_rejected: 'danger', bedou_withdrawal_request: 'warning',
    bedou_withdrawal_approved: 'success', bedou_withdrawal_rejected: 'danger',
    new_course: 'info', course_created: 'success', course_assigned: 'warning',
    course_accepted: 'success', course_in_progress: 'info', course_delivered: 'success',
    course_delivered_driver: 'success', course_cancelled: 'danger',
    payment_validated: 'success', new_profile_request: 'warning',
    profile_pending_review: 'warning', profile_validated: 'success',
    profile_refused: 'danger', profile_suspended: 'danger',
    new_order: 'info', new_marketplace_order: 'info', order_accepted: 'success',
    order_ready: 'success', order_delivering: 'info', order_delivered: 'success',
    order_cancelled: 'danger', new_message: 'info', admin_message: 'warning',
    new_ad_submitted: 'info', ad_validated: 'success', ad_refused: 'danger',
    ad_suspended: 'warning', ad_deactivated: 'info', bedou_low_balance: 'warning',
    livreur_arrived_pickup: 'info', livreur_near_destination: 'info',
  };
  const type = typeMap[data?.type] || 'info';
  const entityId = data?.entity_id || '';
  const entityType = data?.entity_type || '';
  const eventType = data?.type || '';
  const notifKey = entityId && entityType && eventType
    ? `${recipientEmail}__${eventType}__${entityId}__${title}` : '';
  try {
    await base44.asServiceRole.entities.Notification.create({
      destinataire_email: recipientEmail,
      titre: title,
      message: body,
      type,
      lue: false,
      target_screen: data?.notif_route || data?.deep_link || '/',
      target_entity_type: entityType,
      target_entity_id: entityId,
      notification_key: notifKey,
    });
    return true;
  } catch (e) {
    console.warn(`[CDL-BDD] ⚠️ Notif interne échouée pour ${recipientEmail}: ${e.message}`);
    return false;
  }
}

// ── Handler principal ─────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const t0 = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const { user_email, role, title, body: msgBody, data = {} } = body;

    const eventType = data?.type || 'unknown';
    const entityId = data?.entity_id || '';
    const entityType = data?.entity_type || '';

    console.log(`[sendCdlNotification] ━━━ START ━━━ | event_type=${eventType} | user=${user_email || ''} | role=${role || ''}`);

    // 🔒 Guard channel_id interdit
    const requestedChannel = body?.channel_id || data?.channel_id || null;
    if (requestedChannel && requestedChannel !== CDL_CHANNEL) {
      console.error(`[sendCdlNotification] 🔴 GUARD — channel_id interdit: "${requestedChannel}"`);
      return Response.json({ error: `channel_id interdit — utiliser ${CDL_CHANNEL}`, guard: 'CHANNEL_LOCK' }, { status: 400 });
    }
    if (!title || !msgBody) {
      return Response.json({ error: 'title et body requis', guard: 'PAYLOAD_REQUIRED' }, { status: 400 });
    }
    if (!user_email && !role) {
      return Response.json({ error: 'user_email ou role requis' }, { status: 400 });
    }

    // Enrichir data avec champs standard
    const enrichedData = {
      ...data,
      entity_type: entityType,
      entity_id: entityId,
      target_role: data?.target_role || role || '',
      deep_link: data?.deep_link || data?.notif_route || '/',
    };

    const base44 = createClientFromRequest(req);

    // ── 1. Résoudre destinataires ────────────────────────────────────────────
    let targetEmails = [];
    try {
      if (user_email) {
        targetEmails = [user_email.toLowerCase()];
      } else if (role === 'admin') {
        const adminUsers = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
        targetEmails = adminUsers.map(u => u.email.toLowerCase());
      } else if (role) {
        const profiles = await base44.asServiceRole.entities.UserProfile.filter({
          profile_type: role, status: 'actif', deleted: false,
        });
        targetEmails = [...new Set(profiles.map(p => p.user_email.toLowerCase()))];
      }
    } catch (e) {
      console.error(`[sendCdlNotification] ❌ Résolution destinataires: ${e.message}`);
      if (user_email) targetEmails = [user_email.toLowerCase()];
    }

    console.log(`[sendCdlNotification] Destinataires résolus: ${targetEmails.length} | [${targetEmails.join(', ')}]`);
    if (targetEmails.length === 0) {
      return Response.json({ sent: 0, failed: 0, total: 0, bdd: 0, note: 'Aucun destinataire' });
    }

    // ── 2. Notifications internes BDD (avec anti-doublon) ────────────────────
    let bddCreated = 0;
    try {
      const bddResults = await Promise.allSettled(
        targetEmails.map(async (email) => {
          const dup = await isDuplicate(base44, email, enrichedData, title);
          if (dup) return false;
          return createInternalNotif(base44, { recipientEmail: email, title, body: msgBody, data: enrichedData });
        })
      );
      bddCreated = bddResults.filter(r => r.status === 'fulfilled' && r.value === true).length;
      console.log(`[sendCdlNotification] BDD notifs créées: ${bddCreated}/${targetEmails.length} | +${Date.now() - t0}ms`);
    } catch (e) {
      console.error(`[sendCdlNotification] ❌ BDD batch: ${e.message}`);
    }

    // ── 3. FCM Push avec FCM_TOKEN_LOCK ──────────────────────────────────────
    let sent = 0, failed = 0, firstMsgId = null;

    if (!SA_JSON) {
      console.warn('[sendCdlNotification] ⚠️ FIREBASE_SERVICE_ACCOUNT_JSON manquant — FCM désactivé');
      return Response.json({ sent: 0, failed: 0, total: 0, bdd: bddCreated, note: 'FCM désactivé (SA manquant)' });
    }

    // Récupérer tous les tokens actifs pour chaque email
    const tokenResults = await Promise.allSettled(
      targetEmails.map(email => base44.asServiceRole.entities.FcmToken.filter({ user_email: email, is_active: true }))
    );

    // Log détaillé par destinataire : token_found, token_count, token_preview
    for (let i = 0; i < targetEmails.length; i++) {
      const email = targetEmails[i];
      const r = tokenResults[i];
      if (r.status !== 'fulfilled') {
        console.error(`[FCM_SEND_RESULT] recipient_email=${email} | token_found=false | token_count=0 | error_message=FETCH_FAILED`);
        continue;
      }
      const tokens = (r.value || []).filter(t => t.token && !isTestToken(t.token));
      if (tokens.length === 0) {
        console.error(`[FCM_SEND_RESULT] recipient_email=${email} | token_found=false | token_count=0 | error_message=NO_ACTIVE_TOKEN | hint=user_must_reopen_app`);
      } else {
        const best = tokens.sort((a, b) => new Date(b.last_used || b.registered_at || 0) - new Date(a.last_used || a.registered_at || 0))[0];
        console.log(`[FCM_SEND_RESULT] recipient_email=${email} | token_found=true | token_count=${tokens.length} | token_preview=${best.token.slice(0, 30)}... | device_type=${best.device_type || 'unknown'} | last_used=${best.last_used || best.registered_at || 'N/A'}`);
      }
    }

    // 🔒 FCM_TOKEN_LOCK — 1 seul token par user_email (le plus récent)
    const tokensByEmail = new Map();
    for (const r of tokenResults) {
      if (r.status !== 'fulfilled') continue;
      const validTokens = (r.value || []).filter(t => {
        if (!t.token || String(t.token).trim() === '') {
          console.error(`[FCM_TOKEN_LOCK] token vide user=${t.user_email} id=${t.id} — ignoré`);
          return false;
        }
        return !isTestToken(t.token);
      });
      for (const t of validTokens) {
        const email = (t.user_email || '').toLowerCase();
        const existing = tokensByEmail.get(email);
        const tDate = new Date(t.last_used || t.registered_at || 0).getTime();
        const eDate = existing ? new Date(existing.last_used || existing.registered_at || 0).getTime() : -1;
        if (!existing || tDate > eDate) {
          if (existing) {
            base44.asServiceRole.entities.FcmToken.delete(existing.id).catch(() =>
              base44.asServiceRole.entities.FcmToken.update(existing.id, { is_active: false }).catch(() => {})
            );
            console.log(`[FCM_TOKEN_LOCK] old_token_removed | user=${email} | removed_id=${existing.id} | kept_id=${t.id}`);
          }
          tokensByEmail.set(email, t);
        } else {
          base44.asServiceRole.entities.FcmToken.delete(t.id).catch(() =>
            base44.asServiceRole.entities.FcmToken.update(t.id, { is_active: false }).catch(() => {})
          );
          console.log(`[FCM_TOKEN_LOCK] old_token_removed | user=${email} | removed_id=${t.id} | kept_id=${existing.id}`);
        }
      }
    }

    const tokenRecords = [];
    for (const [email, t] of tokensByEmail.entries()) {
      console.log(`[FCM_TOKEN_LOCK] user_email=${email} | active_token_count=1 | selected_token=${t.token.slice(0, 25)}... | last_used_at=${t.last_used || t.registered_at || 'N/A'}`);
      tokenRecords.push(t);
    }

    const tokensCount = tokenRecords.length;
    console.log(`[sendCdlNotification] tokens_count=${tokensCount} | +${Date.now() - t0}ms`);

    if (tokensCount === 0) {
      console.error(`[FCM_TOKEN_LOCK] ❌ AUCUN TOKEN ACTIF — [${targetEmails.join(', ')}] — BDD fallback: ${bddCreated}`);
      return Response.json({ sent: 0, failed: 0, total: 0, bdd: bddCreated, note: 'Aucun token FCM actif' });
    }

    const sa = JSON.parse(SA_JSON);
    const accessToken = await getAccessToken(sa);

    const fcmResults = await Promise.allSettled(
      tokenRecords.map(record => sendToToken(accessToken, sa.project_id, record.token, title, msgBody, enrichedData))
    );

    for (let i = 0; i < fcmResults.length; i++) {
      const r = fcmResults[i];
      const tokenRecord = tokenRecords[i];
      if (r.status === 'fulfilled' && r.value.ok) {
        sent++;
        if (!firstMsgId) firstMsgId = r.value.msgId;
        base44.asServiceRole.entities.FcmToken.update(tokenRecord.id, { last_used: new Date().toISOString() }).catch(() => {});

        // 🔒 LOG OBLIGATOIRE [CDL_PUSH_SENT]
        console.log(
          `[CDL_PUSH_SENT] ` +
          `event_type=${eventType} | ` +
          `entity_type=${entityType} | ` +
          `entity_id=${entityId} | ` +
          `recipient_email=${tokenRecord.user_email} | ` +
          `token_used=${tokenRecord.token.slice(0, 25)}... | ` +
          `channel_id=${CDL_CHANNEL} | ` +
          `fcm_sent=1 | ` +
          `fcm_failed=0 | ` +
          `firebase_message_id=${r.value.msgId || 'N/A'}`
        );
      } else {
        failed++;
        const errCode = r.status === 'fulfilled' ? r.value.errCode : 'EXCEPTION';
        const errMsg = r.status === 'fulfilled' ? (r.value.result?.error?.message || errCode) : r.reason?.message || 'EXCEPTION';
        console.error(
          `[CDL_PUSH_SENT] ` +
          `event_type=${eventType} | ` +
          `entity_type=${entityType} | ` +
          `entity_id=${entityId} | ` +
          `recipient_email=${tokenRecord.user_email} | ` +
          `token_used=${tokenRecord.token.slice(0, 25)}... | ` +
          `channel_id=${CDL_CHANNEL} | ` +
          `fcm_sent=0 | ` +
          `fcm_failed=1 | ` +
          `firebase_message_id=N/A | ` +
          `error_code=${errCode} | ` +
          `error_message=${errMsg}`
        );
        console.error(`[FCM_SEND_RESULT] recipient_email=${tokenRecord.user_email} | token_found=true | token_preview=${tokenRecord.token.slice(0, 30)}... | fcm_success=false | fcm_failure=true | error_code=${errCode} | error_message=${errMsg}`);
        if (FATAL_FCM_ERRORS.includes(errCode)) {
          console.error(`[FCM_TOKEN_LOCK] ❌ UNREGISTERED → suppression | user=${tokenRecord.user_email} | token=${tokenRecord.token.slice(0, 25)}...`);
          base44.asServiceRole.entities.FcmToken.delete(tokenRecord.id).catch(() =>
            base44.asServiceRole.entities.FcmToken.update(tokenRecord.id, {
              is_active: false,
              deactivation_reason: errCode,
              deactivated_at: new Date().toISOString(),
            }).catch(() => {})
          );
        }
      }
    }

    const elapsed = Date.now() - t0;
    const notification_client_sent = sent > 0;

    console.log(
      `[sendCdlNotification] ━━━ DONE ━━━ | ` +
      `event_type=${eventType} | ` +
      `tokens_count=${tokensCount} | ` +
      `fcm_sent=${sent} | ` +
      `fcm_failed=${failed} | ` +
      `bdd=${bddCreated} | ` +
      `notification_client_sent=${notification_client_sent} | ` +
      `delay_ms=${elapsed}`
    );

    if (failed > 0 && sent === 0) {
      console.error(`[sendCdlNotification] 🔴 MONITORING ALERT — fcm_sent=0 failed=${failed} | event_type=${eventType} | BDD fallback=${bddCreated > 0 ? 'OK' : 'ÉCHEC'}`);
    }

    return Response.json({
      sent,
      failed,
      total: tokensCount,
      bdd: bddCreated,
      elapsed_ms: elapsed,
      notification_client_sent,
      channel_id: CDL_CHANNEL,
      firebase_message_id: firstMsgId,
    });

  } catch (criticalErr) {
    const elapsed = Date.now() - t0;
    console.error(`[sendCdlNotification] 🔴 ERREUR CRITIQUE | ${criticalErr.message} | elapsed=${elapsed}ms`);
    return Response.json({ sent: 0, failed: 0, total: 0, bdd: 0, error: criticalErr.message, elapsed_ms: elapsed });
  }
});