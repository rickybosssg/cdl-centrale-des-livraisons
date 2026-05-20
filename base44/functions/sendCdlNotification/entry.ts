/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  sendCdlNotification — SYSTÈME VERROUILLÉ v5.1 — SOURCE UNIQUE CDL    ║
 * ║  CANAL OFFICIEL UNIQUE = cdl_critical_alerts_v3                         ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║  🔒 CANAL VERROUILLÉ : cdl_critical_alerts_v3 (importance=MAX)         ║
 * ║  🔒 FALLBACK TOKEN : si token_count=0 (actifs), tente le dernier       ║
 * ║     token inactif récent (< 7 jours) avant d'abandonner                ║
 * ║  🔒 ANTI-DOUBLON : clé event_type+entity_id+recipient_email (60s)     ║
 * ║  🔒 LOG OBLIGATOIRE : [CDL_PUSH_SENT] sur chaque push réussi           ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
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

// Token considéré utilisable en fallback si < 7 jours
const FALLBACK_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function getTokenAge(tokenRecord) {
  const ref = tokenRecord.last_used || tokenRecord.registered_at;
  if (!ref) return Infinity;
  return Date.now() - new Date(ref).getTime();
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

// 🔒 CANAL UNIQUE VERROUILLÉ V3 — NE JAMAIS MODIFIER
const CDL_CHANNEL = 'cdl_critical_alerts_v3';

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

    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
    console.log('[FCM_HTTP_REQUEST]', fcmUrl);
    console.log('[FCM_TOKEN_FOUND]', fcmToken ? `len=${fcmToken.length} preview=${fcmToken.slice(0, 30)}...` : 'MISSING');
    
    const res = await fetch(fcmUrl, {
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
              notification_priority: 'PRIORITY_MAX',
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
    const errMessage = result?.error?.message || '';

    if (res.ok) {
      console.log(`[CDL-FCM] ✅ OK | channel=${CDL_CHANNEL} | token:${fcmToken.slice(0, 20)}... | msgId:${result?.name} | sent_at=${sentAt}`);
    } else {
      console.error(`[FCM_HTTP_403_REASON] errCode=${errCode} | HTTP=${res.status} | message=${errMessage} | token:${fcmToken.slice(0, 20)}...`);
      console.error(`[CDL-FCM] ❌ FAIL | err=${errCode} | HTTP=${res.status} | token:${fcmToken.slice(0, 20)}...`);
    }
    return { ok: res.ok, result, errCode, token: fcmToken, msgId: result?.name || null };
  } catch (e) {
    console.error(`[CDL-FCM] ❌ EXCEPTION | token:${fcmToken.slice(0, 20)}... | ${e.message}`);
    return { ok: false, result: null, errCode: 'EXCEPTION', token: fcmToken, msgId: null };
  }
}

// ── Utilitaire : délai async ──────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Fetch paginé avec retry exponentiel sur 429 ───────────────────────────────
// PAGE_SIZE = 50 (sécurisé anti-rate-limit)
// Récupère UNIQUEMENT les tokens des emails ciblés via boucle paginée
const PAGE_SIZE = 50;
const MAX_RETRIES = 3;
const THROTTLE_MS = 100; // pause entre pages

async function fetchWithRetry(fn, retries = MAX_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const is429 = e?.message?.toLowerCase().includes('rate limit') || e?.message?.includes('429');
      if (is429 && attempt < retries) {
        const delay = 200 * Math.pow(2, attempt); // 200ms, 400ms, 800ms
        console.warn(`[FCM_RETRY] 429 rate limit — retry ${attempt + 1}/${retries} in ${delay}ms`);
        await sleep(delay);
        continue;
      }
      throw e;
    }
  }
}

// ── Résolution tokens paginée — zéro 429 ─────────────────────────────────────
// Mode PROD : récupère seulement les tokens des emails ciblés, page par page
// Mode AUDIT (emailSet large > 20) : limite à 2 pages max pour éviter surcharge
async function resolveTokensPaginated(base44, targetEmails, isAuditMode = false) {
  const emailSet = new Set(targetEmails.map(e => e.toLowerCase()));
  const collected = [];
  const maxPages = isAuditMode ? 2 : 20; // audit : max 2 pages / prod : jusqu'à 20
  let page = 0;
  let skip = 0;

  while (page < maxPages) {
    try {
      const batch = await fetchWithRetry(() =>
        base44.asServiceRole.entities.FcmToken.filter(
          { is_active: true }, '-last_used', PAGE_SIZE, skip
        )
      );

      if (!batch || batch.length === 0) break;

      const matched = batch.filter(t =>
        t.token &&
        !isTestToken(t.token) &&
        t.user_email &&
        emailSet.has(t.user_email.toLowerCase()) &&
        getTokenAge(t) < FALLBACK_MAX_AGE_MS
      );
      collected.push(...matched);

      console.log(`[FCM_TOKEN_PAGE] page=${page + 1} | batch=${batch.length} | matched=${matched.length} | total_so_far=${collected.length}`);

      // Stop si on a trouvé un token pour chaque destinataire
      const covered = new Set(collected.map(t => t.user_email?.toLowerCase()));
      if (covered.size >= emailSet.size) {
        console.log(`[FCM_TOKEN_PAGE] all recipients covered — stopping pagination`);
        break;
      }

      if (batch.length < PAGE_SIZE) break; // dernière page

      skip += PAGE_SIZE;
      page++;
      if (page < maxPages) await sleep(THROTTLE_MS); // throttle entre pages
    } catch (e) {
      console.warn(`[FCM_TOKEN_PAGE] page=${page + 1} error: ${e.message} — stopping`);
      break;
    }
  }

  return collected;
}

// ── Anti-doublon : uniquement pour envois ciblés (1 destinataire) ────────────
// Pour les broadcasts (N>1), on saute le check individuel pour éviter N requêtes → 429
async function isDuplicateSingle(base44, recipientEmail, data, title) {
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
      console.log(`[CDL_ANTI_DOUBLON] skip | key=${notifKey}`);
      return true;
    }
    return false;
  } catch (_) { return false; }
}

// ── Type mapper ───────────────────────────────────────────────────────────────
const TYPE_MAP = {
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

function buildNotifRecord(recipientEmail, title, body, data) {
  const type = TYPE_MAP[data?.type] || 'info';
  const entityId = data?.entity_id || '';
  const entityType = data?.entity_type || '';
  const eventType = data?.type || '';
  const notifKey = entityId && entityType && eventType
    ? `${recipientEmail}__${eventType}__${entityId}__${title}` : '';
  return {
    destinataire_email: recipientEmail,
    titre: title,
    message: body,
    type,
    lue: false,
    target_screen: data?.notif_route || data?.deep_link || '/',
    target_entity_type: entityType,
    target_entity_id: entityId,
    notification_key: notifKey,
  };
}

// ── Notifications internes BDD — bulkCreate pour N>1, create simple pour N=1 ─
// Évite le 429 : une seule requête bulkCreate au lieu de N requêtes individuelles
const BULK_CHUNK = 50; // max 50 par appel bulkCreate

async function createNotifsBulk(base44, emails, title, body, data) {
  const isSingle = emails.length === 1;

  if (isSingle) {
    // Envoi ciblé → anti-doublon individuel + create simple
    const dup = await isDuplicateSingle(base44, emails[0], data, title);
    if (dup) return 0;
    try {
      await base44.asServiceRole.entities.Notification.create(
        buildNotifRecord(emails[0], title, body, data)
      );
      return 1;
    } catch (e) {
      console.warn(`[CDL-BDD] create failed: ${e.message}`);
      return 0;
    }
  }

  // Broadcast → bulkCreate par chunks de 50 (pas d'anti-doublon individuel pour éviter N*2 requêtes)
  const records = emails.map(email => buildNotifRecord(email, title, body, data));
  let created = 0;
  for (let i = 0; i < records.length; i += BULK_CHUNK) {
    const chunk = records.slice(i, i + BULK_CHUNK);
    try {
      await base44.asServiceRole.entities.Notification.bulkCreate(chunk);
      created += chunk.length;
    } catch (e) {
      console.warn(`[CDL-BDD] bulkCreate chunk ${i}-${i + chunk.length} failed: ${e.message}`);
      // Fallback : créer individuellement avec throttle
      for (const rec of chunk) {
        try {
          await base44.asServiceRole.entities.Notification.create(rec);
          created++;
          await sleep(50);
        } catch (_) {}
      }
    }
  }
  return created;
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

    // ── 2. Notifications internes BDD ────────────────────────────────────────
    // bulkCreate pour N>1 (évite N requêtes individuelles → 429)
    // anti-doublon uniquement pour N=1 (envoi ciblé)
    let bddCreated = 0;
    try {
      bddCreated = await createNotifsBulk(base44, targetEmails, title, msgBody, enrichedData);
      console.log(`[sendCdlNotification] BDD notifs créées: ${bddCreated}/${targetEmails.length} | +${Date.now() - t0}ms`);
    } catch (e) {
      console.error(`[sendCdlNotification] ❌ BDD batch: ${e.message}`);
    }

    // ── 3. FCM Push — résolution tokens paginée (anti-429) ───────────────────
    let sent = 0, failed = 0, firstMsgId = null;

    if (!SA_JSON) {
      console.warn('[sendCdlNotification] ⚠️ FIREBASE_SERVICE_ACCOUNT_JSON manquant — FCM désactivé');
      return Response.json({ sent: 0, failed: 0, total: 0, bdd: bddCreated, note: 'FCM désactivé (SA manquant)' });
    }

    // Détection mode audit : si destinataires > 20 → mode audit (limite pages)
    // Mode prod (user_email unique ou rôle ciblé) : pagination complète
    const isAuditMode = targetEmails.length > 20;
    if (isAuditMode) {
      console.log(`[FCM_MODE] AUDIT (${targetEmails.length} recipients) — pagination limitée à 2 pages`);
    }

    // Résolution paginée avec retry exponentiel — zéro 429
    let tokenRecords = [];
    try {
      tokenRecords = await resolveTokensPaginated(base44, targetEmails, isAuditMode);
      console.log(`[FCM_TOKEN_BATCH] found=${tokenRecords.length} tokens for ${targetEmails.length} recipients | mode=${isAuditMode ? 'audit' : 'prod'}`);
    } catch (e) {
      console.warn(`[FCM_TOKEN_BATCH] résolution échouée: ${e.message} — fallback silencieux`);
    }

    // Fallback inactif récent pour emails sans token (max 10 emails, prod seulement)
    if (!isAuditMode) {
      const emailsWithToken = new Set(tokenRecords.map(t => t.user_email?.toLowerCase()));
      const emailsWithoutToken = targetEmails.filter(e => !emailsWithToken.has(e)).slice(0, 10);

      if (emailsWithoutToken.length > 0) {
        try {
          const fallbackPage = await fetchWithRetry(() =>
            base44.asServiceRole.entities.FcmToken.filter({}, '-updated_date', PAGE_SIZE)
          );
          for (const email of emailsWithoutToken) {
            const recent = (fallbackPage || [])
              .filter(t => t.user_email?.toLowerCase() === email && t.token && !isTestToken(t.token) && getTokenAge(t) < FALLBACK_MAX_AGE_MS)
              .sort((a, b) => getTokenAge(a) - getTokenAge(b));
            if (recent.length > 0) {
              console.warn(`[FCM_TOKEN_FALLBACK] email=${email} | inactive token réactivé | preview=${recent[0].token.slice(0, 30)}...`);
              tokenRecords.push(recent[0]);
              base44.asServiceRole.entities.FcmToken.update(recent[0].id, { is_active: true, last_used: new Date().toISOString() }).catch(() => {});
            } else {
              console.log(`[FCM_NO_TOKEN] email=${email} | NO_TOKEN_IN_BDD — utilisateur pas encore sur APK`);
            }
          }
        } catch (e) {
          console.warn(`[FCM_TOKEN_FALLBACK] fallback silencieux: ${e.message}`);
        }
      }
    }

    // Log résumé par destinataire (limité à 10 lignes en mode audit)
    const logSample = isAuditMode ? targetEmails.slice(0, 5) : targetEmails;
    for (const email of logSample) {
      const emailTokens = tokenRecords.filter(t => t.user_email?.toLowerCase() === email);
      if (emailTokens.length === 0) {
        console.log(`[FCM_SEND_RESULT] recipient_email=${email} | token_found=false | NO_ACTIVE_TOKEN`);
      } else {
        console.log(`[FCM_SEND_RESULT] recipient_email=${email} | token_found=true | token_count=${emailTokens.length}`);
      }
    }
    if (isAuditMode && targetEmails.length > 5) {
      console.log(`[FCM_SEND_RESULT] ... +${targetEmails.length - 5} autres destinataires (mode audit)`);
    }

    const tokensCount = tokenRecords.length;
    console.log(`[sendCdlNotification] tokens_count=${tokensCount} (tous appareils) | +${Date.now() - t0}ms`);

    if (tokensCount === 0) {
      console.error(`[FCM_BOOT_RECOVERY] ❌ token_count=0 pour [${targetEmails.join(', ')}] — aucun token actif ni inactif récent`);
      return Response.json({ sent: 0, failed: 0, total: 0, bdd: bddCreated, note: 'Aucun token FCM disponible', token_count_zero: true });
    }

    const sa = JSON.parse(SA_JSON);
    
    // ── LOGS DÉTAILLÉS CHAÎNE FIREBASE ──────────────────────────────────────
    console.log('[FCM_PROJECT_ID]', sa.project_id);
    console.log('[FCM_CLIENT_EMAIL]', sa.client_email);
    console.log('[FCM_PRIVATE_KEY_LENGTH]', sa.private_key?.length || 0);
    
    const accessToken = await getAccessToken(sa);
    console.log('[FCM_ACCESS_TOKEN_CREATED]', accessToken ? `token_len=${accessToken.length}` : 'FAILED');

    const fcmResults = await Promise.allSettled(
      tokenRecords.map(record => sendToToken(accessToken, sa.project_id, record.token, title, msgBody, enrichedData))
    );

    for (let i = 0; i < fcmResults.length; i++) {
      const r = fcmResults[i];
      const tokenRecord = tokenRecords[i];
      if (r.status === 'fulfilled' && r.value.ok) {
        sent++;
        if (!firstMsgId) firstMsgId = r.value.msgId;
        base44.asServiceRole.entities.FcmToken.update(tokenRecord.id, {
          last_used: new Date().toISOString(),
          is_active: true,
        }).catch(() => {});

        console.log(
          `[FCM_SEND_RESULT] recipient_email=${tokenRecord.user_email} | ` +
          `token_preview=${tokenRecord.token.slice(0, 30)}... | ` +
          `device_type=${tokenRecord.device_type || 'unknown'} | ` +
          `fcm_success=true | fcm_failure=false | ` +
          `firebase_message_id=${r.value.msgId || 'N/A'} | ` +
          `event_type=${eventType}`
        );
        console.log(
          `[CDL_PUSH_SENT] event_type=${eventType} | entity_type=${entityType} | entity_id=${entityId} | ` +
          `recipient_email=${tokenRecord.user_email} | token_used=${tokenRecord.token.slice(0, 25)}... | ` +
          `channel_id=${CDL_CHANNEL} | fcm_sent=1 | fcm_failed=0 | firebase_message_id=${r.value.msgId || 'N/A'}`
        );
      } else {
        failed++;
        const errCode = r.status === 'fulfilled' ? r.value.errCode : 'EXCEPTION';
        const errMsg = r.status === 'fulfilled' ? (r.value.result?.error?.message || errCode) : (r.reason?.message || 'EXCEPTION');

        console.error(
          `[FCM_SEND_RESULT] recipient_email=${tokenRecord.user_email} | ` +
          `token_preview=${tokenRecord.token.slice(0, 30)}... | ` +
          `device_type=${tokenRecord.device_type || 'unknown'} | ` +
          `fcm_success=false | fcm_failure=true | ` +
          `error_code=${errCode} | error_message=${errMsg} | ` +
          `event_type=${eventType}`
        );

        // Token définitivement invalide → désactiver
        if (FATAL_FCM_ERRORS.includes(errCode)) {
          console.error(`[FCM_SEND_RESULT] ❌ TOKEN_FATAL_ERROR → désactivation | user=${tokenRecord.user_email} | error_code=${errCode}`);
          base44.asServiceRole.entities.FcmToken.update(tokenRecord.id, { is_active: false }).catch(() => {});
        }
      }
    }

    const elapsed = Date.now() - t0;
    const notification_client_sent = sent > 0;

    console.log(
      `[sendCdlNotification] ━━━ DONE ━━━ | event_type=${eventType} | tokens_count=${tokensCount} | ` +
      `fcm_sent=${sent} | fcm_failed=${failed} | bdd=${bddCreated} | notification_client_sent=${notification_client_sent} | delay_ms=${elapsed}`
    );

    if (failed > 0 && sent === 0) {
      console.error(`[sendCdlNotification] 🔴 MONITORING ALERT — fcm_sent=0 failed=${failed} | event_type=${eventType}`);
    }

    return Response.json({
      sent, failed,
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