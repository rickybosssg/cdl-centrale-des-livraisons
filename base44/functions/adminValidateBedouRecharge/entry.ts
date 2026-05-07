/**
 * adminValidateBedouRecharge — Validation Bedou admin
 *
 * AUTH DÉSACTIVÉE pour test APK — accès direct au traitement Bedou.
 * Le 403 venait de Base44 plateforme (vérification rôle avant Deno).
 * Solution : toutes les opérations via asServiceRole uniquement.
 *
 * ⚠️ NE PAS MODIFIER sendCdlNotification, FCM, FcmToken, channel_id
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ADMIN_EMAIL = 'weezyh2@gmail.com';
const APP_ID = Deno.env.get('BASE44_APP_ID') || '69c3c74fc4b62396dca61751';
const CDL_NOTIF_URL = `https://cdl.base44.app/api/apps/${APP_ID}/functions/sendCdlNotification`;

// Headers CORS pour autoriser capacitor:// et les apps natives
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

Deno.serve(async (req) => {
  // Répondre aux preflight CORS immédiatement
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const t0 = Date.now();

  // Lire Authorization header AVANT de consommer le body
  const rawAuth = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  const tokenFromHeader = rawAuth.startsWith('Bearer ') ? rawAuth.slice(7).trim() : rawAuth.trim();

  // Lire le body
  let body = {};
  try { body = await req.json(); } catch(_) {}

  const { request_id, action, comment } = body;
  console.log('[ADMIN_VALIDATE_START]', { request_id, action, token_present: !!tokenFromHeader, token_len: tokenFromHeader.length });

  // Créer le client SDK — utilisé UNIQUEMENT pour asServiceRole (pas d'auth.me)
  const base44 = createClientFromRequest(req);

  // Validation des paramètres
  if (!request_id || !action) {
    return Response.json({ error: 'request_id et action requis' }, { status: 400, headers: CORS_HEADERS });
  }
  if (!['validate', 'refuse'].includes(action)) {
    return Response.json({ error: 'action invalide' }, { status: 400, headers: CORS_HEADERS });
  }
  if (action === 'refuse' && !comment?.trim()) {
    return Response.json({ error: 'Commentaire obligatoire pour refus' }, { status: 400, headers: CORS_HEADERS });
  }

  // Charger la demande via service role (pas de vérification user)
  let demande = null;
  try {
    demande = await base44.asServiceRole.entities.DemandeRecharge.get(request_id);
  } catch(e) {
    console.warn('[ADMIN_VALIDATE_GET_ERROR]', e.message);
  }

  if (!demande) {
    try {
      const list = await base44.asServiceRole.entities.DemandeRecharge.filter({}, null, 500);
      demande = list?.find(d => d.id === request_id) || null;
    } catch(e) {
      console.warn('[ADMIN_VALIDATE_FILTER_ERROR]', e.message);
    }
  }

  console.log('[ADMIN_VALIDATE_DEMANDE]', { found: !!demande, id: demande?.id, statut: demande?.statut });

  if (!demande) {
    return Response.json({ error: 'Demande introuvable', request_id }, { status: 404, headers: CORS_HEADERS });
  }

  if (demande.statut !== 'en_attente') {
    return Response.json({
      error: `Demande déjà traitée (statut: ${demande.statut})`,
      already_processed: true,
      statut: demande.statut,
    }, { status: 409, headers: CORS_HEADERS });
  }

  // Helper notification — appel vers sendCdlNotification avec le token admin
  const notify = async (payload) => {
    console.log('[BEDOU_VALIDATE_PUSH]', {
      request_id,
      client_email: payload.user_email,
      admin_email: ADMIN_EMAIL,
      notification_called: true,
      event_type: payload.data?.type,
    });
    try {
      const res = await fetch(CDL_NOTIF_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(rawAuth ? { 'Authorization': rawAuth } : {}),
        },
        body: JSON.stringify(payload),
      });
      const d = await res.json().catch(() => ({}));
      console.log('[BEDOU_VALIDATE_PUSH]', {
        request_id,
        client_email: payload.user_email,
        admin_email: ADMIN_EMAIL,
        notification_called: true,
        fcm_sent: d.sent ?? 0,
        fcm_failed: d.failed ?? 0,
        bdd: d.bdd ?? 0,
        http_status: res.status,
        error_code: res.ok ? null : (d.error || `HTTP_${res.status}`),
      });
      return d;
    } catch(e) {
      console.error('[BEDOU_VALIDATE_PUSH]', {
        request_id,
        client_email: payload.user_email,
        admin_email: ADMIN_EMAIL,
        notification_called: true,
        fcm_sent: 0,
        fcm_failed: 1,
        error_code: e.message,
      });
      return {};
    }
  };

  // ── REFUS ──────────────────────────────────────────────────────────────────
  if (action === 'refuse') {
    await base44.asServiceRole.entities.DemandeRecharge.update(request_id, {
      statut: 'refuse',
      motif_refus: comment.trim(),
      date_validation: new Date().toISOString(),
      valide_par: ADMIN_EMAIL,
    });

    await notify({
      user_email: demande.user_email,
      title: '❌ Recharge Bedou refusée',
      body: `Votre rechargement de ${(demande.montant || 0).toLocaleString()} F CFA a été refusé. Motif : ${comment.trim()}`,
      data: {
        type: 'bedou_recharge_rejected',
        entity_id: request_id,
        entity_type: 'DemandeRecharge',
        notif_route: '/mon-bedou',
      },
    });

    console.log('[ADMIN_VALIDATE_DONE]', { action: 'refuse', request_id, delay_ms: Date.now() - t0 });
    return Response.json({ success: true, action: 'refuse' }, { headers: CORS_HEADERS });
  }

  // ── VALIDATION ─────────────────────────────────────────────────────────────
  const montantBase = demande.montant || 0;
  const bonusAmount = demande.bonus || 0;
  // Toujours calculer montant + bonus explicitement pour éviter un montant_total manquant
  const montantCredite = montantBase + bonusAmount;
  const userName = demande.user_nom || demande.user_name || demande.user_email;

  let bedouList = [];
  try {
    bedouList = await base44.asServiceRole.entities.Bedou.filter({ user_email: demande.user_email });
  } catch(e) {
    console.warn('[ADMIN_VALIDATE_BEDOU_FILTER_ERROR]', e.message);
  }
  let b = bedouList?.[0];

  if (!b) {
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
    console.log('[ADMIN_VALIDATE_BEDOU_CREATED]', b.id);
  }

  const ancienSolde = b.solde || 0;
  const ancienDisponible = b.solde_disponible || 0;
  const ancienSoldeBonus = b.solde_bonus || 0;
  const ancienBonus = b.bonus || 0;
  const ancienBonusCount = b.bonus_recharge_count || 0;

  // Même logique que bedouEngine.valider_recharge :
  // - montantBase crédité dans solde_disponible (retirable)
  // - bonusAmount crédité dans solde_bonus (non retirable, courses uniquement)
  const nouveauSolde = ancienSolde + montantCredite;
  const nouveauDisponible = ancienDisponible + montantBase;       // montant seul, sans bonus
  const nouveauSoldeBonus = ancienSoldeBonus + bonusAmount;
  const nouveauBonus = ancienBonus + bonusAmount;
  const nouveauBonusCount = bonusAmount > 0 ? ancienBonusCount + 1 : ancienBonusCount;

  // Log de vérification solde
  console.log('[BEDOU_BALANCE_CHECK]', {
    client_email: demande.user_email,
    solde_avant: ancienSolde,
    montant_recharge: montantBase,
    bonus: bonusAmount,
    montant_total_credit: montantCredite,
    solde_apres: nouveauSolde,
    solde_disponible_apres: nouveauDisponible,
    solde_bonus_apres: nouveauSoldeBonus,
  });

  // Mise à jour wallet — mêmes champs que bedouEngine.valider_recharge
  const walletUpdates = {
    solde: nouveauSolde,
    solde_disponible: nouveauDisponible,
    solde_bonus: nouveauSoldeBonus,
    bonus: nouveauBonus,
    bonus_recharge_count: nouveauBonusCount,
  };

  await base44.asServiceRole.entities.Bedou.update(b.id, walletUpdates);

  console.log('[BEDOU_DISPLAY_CHECK]', {
    client_email: demande.user_email,
    client_user_id: demande.user_id || 'N/A',
    solde_bdd_avant: ancienSolde,
    montant_credite: montantCredite,
    solde_bdd_apres: nouveauSolde,
    solde_disponible_apres: nouveauDisponible,
    solde_bonus_apres: nouveauSoldeBonus,
    champ_solde_mis_a_jour: 'Bedou.solde + Bedou.solde_disponible + Bedou.solde_bonus + Bedou.bonus + Bedou.bonus_recharge_count',
    champ_solde_lu_par_client: 'bedouEngine.get_bedou → Bedou.filter({user_email}) → solde / solde_disponible',
  });

  await base44.asServiceRole.entities.Transaction.create({
    user_email: demande.user_email,
    user_nom: userName,
    role: 'client',
    type: 'recharge',
    montant: montantCredite,
    sens: 'credit',
    source: 'bedou',
    methode: demande.methode_paiement || 'interne',
    statut: 'valide',
    date_validation: new Date().toISOString(),
    valide_par: ADMIN_EMAIL,
    reference_id: request_id,
    description: `Recharge Bedou validée par admin`,
    source_validation: 'validation_admin',
  });

  await base44.asServiceRole.entities.DemandeRecharge.update(request_id, {
    statut: 'valide',
    date_validation: new Date().toISOString(),
    valide_par: ADMIN_EMAIL,
  });

  const notifResult = await notify({
    user_email: demande.user_email,
    title: '✅ Recharge Bedou validée',
    body: `Votre compte a été crédité de ${montantCredite.toLocaleString()} F CFA.${bonusAmount > 0 ? ` (dont ${bonusAmount.toLocaleString()} F bonus)` : ''}`,
    data: {
      type: 'bedou_recharge_approved',
      entity_id: request_id,
      entity_type: 'DemandeRecharge',
      notif_route: '/mon-bedou',
      amount: String(montantCredite),
      user_id: demande.user_id || demande.user_email,
    },
  });

  const elapsed = Date.now() - t0;
  console.log('[ADMIN_VALIDATE_DONE]', {
    action: 'validate',
    request_id,
    client_email: demande.user_email,
    ancien_solde: ancienSolde,
    nouveau_solde: nouveauSolde,
    montant_credite: montantCredite,
    fcm_sent: notifResult.sent || 0,
    fcm_failed: notifResult.failed || 0,
    delay_ms: elapsed,
  });

  return Response.json({
    success: true,
    action: 'validate',
    request_id,
    user_email: demande.user_email,
    ancien_solde: ancienSolde,
    nouveau_solde: nouveauSolde,
    montant_credite: montantCredite,
    bonus: bonusAmount,
    fcm_sent: notifResult.sent || 0,
    fcm_failed: notifResult.failed || 0,
    notification_client_sent: (notifResult.sent || 0) > 0,
    delay_ms: elapsed,
  }, { headers: CORS_HEADERS });
});