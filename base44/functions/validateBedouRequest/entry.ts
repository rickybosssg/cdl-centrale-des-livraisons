/**
 * validateBedouRequest — Validation atomique d'une demande Bedou (recharge ou retrait)
 *
 * ANTI-DOUBLE-CRÉDIT : vérifie que statut est encore "en_attente" avant tout traitement.
 * Tout s'exécute en asServiceRole pour contourner les règles RLS frontend.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const L = (msg) => console.log(`[validateBedouRequest] ${new Date().toISOString()} | ${msg}`);

Deno.serve(async (req) => {
  const t0 = Date.now();
  L('=== START ===');

  const base44 = createClientFromRequest(req);

  // Auth admin obligatoire
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Non authentifié' }, { status: 401 });
  if (user.role !== 'admin') return Response.json({ error: 'Admin requis' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { request_id, type, action } = body; // action = 'valider' | 'refuser'
  const { motif_refus } = body;

  if (!request_id || !type || !action) {
    return Response.json({ error: 'request_id, type et action requis' }, { status: 400 });
  }

  L(`action=${action} type=${type} request_id=${request_id} admin=${user.email}`);

  const table = type === 'recharge' ? 'DemandeRecharge' : 'DemandeRetrait';

  // ── 1. Charger la demande et vérifier qu'elle est encore en_attente ─────────
  let demande;
  try {
    const list = await base44.asServiceRole.entities[table].filter({ id: request_id });
    demande = list?.[0];
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

    // Notifier le client
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

    // FCM non-bloquant
    base44.asServiceRole.functions.invoke('sendCdlNotification', {
      user_email: demande.user_email,
      title: notifTitle,
      body: notifMsg,
      data: {
        type: type === 'recharge' ? 'bedou_recharge_rejected' : 'bedou_withdrawal_rejected',
        entity_id: request_id,
        entity_type: 'DemandeRecharge',
        notif_route: '/mon-bedou',
      },
    }).catch(e => L(`FCM refus non-bloquant: ${e.message}`));

    L(`REFUS OK | +${Date.now() - t0}ms`);
    return Response.json({ success: true, action: 'refuse' });
  }

  // ── VALIDATION ────────────────────────────────────────────────────────────
  const montantCredite = type === 'recharge'
    ? (demande.montant_total || demande.montant || 0)
    : (demande.montant || 0);
  const bonusAmount = type === 'recharge' ? (demande.bonus || 0) : 0;
  const userName = demande.user_name || demande.user_nom || demande.user_email;

  L(`montant à créditer: ${montantCredite} | bonus: ${bonusAmount} | user: ${demande.user_email}`);

  // ── 2. Marquer la demande comme validée (atomique — première opération) ───
  await base44.asServiceRole.entities[table].update(request_id, {
    statut: 'valide',
    date_validation: new Date().toISOString(),
    valide_par: user.email,
  });
  L(`Demande marquée valide`);

  // ── 3. Charger ou créer le wallet Bedou du client ─────────────────────────
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

  // ── 4. Créditer le solde ──────────────────────────────────────────────────
  await base44.asServiceRole.entities.Bedou.update(b.id, {
    solde: nouveauSolde,
    solde_disponible: nouveauDisponible,
  });
  L(`✅ Solde crédité`);

  // ── 5. Créer la transaction ───────────────────────────────────────────────
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

  // ── 6. Notification interne BDD ───────────────────────────────────────────
  const notifTitle = type === 'recharge' ? 'Recharge Bedou validée ✅' : 'Retrait Bedou validé ✅';
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
  L(`✅ Notification BDD créée pour ${demande.user_email}`);

  // ── 7. FCM push client (non-bloquant) ─────────────────────────────────────
  let fcmSent = false;
  try {
    const fcmRes = await base44.asServiceRole.functions.invoke('sendCdlNotification', {
      user_email: demande.user_email,
      title: notifTitle,
      body: notifMsg,
      data: {
        type: type === 'recharge' ? 'bedou_recharge_approved' : 'bedou_withdrawal_approved',
        entity_id: request_id,
        entity_type: 'DemandeRecharge',
        notif_route: '/mon-bedou',
        amount: String(montantCredite),
      },
    });
    fcmSent = (fcmRes?.sent || 0) > 0;
    L(`FCM: sent=${fcmRes?.sent} total=${fcmRes?.total}`);
  } catch (fcmErr) {
    L(`FCM non-bloquant échoué: ${fcmErr.message}`);
  }

  const elapsed = Date.now() - t0;
  L(`=== DONE === | ancien_solde=${ancienSolde} | nouveau_solde=${nouveauSolde} | fcm_client=${fcmSent} | +${elapsed}ms`);

  return Response.json({
    success: true,
    action: 'valide',
    recharge_id: request_id,
    user_email: demande.user_email,
    ancien_solde: ancienSolde,
    nouveau_solde: nouveauSolde,
    montant_credite: montantCredite,
    bonus: bonusAmount,
    notification_client_sent: fcmSent,
    elapsed_ms: elapsed,
  });
});