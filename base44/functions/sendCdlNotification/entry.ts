/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  sendCdlNotification — SYSTÈME VERROUILLÉ v3.0 — NE PAS MODIFIER      ║
 * ║  CANAL OFFICIEL UNIQUE = cdl_critical_alerts_v2                         ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║  🔒 CANAL VERROUILLÉ : cdl_critical_alerts_v2 (importance=5, heads-up) ║
 * ║  ❌ NE JAMAIS changer channel_id → default, CDL_ALERTS_HIGH ou autre   ║
 * ║  ❌ NE PAS modifier android.priority (doit rester HIGH)                ║
 * ║  ❌ NE PAS supprimer notification.title/body (obligatoire background)   ║
 * ║  ❌ NE PAS supprimer default_sound/vibrate/light_settings               ║
 * ║  ❌ NE PAS supprimer createInternalNotif (fallback BDD obligatoire)     ║
 * ║  ❌ NE PAS créer de fonction parallèle — tout doit passer par ici      ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║  ✅ CANAL UNIQUE : cdl_critical_alerts_v2 pour TOUS les types           ║
 * ║  ✅ Double notification : interne BDD TOUJOURS + FCM push               ║
 * ║  ✅ Fallback : si FCM fail → notif BDD déjà créée en amont              ║
 * ║  ✅ Jamais throw bloquant — toujours retourner 200                      ║
 * ║  ✅ android.priority = HIGH (obligatoire app fermée/écran éteint)       ║
 * ║  ✅ Payload standard : notification.title/body + data.type/screen/user  ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║  LOGS OBLIGATOIRES :                                                    ║
 * ║  event_type | user_id | tokens_count | fcm_sent | fcm_failed | time    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Cas 1 : notifier un utilisateur précis → { user_email, title, body, data }
 * Cas 2 : notifier un rôle entier        → { role, title, body, data }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ── Vérification lock système ─────────────────────────────────────────────────
const SYSTEM_LOCKED = Deno.env.get('NOTIFICATIONS_SYSTEM_LOCKED') !== 'false';
if (SYSTEM_LOCKED) {
  console.log('[sendCdlNotification] 🔒 NOTIFICATIONS_SYSTEM_LOCKED=true — système verrouillé');
}

const SA_JSON = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') || '';

const BLACKLISTED_TOKENS = ['test_diagnostic_token', 'test_public_endpoint', 'test_e2e_audit'];
function isTestToken(token) {
  if (!token) return true;
  const t = String(token).toLowerCase();
  return BLACKLISTED_TOKENS.some(b => t.includes(b)) || t.includes('_test_') || t.startsWith('test_');
}

// ── Firebase OAuth2 ───────────────────────────────────────────────────────────
// ❌ NE PAS MODIFIER — scope firebase.messaging obligatoire
async function getAccessToken(sa) {
  try {
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
  } catch (e) {
    throw new Error(`getAccessToken failed: ${e.message}`);
  }
}

// ── Canal VERROUILLÉ ──────────────────────────────────────────────────────────
// 🔒 CDL_CHANNEL = cdl_critical_alerts_v2 — NE JAMAIS MODIFIER
// Android a figé ce canal avec importance=5 heads-up dès la première création.
// Changer l'ID = revenir à un canal avec importance inconnue → pas de heads-up.
const CDL_CHANNEL = 'cdl_critical_alerts_v2'; // ← VERROUILLÉ — ne pas modifier

// ── Envoi FCM v1 ──────────────────────────────────────────────────────────────
// 🔒 PAYLOAD STANDARD VERROUILLÉ — ne pas modifier la structure
async function sendToToken(accessToken, projectId, fcmToken, title, body, data = {}, urgence = 'normal') {
  try {
    const sentAt = new Date().toISOString();
    const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

    // Tous les champs data en string (obligatoire FCM v1)
    const stringData = {};
    for (const [k, v] of Object.entries(data)) {
      stringData[k] = v == null ? '' : String(v);
    }
    // Payload standard verrouillé : title, body, type, screen, user dans data
    stringData.title = title;
    stringData.body = body;
    // Timestamps pour diagnostic délai
    stringData.notification_sent_at = sentAt;
    stringData.event_created_at = stringData.event_created_at || sentAt;
    // screen = alias de notif_route pour compatibilité
    if (!stringData.screen && stringData.notif_route) stringData.screen = stringData.notif_route;

    // 🔒 CANAL UNIQUE VERROUILLÉ — toujours cdl_critical_alerts_v2
    // Ne jamais changer vers default, CDL_ALERTS_HIGH ou autre
    const channelId = CDL_CHANNEL;

    const fcmPayload = {
      message: {
        token: fcmToken,
        // 🔒 notification block OBLIGATOIRE — affichage système Android background/killed
        notification: { title, body },
        data: stringData,
        android: {
          // 🔒 priority HIGH OBLIGATOIRE — app fermée / écran éteint
          priority: 'HIGH',
          ttl: '86400s',
          notification: {
            // 🔒 channel_id VERROUILLÉ — ne jamais changer
            channel_id: channelId,
            // 🔒 son + vibration + lumière OBLIGATOIRES
            sound: 'default',
            visibility: 'PUBLIC',
            notification_priority: 'PRIORITY_MAX',
            default_sound: true,
            default_vibrate_timings: true,
            default_light_settings: true,
            notification_count: 1,
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
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(fcmPayload),
    });

    const result = await res.json().catch(() => ({}));
    const errCode = !res.ok
      ? (result?.error?.details?.[0]?.errorCode || result?.error?.status || 'FCM_ERROR')
      : null;

    if (res.ok) {
      console.log(`[CDL-FCM] ✅ OK | channel=${channelId} | token:${fcmToken.slice(0, 20)}... | msgId:${result?.name} | sent_at=${sentAt}`);
    } else {
      console.error(`[CDL-FCM] ❌ FAIL | err=${errCode} | HTTP=${res.status} | token:${fcmToken.slice(0, 20)}...`);
    }
    return { ok: res.ok, result, errCode, token: fcmToken, channelId, sentAt };
  } catch (e) {
    console.error(`[CDL-FCM] ❌ EXCEPTION | token:${fcmToken.slice(0, 20)}... | ${e.message}`);
    return { ok: false, result: null, errCode: 'EXCEPTION', token: fcmToken };
  }
}

// ── Anti-doublon 60s ──────────────────────────────────────────────────────────
// Évite plusieurs notifications identiques pour la même action en 60 secondes
async function checkDuplicate(base44, destinataire_email, data, title) {
  try {
    const entityId = data?.entity_id || '';
    const entityType = data?.entity_type || '';
    const eventType = data?.type || '';
    if (!entityId || !entityType || !eventType) return false; // pas de clé → pas de dédupliq
    const since60s = new Date(Date.now() - 60000).toISOString();
    const existing = await base44.asServiceRole.entities.Notification.filter({
      destinataire_email,
      notification_key: `${destinataire_email}__${eventType}__${entityId}__${title}`,
    }, '-created_date', 1);
    if (existing?.length > 0 && existing[0].created_date > since60s) {
      console.log(`[CDL-BDD] Doublon détecté (60s) — skip pour ${destinataire_email} | key=${eventType}__${entityId}`);
      return true;
    }
    return false;
  } catch (_) {
    return false; // en cas d'erreur on laisse passer
  }
}

// ── Notification interne BDD ──────────────────────────────────────────────────
// ✅ TOUJOURS appelée — fallback garanti même si FCM échoue
// ❌ NE PAS SUPPRIMER cette fonction
async function createInternalNotif(base44, { destinataire_email, title, body, data = {} }) {
  try {
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
    const type = typeMap[data?.type] || 'info';
    const entityId = data?.entity_id || '';
    const entityType = data?.entity_type || '';
    const eventType = data?.type || '';
    const notifKey = entityId && entityType && eventType
      ? `${destinataire_email}__${eventType}__${entityId}__${title}`
      : '';
    await base44.asServiceRole.entities.Notification.create({
      destinataire_email,
      titre: title,
      message: body,
      type,
      lue: false,
      target_screen: data?.notif_route || '/',
      target_entity_type: entityType,
      target_entity_id: entityId,
      notification_key: notifKey,
    });
    return true;
  } catch (e) {
    console.warn(`[CDL-BDD] ⚠️ Notif interne échouée pour ${destinataire_email}: ${e.message}`);
    return false;
  }
}

const FATAL_FCM_ERRORS = ['UNREGISTERED', 'INVALID_ARGUMENT'];

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const t0 = Date.now();

  // ── Protection globale — jamais throw hors du handler ──────────────────────
  try {
    const body = await req.json().catch(() => ({}));
    const {
      user_email,
      role,
      title,
      body: msgBody,
      data = {},
      urgence = 'normal',
    } = body;

    // LOG OBLIGATOIRE : event_type dès le début
    console.log(`[sendCdlNotification] ━━━ START ━━━ | event_type=${data?.type || 'unknown'} | user=${user_email || ''} | role=${role || ''} | urgence=${urgence}`);

    if (!title || !msgBody) {
      console.warn('[sendCdlNotification] ⚠️ title ou body manquant');
      return Response.json({ error: 'title et body requis' }, { status: 400 });
    }
    if (!user_email && !role) {
      console.warn('[sendCdlNotification] ⚠️ user_email ou role manquant');
      return Response.json({ error: 'user_email ou role requis' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    // ── 1. Résoudre les destinataires ────────────────────────────────────────
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
      console.error(`[sendCdlNotification] ❌ Résolution destinataires échouée: ${e.message}`);
      // Fallback sur user_email direct si dispo
      if (user_email) targetEmails = [user_email.toLowerCase()];
    }

    // LOG OBLIGATOIRE : user_id (emails)
    console.log(`[sendCdlNotification] Destinataires résolus: ${targetEmails.length} | [${targetEmails.join(', ')}]`);

    if (targetEmails.length === 0) {
      console.warn(`[sendCdlNotification] ⚠️ Aucun destinataire | event_type=${data?.type} | +${Date.now() - t0}ms`);
      return Response.json({ sent: 0, failed: 0, total: 0, bdd: 0, note: 'Aucun destinataire' });
    }

    // ── 2. Notifications internes BDD — TOUJOURS, avant FCM ─────────────────
    // ✅ Fallback garanti : même si FCM échoue complètement, l'utilisateur voit la notif dans l'app
    let bddCreated = 0;
    try {
      // Anti-doublon 60s : vérifier avant de créer
      const bddTasks = await Promise.allSettled(
        targetEmails.map(async (email) => {
          const isDuplicate = await checkDuplicate(base44, email, data, title);
          if (isDuplicate) return false;
          return createInternalNotif(base44, {
            destinataire_email: email,
            title,
            body: msgBody,
            data,
          });
        })
      );
      bddCreated = bddTasks.filter(r => r.status === 'fulfilled' && r.value === true).length;
      console.log(`[sendCdlNotification] BDD notifs créées: ${bddCreated}/${targetEmails.length} | +${Date.now() - t0}ms`);
    } catch (e) {
      console.error(`[sendCdlNotification] ❌ BDD batch failed: ${e.message}`);
    }

    // ── 3. FCM Push ──────────────────────────────────────────────────────────
    let sent = 0, failed = 0, tokensCount = 0;

    try {
      if (!SA_JSON) {
        console.warn('[sendCdlNotification] ⚠️ FIREBASE_SERVICE_ACCOUNT_JSON manquant — FCM skippé (BDD ok)');
        return Response.json({ sent: 0, failed: 0, total: 0, bdd: bddCreated, note: 'FCM désactivé' });
      }

      // Récupérer tokens en parallèle
      const tokenResults = await Promise.allSettled(
        targetEmails.map(email => base44.asServiceRole.entities.FcmToken.filter({
          user_email: email, is_active: true,
        }))
      );

      let tokenRecords = [];
      for (const r of tokenResults) {
        if (r.status === 'fulfilled') {
          tokenRecords.push(...(r.value || []).filter(t => !isTestToken(t.token)));
        }
      }
      tokensCount = tokenRecords.length;

      // LOG OBLIGATOIRE : tokens_count
      console.log(`[sendCdlNotification] tokens_count=${tokensCount} | +${Date.now() - t0}ms`);

      if (tokensCount === 0) {
        console.warn(`[sendCdlNotification] ⚠️ Aucun token FCM actif (BDD fallback déjà créé)`);
        return Response.json({ sent: 0, failed: 0, total: 0, bdd: bddCreated, note: 'Aucun token FCM — BDD ok' });
      }

      const sa = JSON.parse(SA_JSON);
      const accessToken = await getAccessToken(sa);

      const fcmResults = await Promise.allSettled(
        tokenRecords.map(record =>
          sendToToken(accessToken, sa.project_id, record.token, title, msgBody, data, urgence)
        )
      );

      const tokensToDeactivate = [];
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

      // Désactiver tokens irrémédiablement invalides
      for (const r of tokensToDeactivate) {
        base44.asServiceRole.entities.FcmToken.update(r.id, {
          is_active: false,
          deactivation_reason: 'firebase_fatal_error',
          deactivated_at: new Date().toISOString(),
        }).catch(() => {});
      }

    } catch (fcmErr) {
      // ✅ FCM fail → on log mais on ne bloque pas — BDD déjà créée en amont
      console.error(`[sendCdlNotification] ❌ FCM block failed: ${fcmErr.message} — BDD fallback déjà créé (${bddCreated} notifs)`);
      failed = tokensCount;
    }

    const elapsed = Date.now() - t0;

    // LOG OBLIGATOIRE : fcm_sent, fcm_failed, execution_time
    console.log(`[sendCdlNotification] ━━━ DONE ━━━ | event_type=${data?.type || 'unknown'} | tokens_count=${tokensCount} | fcm_sent=${sent} | fcm_failed=${failed} | bdd=${bddCreated} | execution_time=${elapsed}ms`);

    return Response.json({
      sent,
      failed,
      total: tokensCount,
      bdd: bddCreated,
      elapsed_ms: elapsed,
    });

  } catch (criticalErr) {
    // Protection ultime — jamais laisser crasher silencieusement
    const elapsed = Date.now() - t0;
    console.error(`[sendCdlNotification] 🔴 ERREUR CRITIQUE | ${criticalErr.message} | execution_time=${elapsed}ms`);
    // Retourner 200 quand même — ne jamais bloquer l'action principale
    return Response.json({ sent: 0, failed: 0, total: 0, bdd: 0, error: criticalErr.message, elapsed_ms: elapsed });
  }
});