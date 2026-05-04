/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  validateBedouRequest — FONCTION VERROUILLÉE v3.0 — NE PAS MODIFIER   ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║  🔒 LOGIQUE VERROUILLÉE — validée et testée en production              ║
 * ║  ❌ NE JAMAIS hardcoder email, user_id ou wallet                        ║
 * ║  ❌ NE JAMAIS modifier l'ordre des étapes 1→7                           ║
 * ║  ❌ NE JAMAIS supprimer l'anti-double-crédit (statut = en_attente)      ║
 * ║  ❌ NE JAMAIS supprimer le log d'audit BEDOU_AUDIT                      ║
 * ║  ❌ NE JAMAIS changer channel_id → toujours cdl_critical_alerts_v2     ║
 * ║  ✅ 100% des push passent par sendCdlNotification (source unique)      ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║  ORDRE CRITIQUE (anti-doublon garanti) :                                ║
 * ║    1. Vérifier statut = en_attente  ← BLOQUE si déjà traité            ║
 * ║    2. LOG AUDIT permanent           ← admin_id/request_id/client_id    ║
 * ║    3. Charger/créer wallet Bedou client                                 ║
 * ║    4. Créditer solde Bedou          ← AVANT de marquer validé          ║
 * ║    5. Créer transaction                                                 ║
 * ║    6. Marquer demande comme validée ← seulement si crédit OK           ║
 * ║    7. sendCdlNotification → BDD + FCM (canal cdl_critical_alerts_v2)  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Toutes les notifications passent par sendCdlNotification (source unique).
 * sendCdlNotification gère : BDD interne + FCM push + retry + channel lock.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const L = (msg) => console.log(`[validateBedouRequest] ${new Date().toISOString()} | ${msg}`);

// ── Handler principal ─────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const t0 = Date.now();
  L('=== START ===');

  const base44 = createClientFromRequest(req);

  // Auth admin obligatoire
  let user = null;
  try {
    user = await base44.auth.me();
  } catch(e) {
    L(`auth.me() error: ${e.message}`);
    return Response.json({ error: 'Non authentifié', detail: e.message }, { status: 401 });
  }
  if (!user) return Response.json({ error: 'Non authentifié' }, { status: 401 });

  // Logs d'auth complets pour diagnostic APK
  console.log(`[BEDOU_VALIDATE_AUTH] token_received=true | user_email=${user.email} | role=${user.role} | user_type=${user.user_type || 'N/A'} | current_role=${user.current_role || 'N/A'} | role_actuel=${user.role_actuel || 'N/A'}`);

  // Vérifier admin : tous les champs possibles (base44 auth + CDL profile fields)
  const isAdminByRole = user.role === 'admin';
  const isAdminByUserType = user.user_type === 'admin';
  const isAdminByCurrentRole = user.current_role === 'admin' || user.role_actuel === 'admin';

  // Vérification supplémentaire via StaffPermission en BDD
  let isAdminByStaff = false;
  try {
    const staffPerms = await base44.asServiceRole.entities.StaffPermission.filter({ userEmail: user.email, isActive: true });
    isAdminByStaff = staffPerms?.some(p => p.staffAccessActive === true && p.isStaff === true) || false;
  } catch(_) {}

  const isAdmin = isAdminByRole || isAdminByUserType || isAdminByCurrentRole || isAdminByStaff;
  console.log(`[BEDOU_VALIDATE_AUTH] is_admin=${isAdmin} | byRole=${isAdminByRole} | byUserType=${isAdminByUserType} | byCurrentRole=${isAdminByCurrentRole} | byStaff=${isAdminByStaff}`);

  if (!isAdmin) {
    L(`AUTH REFUSÉ — user=${user.email} role=${user.role} user_type=${user.user_type} current_role=${user.current_role}`);
    return Response.json({ error: 'Admin requis', user_role: user.role, user_type: user.user_type, current_role: user.current_role, is_admin: false }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { request_id, type, action, motif_refus } = body;

  if (!request_id || !type || !action) {
    return Response.json({ error: 'request_id, type et action requis' }, { status: 400 });
  }

  L(`action=${action} type=${type} request_id=${request_id} admin=${user.email}`);
  console.log(`[NOTIF_SOURCE] validateBedouRequest | action=${action} | type=${type}`);

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
  const auditTs = new Date().toISOString();
  console.log(`[BEDOU_AUDIT] timestamp=${auditTs} | action=${action} | type=${type} | request_id=${request_id} | admin_id=${user.id || user.email} | admin_email=${user.email} | client_id=${demande.user_id || demande.user_email} | client_email=${demande.user_email} | montant=${demande.montant} | bonus=${demande.bonus || 0} | montant_total=${demande.montant_total || demande.montant} | methode=${demande.methode_paiement || 'N/A'}`);

  // Helper : envoyer via sendCdlNotification (source unique — BDD + FCM)
  // On passe le header Authorization de la requête admin originale pour propager le contexte.
  // createClientFromRequest dans sendCdlNotification recevra ainsi un token valide.
  const APP_ID = Deno.env.get('BASE44_APP_ID') || '69c3c74fc4b62396dca61751';
  const CDL_NOTIF_URL = `https://cdl.base44.app/api/apps/${APP_ID}/functions/sendCdlNotification`;
  const originalAuth = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  const notify = async (payload) => {
    L(`→ sendCdlNotification (forwarded auth) | to=${payload.user_email || payload.role} | type=${payload.data?.type}`);
    const res = await fetch(CDL_NOTIF_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(originalAuth ? { 'Authorization': originalAuth } : {}),
      },
      body: JSON.stringify(payload),
    }).catch(e => { L(`fetch sendCdlNotification error: ${e.message}`); return null; });
    if (!res) return { data: {} };
    const d = await res.json().catch(() => ({}));
    if (!res.ok) L(`sendCdlNotification HTTP ${res.status} — non-bloquant`);
    return { data: d };
  };

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

    await notify({
      user_email: demande.user_email,
      title: notifTitle,
      body: notifMsg,
      data: {
        type: type === 'recharge' ? 'bedou_recharge_rejected' : 'bedou_withdrawal_rejected',
        entity_id: request_id,
        entity_type: 'DemandeRecharge',
        notif_route: '/mon-bedou',
      },
    });

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

  // ── 6. sendCdlNotification → BDD + FCM (source unique) ───────────────────
  const notifTitle = type === 'recharge' ? '✅ Recharge Bedou validée' : '✅ Retrait Bedou validé';
  const notifMsg = type === 'recharge'
    ? `Votre compte a été crédité de ${montantCredite.toLocaleString()} F CFA.${bonusAmount > 0 ? ` (dont ${bonusAmount.toLocaleString()} F bonus)` : ''}`
    : `Votre retrait de ${montantCredite.toLocaleString()} F CFA a été effectué.`;

  const validationTs = new Date().toISOString();
  let notifResult = { sent: 0, failed: 0, total: 0, bdd: 0 };
  try {
    const res = await notify({
      user_email: demande.user_email,
      title: notifTitle,
      body: notifMsg,
      data: {
        type: type === 'recharge' ? 'bedou_recharge_approved' : 'bedou_withdrawal_approved',
        entity_id: request_id,
        entity_type: 'DemandeRecharge',
        notif_route: '/mon-bedou',
        amount: String(montantCredite),
        user_id: demande.user_id || demande.user_email,
        validation_timestamp: validationTs,
      },
    });
    notifResult = res?.data || notifResult;
    L(`✅ sendCdlNotification OK | fcm_sent=${notifResult.sent} bdd=${notifResult.bdd}`);
  } catch (e) {
    L(`sendCdlNotification erreur non-bloquante: ${e.message}`);
  }

  const fcmSent = (notifResult.sent || 0) > 0;
  const elapsed = Date.now() - t0;

  L(`=== DONE === | request_id=${request_id} | user=${demande.user_email} | ancien_solde=${ancienSolde} | montant_credite=${montantCredite} | nouveau_solde=${nouveauSolde} | fcm_sent=${notifResult.sent} | fcm_failed=${notifResult.failed} | bdd=${notifResult.bdd} | delay_ms=${elapsed}`);
  console.log(`[BEDOU_AUDIT] timestamp=${auditTs} | result=valide | request_id=${request_id} | admin_email=${user.email} | client_email=${demande.user_email} | montant_credite=${montantCredite} | fcm_sent=${notifResult.sent} | delay_ms=${elapsed}`);

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
    notification_client_sent: fcmSent,
    fcm_sent: notifResult.sent || 0,
    fcm_failed: notifResult.failed || 0,
    fcm_total: notifResult.total || 0,
    bdd: notifResult.bdd || 0,
    validation_timestamp: validationTs,
    delay_ms: elapsed,
  });
});