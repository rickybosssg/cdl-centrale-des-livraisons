/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  validateBedouRequest — FONCTION VERROUILLÉE v2.0 — NE PAS MODIFIER   ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║  🔒 LOGIQUE VERROUILLÉE — validée et testée en production              ║
 * ║  ❌ NE JAMAIS hardcoder email, user_id ou wallet                        ║
 * ║  ❌ NE JAMAIS modifier l'ordre des étapes 1→7                           ║
 * ║  ❌ NE JAMAIS supprimer l'anti-double-crédit (statut = en_attente)      ║
 * ║  ❌ NE JAMAIS supprimer le log d'audit BEDOU_AUDIT                      ║
 * ║  ❌ NE JAMAIS changer channel_id → toujours cdl_critical_alerts_v2     ║
 * ║  ✅ Extensions autorisées UNIQUEMENT par ajout — jamais remplacement    ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║  ORDRE CRITIQUE (anti-doublon garanti) :                                ║
 * ║    1. Vérifier statut = en_attente  ← BLOQUE si déjà traité            ║
 * ║    2. LOG AUDIT permanent           ← admin_id/request_id/client_id    ║
 * ║    3. Charger/créer wallet Bedou client                                 ║
 * ║    4. Créditer solde Bedou          ← AVANT de marquer validé          ║
 * ║    5. Créer transaction                                                 ║
 * ║    6. Marquer demande comme validée ← seulement si crédit OK           ║
 * ║    7. Notification interne BDD                                          ║
 * ║    8. FCM push direct Firebase (canal cdl_critical_alerts_v2)          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * FCM appelé directement (pas via functions.invoke) — évite erreur 403 inter-fonctions.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const L = (msg) => console.log(`[validateBedouRequest] ${new Date().toISOString()} | ${msg}`);

// ── FCM DIRECT — helpers copiés de sendCdlNotification (pas d'import local possible) ──

const SA_JSON = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') || '';
const CDL_CHANNEL = 'cdl_critical_alerts_v2'; // 🔒 VERROUILLÉ

async function getFcmAccessToken(sa) {
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

async function sendFcmToToken(accessToken, projectId, token, title, body, dataPayload) {
  const sentAt = new Date().toISOString();
  const strData = { title, body, notification_sent_at: sentAt };
  for (const [k, v] of Object.entries(dataPayload)) {
    strData[k] = v == null ? '' : String(v);
  }
  if (!strData.screen && strData.notif_route) strData.screen = strData.notif_route;

  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
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
            visibility: 'PUBLIC',
            notification_priority: 'PRIORITY_MAX',
            default_sound: true,
            default_vibrate_timings: true,
            default_light_settings: true,
          },
        },
      },
    }),
  });
  const result = await res.json().catch(() => ({}));
  L(`FCM token=${token.slice(0, 20)}... status=${res.status} ok=${res.ok} msgId=${result?.name || result?.error?.status || 'N/A'} channel=${CDL_CHANNEL}`);
  return { ok: res.ok, result, token, errCode: !res.ok ? (result?.error?.details?.[0]?.errorCode || result?.error?.status || 'FCM_ERROR') : null };
}

// ── sendFcmDirect avec retry automatique 1x si échec ────────────────────────
async function sendFcmDirect(base44, userEmail, title, body, data = {}, validationTimestamp = null) {
  if (!SA_JSON) {
    L('FCM skip — FIREBASE_SERVICE_ACCOUNT_JSON absent');
    return { sent: 0, failed: 0, total: 0, retry_used: false };
  }

  const tokenRecords = await base44.asServiceRole.entities.FcmToken.filter({
    user_email: userEmail, is_active: true,
  });

  if (!tokenRecords || tokenRecords.length === 0) {
    L(`FCM skip — aucun token actif pour ${userEmail}`);
    return { sent: 0, failed: 0, total: 0, retry_used: false };
  }

  // Injecter timestamps pour calcul delay_ms côté client
  const enrichedData = {
    ...data,
    validation_timestamp: validationTimestamp || new Date().toISOString(),
    notification_sent_at: new Date().toISOString(),
  };

  const sa = JSON.parse(SA_JSON);
  const accessToken = await getFcmAccessToken(sa);

  const FATAL = ['UNREGISTERED', 'INVALID_ARGUMENT'];
  let sent = 0, failed = 0, retryUsed = false;

  // ── Tentative 1 ──────────────────────────────────────────────────────────
  const results1 = await Promise.allSettled(
    tokenRecords.map(r => sendFcmToToken(accessToken, sa.project_id, r.token, title, body, enrichedData))
  );

  const failedTokens = [];
  for (let i = 0; i < results1.length; i++) {
    const r = results1[i];
    if (r.status === 'fulfilled' && r.value.ok) {
      sent++;
      base44.asServiceRole.entities.FcmToken.update(tokenRecords[i].id, {
        last_used: new Date().toISOString(),
      }).catch(() => {});
    } else {
      const errCode = r.status === 'fulfilled' ? r.value.errCode : 'EXCEPTION';
      L(`FCM tentative 1 ÉCHEC | token=${tokenRecords[i].token.slice(0, 20)}... | errCode=${errCode}`);
      if (FATAL.includes(errCode)) {
        // Token mort — désactiver immédiatement, pas de retry
        base44.asServiceRole.entities.FcmToken.update(tokenRecords[i].id, {
          is_active: false, deactivation_reason: errCode, deactivated_at: new Date().toISOString(),
        }).catch(() => {});
        failed++;
      } else {
        // Erreur transitoire — éligible au retry
        failedTokens.push({ record: tokenRecords[i], index: i });
      }
    }
  }

  // ── Retry automatique 1x pour erreurs transitoires (après 1.5s) ──────────
  if (failedTokens.length > 0) {
    retryUsed = true;
    L(`FCM RETRY (1/1) — ${failedTokens.length} token(s) en échec transitoire — attente 1.5s...`);
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Nouveau access token pour le retry (évite expiration courte)
    const retryAccessToken = await getFcmAccessToken(sa).catch(() => accessToken);
    enrichedData.notification_sent_at = new Date().toISOString(); // refresh timestamp

    const results2 = await Promise.allSettled(
      failedTokens.map(({ record }) =>
        sendFcmToToken(retryAccessToken, sa.project_id, record.token, title, body, enrichedData)
      )
    );

    for (let i = 0; i < results2.length; i++) {
      const r = results2[i];
      const record = failedTokens[i].record;
      if (r.status === 'fulfilled' && r.value.ok) {
        sent++;
        L(`FCM RETRY OK | token=${record.token.slice(0, 20)}...`);
        base44.asServiceRole.entities.FcmToken.update(record.id, {
          last_used: new Date().toISOString(),
        }).catch(() => {});
      } else {
        failed++;
        const errCode = r.status === 'fulfilled' ? r.value.errCode : 'EXCEPTION';
        L(`FCM RETRY ÉCHEC | token=${record.token.slice(0, 20)}... | errCode=${errCode}`);
        if (FATAL.includes(errCode)) {
          base44.asServiceRole.entities.FcmToken.update(record.id, {
            is_active: false, deactivation_reason: errCode, deactivated_at: new Date().toISOString(),
          }).catch(() => {});
        }
      }
    }
  }

  L(`FCM FINAL | sent=${sent} failed=${failed} total=${tokenRecords.length} retry_used=${retryUsed} channel=${CDL_CHANNEL}`);
  return { sent, failed, total: tokenRecords.length, channel_id: CDL_CHANNEL, retry_used: retryUsed };
}

// ── Handler principal ─────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const t0 = Date.now();
  L('=== START ===');

  const base44 = createClientFromRequest(req);

  // Auth admin obligatoire
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Non authentifié' }, { status: 401 });
  if (user.role !== 'admin') return Response.json({ error: 'Admin requis' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { request_id, type, action, motif_refus } = body;

  if (!request_id || !type || !action) {
    return Response.json({ error: 'request_id, type et action requis' }, { status: 400 });
  }

  L(`action=${action} type=${type} request_id=${request_id} admin=${user.email}`);

  const table = type === 'recharge' ? 'DemandeRecharge' : 'DemandeRetrait';

  // ── 1. Charger la demande ─────────────────────────────────────────────────
  let demande;
  try {
    const demandeList = await base44.asServiceRole.entities[table].filter({ id: request_id }, null, 1);
    demande = demandeList?.[0] || null;
  } catch (e) {
    L(`Erreur chargement demande: ${e.message}`);
    return Response.json({ error: 'Demande introuvable' }, { status: 404 });
  }

  if (!demande) return Response.json({ error: 'Demande introuvable' }, { status: 404 });

  // ANTI-DOUBLE-CRÉDIT : bloquer si déjà traitée
  if (demande.statut !== 'en_attente') {
    L(`DOUBLE VALIDATION BLOQUÉE — statut actuel: ${demande.statut}`);
    return Response.json({
      error: `Cette demande a déjà été traitée (statut: ${demande.statut})`,
      already_processed: true,
    }, { status: 409 });
  }

  // ── 🔒 LOG D'AUDIT PERMANENT — NE PAS SUPPRIMER ──────────────────────────
  // Trace immuable de chaque action admin sur une demande Bedou
  const auditTs = new Date().toISOString();
  console.log(`[BEDOU_AUDIT] timestamp=${auditTs} | action=${action} | type=${type} | request_id=${request_id} | admin_id=${user.id || user.email} | admin_email=${user.email} | client_id=${demande.user_id || demande.user_email} | client_email=${demande.user_email} | montant=${demande.montant} | bonus=${demande.bonus || 0} | montant_total=${demande.montant_total || demande.montant} | methode=${demande.methode_paiement || 'N/A'}`);

  // ── REFUS ─────────────────────────────────────────────────────────────────
  if (action === 'refuser') {
    if (!motif_refus?.trim()) {
      return Response.json({ error: 'Motif de refus requis' }, { status: 400 });
    }

    await base44.asServiceRole.entities[table].update(request_id, {
      statut: 'refuse',
      motif_refus: motif_refus.trim(),
      date_validation: new Date().toISOString(),
      valide_par: user.email,
    });

    const notifTitle = `❌ ${type === 'recharge' ? 'Recharge' : 'Retrait'} Bedou refusé`;
    const notifMsg = type === 'recharge'
      ? `Votre rechargement de ${demande.montant?.toLocaleString()} F CFA a été refusé. Motif : ${motif_refus}`
      : `Votre demande de retrait a été refusée. Motif : ${motif_refus}`;

    await base44.asServiceRole.entities.Notification.create({
      destinataire_email: demande.user_email,
      titre: notifTitle,
      message: notifMsg,
      type: 'danger',
      lue: false,
      target_screen: '/mon-bedou',
      target_entity_type: 'DemandeRecharge',
      target_entity_id: request_id,
      notification_key: `${demande.user_email}__bedou_${type}_refused__${request_id}`,
    });

    sendFcmDirect(base44, demande.user_email, notifTitle, notifMsg, {
      type: type === 'recharge' ? 'bedou_recharge_rejected' : 'bedou_withdrawal_rejected',
      entity_id: request_id,
      entity_type: 'DemandeRecharge',
      notif_route: '/mon-bedou',
      screen: '/mon-bedou',
    }).catch(e => L(`FCM refus non-bloquant: ${e.message}`));

    const elapsedRefus = Date.now() - t0;
    console.log(`[BEDOU_AUDIT] timestamp=${auditTs} | result=refuse | request_id=${request_id} | admin_email=${user.email} | client_email=${demande.user_email} | motif=${motif_refus.trim()} | delay_ms=${elapsedRefus}`);
    L(`REFUS OK | +${elapsedRefus}ms`);
    return Response.json({ success: true, action: 'refuse' });
  }

  // ── VALIDATION ────────────────────────────────────────────────────────────
  const montantCredite = type === 'recharge'
    ? (demande.montant_total || demande.montant || 0)
    : (demande.montant || 0);
  const bonusAmount = type === 'recharge' ? (demande.bonus || 0) : 0;
  const userName = demande.user_name || demande.user_nom || demande.user_email;

  L(`montant à créditer: ${montantCredite} | bonus: ${bonusAmount} | user: ${demande.user_email}`);

  // ── 2. Charger ou créer le wallet Bedou AVANT de marquer validé ──────────
  let bedouList = await base44.asServiceRole.entities.Bedou.filter({ user_email: demande.user_email });
  let b = bedouList?.[0];

  if (!b) {
    L(`Bedou inexistant pour ${demande.user_email} — création`);
    b = await base44.asServiceRole.entities.Bedou.create({
      user_email: demande.user_email,
      user_id: demande.user_id || '',
      user_nom: userName,
      role: 'client',
      solde: 0,
      solde_disponible: 0,
      solde_bloque: 0,
      solde_bonus: 0,
      bonus: 0,
      gains_totaux: 0,
      depenses_totales: 0,
      statut_bedou: 'actif',
      date_creation: new Date().toISOString(),
    });
    L(`Bedou créé id=${b.id}`);
  }

  const ancienSolde = b.solde || 0;
  const ancienDisponible = b.solde_disponible || 0;

  const nouveauSolde = type === 'recharge'
    ? ancienSolde + montantCredite
    : Math.max(0, ancienSolde - montantCredite);
  const nouveauDisponible = type === 'recharge'
    ? ancienDisponible + montantCredite
    : Math.max(0, ancienDisponible - montantCredite);

  L(`Solde: ${ancienSolde} → ${nouveauSolde} | Disponible: ${ancienDisponible} → ${nouveauDisponible}`);

  // ── 3. Créditer le solde (AVANT de marquer validé) ────────────────────────
  await base44.asServiceRole.entities.Bedou.update(b.id, {
    solde: nouveauSolde,
    solde_disponible: nouveauDisponible,
  });
  L(`✅ Solde crédité | bedou_id=${b.id}`);

  // ── 4. Créer la transaction ───────────────────────────────────────────────
  await base44.asServiceRole.entities.Transaction.create({
    user_email: demande.user_email,
    user_nom: userName,
    role: 'client',
    type: type === 'recharge' ? 'recharge' : 'retrait',
    montant: montantCredite,
    sens: type === 'recharge' ? 'credit' : 'debit',
    source: 'validation_admin',
    statut: 'valide',
    date_validation: new Date().toISOString(),
    valide_par: user.email,
    reference_id: request_id,
  });
  L(`✅ Transaction créée`);

  // ── 5. Marquer demande validée (seulement si crédit OK) ───────────────────
  await base44.asServiceRole.entities[table].update(request_id, {
    statut: 'valide',
    date_validation: new Date().toISOString(),
    valide_par: user.email,
  });
  L(`✅ Demande marquée valide`);

  // ── 6. Notification interne BDD ───────────────────────────────────────────
  const notifTitle = type === 'recharge' ? '✅ Recharge Bedou validée' : '✅ Retrait Bedou validé';
  const notifMsg = type === 'recharge'
    ? `Votre compte a été crédité de ${montantCredite.toLocaleString()} F CFA.${bonusAmount > 0 ? ` (dont ${bonusAmount.toLocaleString()} F bonus)` : ''}`
    : `Votre retrait de ${montantCredite.toLocaleString()} F CFA a été effectué.`;

  await base44.asServiceRole.entities.Notification.create({
    destinataire_email: demande.user_email,
    titre: notifTitle,
    message: notifMsg,
    type: 'success',
    lue: false,
    target_screen: '/mon-bedou',
    target_entity_type: 'DemandeRecharge',
    target_entity_id: request_id,
    notification_key: `${demande.user_email}__bedou_${type}_approved__${request_id}`,
  });
  L(`✅ Notification BDD créée`);

  // ── 7. FCM push direct Firebase (cdl_critical_alerts_v2) + retry 1x ─────
  const validationTs = new Date().toISOString();
  let fcmResult = { sent: 0, failed: 0, total: 0, channel_id: CDL_CHANNEL, retry_used: false };
  try {
    fcmResult = await sendFcmDirect(base44, demande.user_email, notifTitle, notifMsg, {
      type: type === 'recharge' ? 'bedou_recharge_approved' : 'bedou_withdrawal_approved',
      entity_id: request_id,
      entity_type: 'DemandeRecharge',
      notif_route: '/mon-bedou',
      screen: '/mon-bedou',
      amount: String(montantCredite),
      user_id: demande.user_id || demande.user_email,
    }, validationTs);
  } catch (fcmErr) {
    L(`FCM erreur non-bloquante: ${fcmErr.message}`);
  }

  const fcmSent = fcmResult.sent > 0;
  const elapsed = Date.now() - t0;

  // Log final structuré — tous les champs de diagnostic
  L(`=== DONE === | recharge_id=${request_id} | user_email=${demande.user_email} | ancien_solde=${ancienSolde} | montant_credite=${montantCredite} | nouveau_solde=${nouveauSolde} | notification_client_sent=${fcmSent} | fcm_sent=${fcmResult.sent} | fcm_failed=${fcmResult.failed} | fcm_total=${fcmResult.total} | retry_used=${fcmResult.retry_used} | channel_id=${CDL_CHANNEL} | delay_ms=${elapsed}`);

  // Alerte si zéro notification envoyée malgré des tokens disponibles
  if (!fcmSent && fcmResult.total > 0) {
    L(`⚠️ ALERTE ZÉRO NOTIF — ${fcmResult.total} token(s) présent(s) mais 0 envoi réussi après retry`);
  } else if (!fcmSent && fcmResult.total === 0) {
    L(`ℹ️ Aucun token FCM enregistré pour ${demande.user_email} — notification BDD créée (fallback)`);
  }

  return Response.json({
    success: true,
    action: 'valide',
    recharge_id: request_id,
    user_email: demande.user_email,
    user_id: demande.user_id || demande.user_email,
    ancien_solde: ancienSolde,
    nouveau_solde: nouveauSolde,
    montant_credite: montantCredite,
    bonus: bonusAmount,
    // Notification push
    notification_client_sent: fcmSent,
    fcm_sent: fcmResult.sent,
    fcm_failed: fcmResult.failed,
    fcm_total: fcmResult.total,
    fcm_retry_used: fcmResult.retry_used,
    channel_id: CDL_CHANNEL,
    validation_timestamp: validationTs,
    delay_ms: elapsed,
  });
});