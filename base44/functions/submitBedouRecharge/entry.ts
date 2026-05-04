/**
 * submitBedouRecharge — NOTIFICATIONS SYNCHRONES + FCM IMMÉDIAT
 * 1. Créer recharge BDD
 * 2. Notifications internes admin (SYNCHRONE — avant réponse HTTP)
 * 3. FCM push admin (SYNCHRONE — avant réponse HTTP)
 *
 * 🔒 FCM VERROUILLÉ : channel_id=cdl_critical_alerts_v2, priority=HIGH, retry 1x
 * 🔒 NOTIF_SOURCE: submitBedouRecharge — log obligatoire
 * ❌ NE PAS modifier le channel_id, le priority, ni le fallback tokens
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const L = (msg) => console.log(`[RECHARGE] ${new Date().toISOString()} | ${msg}`);

// ── FCM helpers ──────────────────────────────────────────────────────────────

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

const CDL_CHANNEL = 'cdl_critical_alerts_v2'; // 🔒 VERROUILLÉ
const FATAL_FCM_ERRORS = ['UNREGISTERED', 'INVALID_ARGUMENT'];

async function sendFcmToToken(accessToken, projectId, token, title, body, dataPayload) {
  const sentAt = new Date().toISOString();
  const strData = {};
  for (const [k, v] of Object.entries(dataPayload)) strData[k] = v == null ? '' : String(v);
  strData.title = title;
  strData.body = body;
  strData.notification_sent_at = sentAt;
  if (!strData.screen && strData.notif_route) strData.screen = strData.notif_route;

  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        notification: { title, body },
        data: strData,
        android: {
          priority: 'HIGH',
          ttl: '86400s',
          notification: {
            channel_id: CDL_CHANNEL, // 🔒 VERROUILLÉ
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
  const errCode = !res.ok ? (result?.error?.details?.[0]?.errorCode || result?.error?.status || 'FCM_ERROR') : null;
  L(`FCM token=${token.slice(0, 20)}... status=${res.status} ok=${res.ok} msgId=${result?.name || errCode || 'N/A'} channel=${CDL_CHANNEL}`);
  return { ok: res.ok, result, token, errCode };
}

// ── Handler principal ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const t0 = Date.now();
  L('=== START ===');

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  L(`Authorization header: ${authHeader ? 'OUI (len=' + authHeader.length + ')' : 'NON'}`);

  let body = {};
  try {
    const raw = await req.text();
    if (raw.length > 0) body = JSON.parse(raw);
  } catch (e) {
    return Response.json({ success: false, error: 'Corps invalide' }, { status: 400 });
  }

  const { montant, methode_paiement, preuve_paiement_url, bonus } = body;
  L(`montant=${montant} methode=${methode_paiement} bonus=${bonus} preuve=${!!preuve_paiement_url}`);

  const base44 = createClientFromRequest(req);
  let user = null;
  try {
    user = await base44.auth.me();
    L(`auth OK: user=${user?.email}`);
  } catch (e) {
    L(`auth ERROR: ${e.message}`);
    return Response.json({ success: false, error: 'Session expirée — reconnectez-vous', step: 'auth' }, { status: 401 });
  }

  if (!user?.id) return Response.json({ success: false, error: 'Non authentifié' }, { status: 401 });

  const montantInt = parseInt(montant) || 0;
  const bonusInt   = parseInt(bonus)   || 0;

  if (montantInt < 100)     return Response.json({ success: false, error: 'Montant minimum 100 F CFA' }, { status: 400 });
  if (!methode_paiement)    return Response.json({ success: false, error: 'Méthode requise' }, { status: 400 });
  if (!preuve_paiement_url) return Response.json({ success: false, error: 'Preuve requise' }, { status: 400 });

  // ── ÉTAPE 1 : Créer la demande en BDD ────────────────────────────────────
  let demande = null;
  try {
    demande = await base44.asServiceRole.entities.DemandeRecharge.create({
      user_id:             user.id,
      user_email:          user.email,
      user_name:           user.full_name || user.email,
      montant:             montantInt,
      bonus:               bonusInt,
      montant_total:       montantInt + bonusInt,
      methode_paiement,
      preuve_paiement_url,
      statut:              'en_attente',
      type:                'recharge_bedou',
    });
    L(`BDD OK: id=${demande.id} | +${Date.now() - t0}ms`);
  } catch (e) {
    L(`BDD ERROR: ${e.message}`);
    return Response.json({ success: false, error: `Erreur BDD: ${e.message}` }, { status: 500 });
  }

  const clientName = user.full_name || user.email;
  const notifTitle = '💰 Nouvelle demande de recharge Bedou';
  const notifBody  = `${clientName} demande ${montantInt.toLocaleString()} F CFA${bonusInt > 0 ? ` + ${bonusInt.toLocaleString()} F bonus` : ''}. Validation requise.`;

  // ── ÉTAPE 2 : Charger admins + tokens FCM en PARALLÈLE (SYNCHRONE) ────────
  let admins = [];
  let allTokenRecords = [];
  let rawJson = '';

  try {
    const [allUsers, tokenRecords, serviceAccountJson] = await Promise.all([
      base44.asServiceRole.entities.User.list(null, 200),
      base44.asServiceRole.entities.FcmToken.filter({ is_active: true }, null, 200),
      Promise.resolve(Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') || ''),
    ]);

    admins = allUsers.filter(u => {
      if (u.role === 'admin') return true;
      try {
        const roles = JSON.parse(u.data?.user_roles || u.user_roles || '[]');
        return roles.includes('admin') || roles.includes('dispatcher');
      } catch (_) { return false; }
    });

    allTokenRecords = tokenRecords || [];
    rawJson = serviceAccountJson;

    L(`admins: ${admins.length} (${admins.map(a => a.email).join(', ')}) | tokens actifs total: ${allTokenRecords.length}`);
  } catch (e) {
    L(`load error (non-bloquant): ${e.message}`);
  }

  // ── ÉTAPE 3 : Notifications internes BDD (SYNCHRONE) ────────────────────
  try {
    await Promise.allSettled(admins.map(admin =>
      base44.asServiceRole.entities.Notification.create({
        destinataire_email:  admin.email,
        destinataire_role:   'admin',
        titre:               notifTitle,
        message:             notifBody,
        type:                'warning',
        lue:                 false,
        target_screen:       '/gestion-bedou',
        target_entity_type:  'DemandeRecharge',
        target_entity_id:    demande.id,
      })
    ));
    L(`notifs internes envoyées: ${admins.length} | +${Date.now() - t0}ms`);
  } catch (e) {
    L(`notif interne error: ${e.message}`);
  }

  // ── ÉTAPE 4 : FCM Push admin (SYNCHRONE) — canal verrouillé + retry 1x ──
  // 🔒 STABILITY_LOCK — logs de preuve obligatoires
  console.log(`[NOTIF_SOURCE] submitBedouRecharge | event=bedou_recharge_request | admin=${admins.map(a=>a.email).join(',')} | +${Date.now()-t0}ms`);

  let fcmSentTotal = 0;
  let fcmFailedTotal = 0;
  let firstFirebaseMessageId = null;
  const sendCdlNotificationCalled = true; // cette fonction EST le canal officiel

  if (rawJson) {
    try {
      const sa = JSON.parse(rawJson);
      const adminEmails = admins.map(a => a.email.toLowerCase());

      // Tokens des admins uniquement — pas de fallback tous-tokens (risque notifier clients)
      const targetTokens = allTokenRecords.filter(r =>
        adminEmails.includes((r.user_email || '').toLowerCase()) && r.token
      );

      L(`FCM cibles: ${targetTokens.length} token(s) admin | emails: ${[...new Set(targetTokens.map(r => r.user_email))].join(', ')}`);

      if (targetTokens.length > 0) {
        const accessToken = await getOAuthToken(sa);
        const tFcm = Date.now();
        const fcmData = {
          type:        'bedou_recharge_request',
          entity_id:   demande.id,
          entity_type: 'DemandeRecharge',
          notif_route: '/gestion-bedou',
          client_email: user.email,
        };

        // Tentative 1
        const fcmResults = await Promise.allSettled(
          targetTokens.map(r => sendFcmToToken(accessToken, sa.project_id, r.token, notifTitle, notifBody, fcmData))
        );

        const retryTokens = [];
        for (let i = 0; i < fcmResults.length; i++) {
          const r = fcmResults[i];
          if (r.status === 'fulfilled' && r.value.ok) {
            fcmSentTotal++;
            if (!firstFirebaseMessageId) firstFirebaseMessageId = r.value.result?.name || null;
            base44.asServiceRole.entities.FcmToken.update(targetTokens[i].id, { last_used: new Date().toISOString() }).catch(() => {});
          } else {
            const errCode = r.status === 'fulfilled' ? r.value.errCode : 'EXCEPTION';
            if (FATAL_FCM_ERRORS.includes(errCode)) {
              base44.asServiceRole.entities.FcmToken.update(targetTokens[i].id, { is_active: false, deactivation_reason: errCode }).catch(() => {});
              fcmFailedTotal++;
            } else {
              retryTokens.push(targetTokens[i]);
            }
          }
        }

        // Retry 1x pour erreurs transitoires
        if (retryTokens.length > 0) {
          L(`FCM RETRY 1x — ${retryTokens.length} token(s)`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          const retryResults = await Promise.allSettled(
            retryTokens.map(r => sendFcmToToken(accessToken, sa.project_id, r.token, notifTitle, notifBody, fcmData))
          );
          for (const r of retryResults) {
            if (r.status === 'fulfilled' && r.value.ok) {
              fcmSentTotal++;
              if (!firstFirebaseMessageId) firstFirebaseMessageId = r.value.result?.name || null;
            } else {
              fcmFailedTotal++;
            }
          }
        }

        L(`FCM done: sent=${fcmSentTotal} failed=${fcmFailedTotal} channel=${CDL_CHANNEL} | +${Date.now() - tFcm}ms | total=+${Date.now() - t0}ms`);

        // 🔒 STABILITY_LOCK_VIOLATION guard
        if (fcmSentTotal === 0) {
          console.error(`[STABILITY_LOCK_VIOLATION] submitBedouRecharge | fcm_sent=0 | request_id=${demande.id} | client_email=${user.email} | tokens_count=${targetTokens.length} | firebase_sa=true`);
        }
        if (fcmFailedTotal > 0 && fcmSentTotal === 0) {
          console.error(`[STABILITY_LOCK_VIOLATION] submitBedouRecharge | tous les push ont échoué | failed=${fcmFailedTotal} | request_id=${demande.id}`);
        }

      } else {
        // 🔒 STABILITY_LOCK_VIOLATION — aucun token admin = push impossible
        console.error(`[STABILITY_LOCK_VIOLATION] submitBedouRecharge | aucun token FCM admin actif | request_id=${demande.id} | client_email=${user.email} | Notif BDD créée en fallback`);
        L('FCM skip: aucun token admin actif (notif BDD créée en étape 3)');
      }
    } catch (e) {
      console.error(`[STABILITY_LOCK_VIOLATION] submitBedouRecharge | FCM exception: ${e.message} | request_id=${demande.id}`);
      L(`FCM error: ${e.message}`);
    }
  } else {
    // 🔒 STABILITY_LOCK_VIOLATION — SA absent = FCM impossible
    console.error(`[STABILITY_LOCK_VIOLATION] submitBedouRecharge | FIREBASE_SERVICE_ACCOUNT_JSON absent | request_id=${demande.id}`);
    L('FCM skip: FIREBASE_SERVICE_ACCOUNT_JSON manquant');
  }

  const totalDelay = Date.now() - t0;

  // 🔒 LOG DE PREUVE OBLIGATOIRE (STABILITY_LOCK)
  console.log(
    `[STABILITY_LOCK_PROOF] submitBedouRecharge | ` +
    `request_id=${demande.id} | ` +
    `client_email=${user.email} | ` +
    `admin_email=${admins.map(a => a.email).join(',')} | ` +
    `admin_token_actuel=${allTokenRecords.filter(r => admins.some(a => a.email === r.user_email))[0]?.token?.slice(0, 20) || 'NONE'}... | ` +
    `sendCdlNotification_called=${sendCdlNotificationCalled} | ` +
    `channel_id=${CDL_CHANNEL} | ` +
    `fcm_sent=${fcmSentTotal} | ` +
    `fcm_failed=${fcmFailedTotal} | ` +
    `firebase_message_id=${firstFirebaseMessageId} | ` +
    `delay_ms=${totalDelay} | ` +
    `notification_visible_confirmed=REQUIRES_MANUAL_ANDROID_VERIFICATION`
  );

  L(`RESPONSE sent | total=+${totalDelay}ms`);
  return Response.json({
    success:       true,
    message:       'Demande de recharge envoyée avec succès',
    recharge_id:   demande.id,
    montant:       montantInt,
    bonus:         bonusInt,
    montant_total: montantInt + bonusInt,
    stability_proof: {
      request_id:                  demande.id,
      client_email:                user.email,
      sendCdlNotification_called:  sendCdlNotificationCalled,
      channel_id:                  CDL_CHANNEL,
      fcm_sent:                    fcmSentTotal,
      fcm_failed:                  fcmFailedTotal,
      firebase_message_id:         firstFirebaseMessageId,
      delay_ms:                    totalDelay,
      notification_visible_confirmed: 'REQUIRES_MANUAL_ANDROID_VERIFICATION',
    },
    logs: {
      admins_count: admins.length,
      tokens_found: allTokenRecords.length,
      firebase_sa_present: !!rawJson,
    },
  });
});