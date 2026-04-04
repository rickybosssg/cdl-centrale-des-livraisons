import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const COMMISSION_LIVREUR = 0.20; // 20% CDL
const COMMISSION_PARTENAIRE = 0.05; // 5% CDL
const BONUS_COMMERCIAL = 50; // 50 F CFA fixe
const CDL_EMAIL = 'weezyh2@gmail.com'; // Compte Bedou CDL

const BONUS_RECHARGE = [
  { seuil: 5000, bonus: 500 },
  { seuil: 3000, bonus: 200 },
  { seuil: 1000, bonus: 50 },
];

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { action } = body;

  // ── GET or CREATE Bedou ──────────────────────────────────────
  async function getBedou(email) {
    const list = await base44.asServiceRole.entities.Bedou.filter({ user_email: email });
    return list[0] || null;
  }

  async function ensureBedou(email, role, nom) {
    let bedou = await getBedou(email);
    if (!bedou) {
      bedou = await base44.asServiceRole.entities.Bedou.create({
        user_email: email,
        user_nom: nom || email,
        role: role || 'client',
        solde: 0,
        solde_disponible: 0,
        solde_bloque: 0,
        bonus: 0,
        gains_totaux: 0,
        depenses_totales: 0,
        statut_bedou: 'actif',
        date_creation: new Date().toISOString(),
      });
    }
    return bedou;
  }

  async function updateBedou(bedouId, updates) {
    return base44.asServiceRole.entities.Bedou.update(bedouId, updates);
  }

  async function createTransaction(data) {
    return base44.asServiceRole.entities.Transaction.create({
      ...data,
      statut: data.statut || 'valide',
      date_validation: new Date().toISOString(),
    });
  }

  // ── ACTION: ensureBedou ──────────────────────────────────────
  if (action === 'ensure_bedou') {
    const { email, role, nom } = body;
    const bedou = await ensureBedou(email, role, nom);
    return Response.json({ bedou });
  }

  // ── ACTION: get_bedou ──────────────────────────────────────
  if (action === 'get_bedou') {
    const bedou = await ensureBedou(user.email, user.user_type, user.full_name);
    const transactions = await base44.asServiceRole.entities.Transaction.filter(
      { user_email: user.email }, '-created_date', 50
    );
    return Response.json({ bedou, transactions });
  }

  // ── ACTION: demande_recharge ──────────────────────────────────
  if (action === 'demande_recharge') {
    const { montant, methode, numero_transaction, preuve_paiement } = body;
    if (!montant || montant < 100) return Response.json({ error: 'Montant minimum 100 F CFA' }, { status: 400 });
    const bedou = await ensureBedou(user.email, user.user_type, user.full_name);
    if (bedou.statut_bedou === 'suspendu') return Response.json({ error: 'Bedou suspendu' }, { status: 403 });
    const bonusObj = BONUS_RECHARGE.find(b => montant >= b.seuil);
    const bonus_applique = bonusObj ? bonusObj.bonus : 0;
    const demande = await base44.asServiceRole.entities.DemandeRecharge.create({
      user_email: user.email,
      user_nom: user.full_name,
      role: user.user_type,
      montant,
      methode,
      numero_transaction: numero_transaction || '',
      preuve_paiement: preuve_paiement || '',
      statut: 'en_attente',
      bonus_applique,
    });
    // Notif admin
    await base44.asServiceRole.entities.Notification.create({
      destinataire_email: 'weezyh2@gmail.com',
      destinataire_role: 'admin',
      titre: '💰 Demande de recharge Bedou',
      message: `${user.full_name} demande une recharge de ${montant.toLocaleString()} F CFA via ${methode}.`,
      type: 'info',
      lue: false,
      target_screen: '/gestion-transactions',
      target_section: 'recharges',
    });
    return Response.json({ success: true, demande, bonus_applique });
  }

  // ── ACTION: valider_recharge (admin) ──────────────────────────
  if (action === 'valider_recharge') {
    if (user.role !== 'admin') return Response.json({ error: 'Interdit' }, { status: 403 });
    const { demande_id } = body;
    const [demande] = await base44.asServiceRole.entities.DemandeRecharge.filter({ id: demande_id });
    if (!demande) return Response.json({ error: 'Demande introuvable' }, { status: 404 });
    if (demande.statut !== 'en_attente') return Response.json({ error: 'Déjà traitée' }, { status: 400 });

    const bedou = await ensureBedou(demande.user_email, demande.role, demande.user_nom);
    const total = demande.montant + (demande.bonus_applique || 0);
    await updateBedou(bedou.id, {
      solde: (bedou.solde || 0) + total,
      solde_disponible: (bedou.solde_disponible || 0) + total,
      bonus: (bedou.bonus || 0) + (demande.bonus_applique || 0),
    });
    await base44.asServiceRole.entities.DemandeRecharge.update(demande_id, {
      statut: 'valide',
      date_validation: new Date().toISOString(),
      valide_par: user.email,
    });
    await createTransaction({
      user_email: demande.user_email,
      user_nom: demande.user_nom,
      role: demande.role,
      type: 'recharge',
      sens: 'credit',
      montant: demande.montant,
      source: 'bedou',
      methode: demande.methode,
      reference_id: demande_id,
      description: `Recharge Bedou via ${demande.methode}`,
      valide_par: user.email,
      statut: 'valide',
    });
    if (demande.bonus_applique > 0) {
      await createTransaction({
        user_email: demande.user_email,
        user_nom: demande.user_nom,
        role: demande.role,
        type: 'bonus',
        sens: 'credit',
        montant: demande.bonus_applique,
        source: 'bedou',
        methode: 'interne',
        reference_id: demande_id,
        description: `Bonus recharge +${demande.bonus_applique} F CFA`,
        valide_par: user.email,
        statut: 'valide',
      });
    }
    // Notif utilisateur
    await base44.asServiceRole.entities.Notification.create({
      destinataire_email: demande.user_email,
      destinataire_role: demande.role,
      titre: '✅ Recharge Bedou validée',
      message: `Votre recharge de ${demande.montant.toLocaleString()} F CFA a été validée.${demande.bonus_applique ? ` Bonus : +${demande.bonus_applique} F CFA !` : ''}`,
      type: 'success',
      lue: false,
      target_screen: '/mon-bedou',
      target_entity_type: 'transaction',
    });
    return Response.json({ success: true });
  }

  // ── ACTION: refuser_recharge (admin) ──────────────────────────
  if (action === 'refuser_recharge') {
    if (user.role !== 'admin') return Response.json({ error: 'Interdit' }, { status: 403 });
    const { demande_id, motif } = body;
    await base44.asServiceRole.entities.DemandeRecharge.update(demande_id, {
      statut: 'refuse',
      motif_refus: motif || 'Refusé par l\'administrateur',
      date_validation: new Date().toISOString(),
      valide_par: user.email,
    });
    return Response.json({ success: true });
  }

  // ── ACTION: demande_retrait ──────────────────────────────────
  if (action === 'demande_retrait') {
    const { montant, methode, numero_reception, nom_compte } = body;
    if (!['livreur', 'partenaire', 'commercial'].includes(user.user_type)) {
      return Response.json({ error: 'Retrait non autorisé pour votre rôle' }, { status: 403 });
    }
    const bedou = await getBedou(user.email);
    if (!bedou) return Response.json({ error: 'Bedou introuvable' }, { status: 404 });
    if (bedou.statut_bedou === 'suspendu') return Response.json({ error: 'Bedou suspendu' }, { status: 403 });
    // Commercial : vérifier seuil balance_blocked >= 5000 F avant tout retrait
    if (user.user_type === 'commercial') {
      const balanceBlocked = bedou.balance_blocked || 0;
      if (balanceBlocked < 5000) {
        return Response.json({ error: `Seuil non atteint. Gains bloqués : ${balanceBlocked} F / 5000 F requis` }, { status: 400 });
      }
      if (montant > balanceBlocked) {
        return Response.json({ error: `Montant supérieur aux gains bloqués disponibles : ${balanceBlocked} F CFA` }, { status: 400 });
      }
    } else {
      if ((bedou.solde_disponible || 0) < montant) {
        return Response.json({ error: `Solde insuffisant. Disponible : ${bedou.solde_disponible || 0} F CFA` }, { status: 400 });
      }
    }
    if (montant < 500) return Response.json({ error: 'Retrait minimum 500 F CFA' }, { status: 400 });
    // Bloquer le montant selon le type de rôle
    const retaitUpdates = user.user_type === 'commercial'
      ? {
          balance_blocked: Math.max(0, (bedou.balance_blocked || 0) - montant),
          solde: Math.max(0, (bedou.solde || 0) - montant),
          solde_bloque: (bedou.solde_bloque || 0) + montant,
        }
      : {
          solde_disponible: (bedou.solde_disponible || 0) - montant,
          solde_bloque: (bedou.solde_bloque || 0) + montant,
        };
    await updateBedou(bedou.id, retaitUpdates);
    const demande = await base44.asServiceRole.entities.DemandeRetrait.create({
      user_email: user.email,
      user_nom: user.full_name,
      role: user.user_type,
      montant,
      methode,
      numero_reception,
      nom_compte: nom_compte || user.full_name,
      statut: 'en_attente',
    });
    await base44.asServiceRole.entities.Notification.create({
      destinataire_email: 'weezyh2@gmail.com',
      destinataire_role: 'admin',
      titre: '💸 Demande de retrait Bedou',
      message: `${user.full_name} demande un retrait de ${montant.toLocaleString()} F CFA via ${methode}.`,
      type: 'warning',
      lue: false,
      target_screen: '/gestion-transactions',
      target_section: 'retraits',
    });
    return Response.json({ success: true, demande });
  }

  // ── ACTION: valider_retrait (admin) ──────────────────────────
  if (action === 'valider_retrait') {
    if (user.role !== 'admin') return Response.json({ error: 'Interdit' }, { status: 403 });
    const { demande_id } = body;
    const [demande] = await base44.asServiceRole.entities.DemandeRetrait.filter({ id: demande_id });
    if (!demande) return Response.json({ error: 'Demande introuvable' }, { status: 404 });
    const bedou = await getBedou(demande.user_email);
    if (!bedou) return Response.json({ error: 'Bedou introuvable' }, { status: 404 });
    await updateBedou(bedou.id, {
      solde: Math.max(0, (bedou.solde || 0) - demande.montant),
      solde_bloque: Math.max(0, (bedou.solde_bloque || 0) - demande.montant),
    });
    await base44.asServiceRole.entities.DemandeRetrait.update(demande_id, {
      statut: 'paye',
      date_validation: new Date().toISOString(),
      valide_par: user.email,
    });
    await createTransaction({
      user_email: demande.user_email,
      user_nom: demande.user_nom,
      role: demande.role,
      type: 'retrait',
      sens: 'debit',
      montant: demande.montant,
      source: 'bedou',
      methode: demande.methode,
      reference_id: demande_id,
      description: `Retrait vers ${demande.methode} - ${demande.numero_reception}`,
      valide_par: user.email,
      statut: 'paye',
    });
    await base44.asServiceRole.entities.Notification.create({
      destinataire_email: demande.user_email,
      destinataire_role: demande.role,
      titre: '✅ Retrait validé',
      message: `Votre retrait de ${demande.montant.toLocaleString()} F CFA a été payé.`,
      type: 'success',
      lue: false,
      target_screen: '/mon-bedou',
      target_entity_type: 'transaction',
    });
    return Response.json({ success: true });
  }

  // ── ACTION: refuser_retrait (admin) ──────────────────────────
  if (action === 'refuser_retrait') {
    if (user.role !== 'admin') return Response.json({ error: 'Interdit' }, { status: 403 });
    const { demande_id, motif } = body;
    const [demande] = await base44.asServiceRole.entities.DemandeRetrait.filter({ id: demande_id });
    if (!demande) return Response.json({ error: 'Demande introuvable' }, { status: 404 });
    const bedou = await getBedou(demande.user_email);
    if (bedou) {
      await updateBedou(bedou.id, {
        solde_disponible: (bedou.solde_disponible || 0) + demande.montant,
        solde_bloque: Math.max(0, (bedou.solde_bloque || 0) - demande.montant),
      });
    }
    await base44.asServiceRole.entities.DemandeRetrait.update(demande_id, {
      statut: 'refuse',
      motif_refus: motif || 'Refusé',
      date_validation: new Date().toISOString(),
      valide_par: user.email,
    });
    return Response.json({ success: true });
  }

  // ── ACTION: crediter_livreur (appelé après course validée) ────
  if (action === 'crediter_livreur') {
    const { livreur_email, livreur_nom, montant_course, course_id } = body;
    const commission = Math.round(montant_course * COMMISSION_LIVREUR);
    const gain = montant_course - commission;
    const bedou = await ensureBedou(livreur_email, 'livreur', livreur_nom);
    await updateBedou(bedou.id, {
      solde: (bedou.solde || 0) + gain,
      solde_disponible: (bedou.solde_disponible || 0) + gain,
      gains_totaux: (bedou.gains_totaux || 0) + gain,
    });
    await createTransaction({
      user_email: livreur_email,
      user_nom: livreur_nom,
      role: 'livreur',
      type: 'gain',
      sens: 'credit',
      montant: gain,
      source: 'course',
      methode: 'interne',
      reference_id: course_id,
      description: `Gain course #${course_id} (${montant_course} - ${commission} CDL)`,
      statut: 'valide',
    });
    return Response.json({ success: true, gain, commission });
  }

  // ── ACTION: crediter_partenaire ───────────────────────────────
  if (action === 'crediter_partenaire') {
    const { partenaire_email, partenaire_nom, montant_commande, commande_id } = body;
    const commission = Math.round(montant_commande * COMMISSION_PARTENAIRE);
    const gain = montant_commande - commission;
    const bedou = await ensureBedou(partenaire_email, 'partenaire', partenaire_nom);
    await updateBedou(bedou.id, {
      solde: (bedou.solde || 0) + gain,
      solde_disponible: (bedou.solde_disponible || 0) + gain,
      gains_totaux: (bedou.gains_totaux || 0) + gain,
    });
    await createTransaction({
      user_email: partenaire_email,
      user_nom: partenaire_nom,
      role: 'partenaire',
      type: 'gain',
      sens: 'credit',
      montant: gain,
      source: 'commande',
      methode: 'interne',
      reference_id: commande_id,
      description: `Gain commande #${commande_id} (commission CDL ${commission} F CFA)`,
      statut: 'valide',
    });
    return Response.json({ success: true, gain, commission });
  }

  // ── ACTION: bonus_commercial ──────────────────────────────────
  if (action === 'bonus_commercial') {
    const { client_email, course_id } = body;
    // Vérifier si le client a un code promo lié
    const [clientUser] = await base44.asServiceRole.entities.User.filter({ email: client_email });
    if (!clientUser?.code_promo_utilise) return Response.json({ skip: true, reason: 'no_promo' });
    // Trouver le code promo et le commercial
    const [promo] = await base44.asServiceRole.entities.CodePromo.filter({ code: clientUser.code_promo_utilise });
    if (!promo) return Response.json({ skip: true, reason: 'promo_not_found' });
    // Vérifier si ce client a déjà reçu le bonus
    const [commercial] = await base44.asServiceRole.entities.User.filter({ email: promo.commercial_email });
    if (!commercial) return Response.json({ skip: true, reason: 'commercial_not_found' });
    // Vérifier première course (aucune course validée avant)
    const prevCourses = await base44.asServiceRole.entities.Course.filter({ client_email, statut: 'livree' });
    const currentCourse = prevCourses.find(c => c.id === course_id);
    // Si plus d'une course livrée (incluant celle-ci), pas la première
    const autresCourses = prevCourses.filter(c => c.id !== course_id);
    if (autresCourses.length > 0) return Response.json({ skip: true, reason: 'not_first_course' });
    // Vérifier si bonus déjà versé
    if (clientUser.bonus_commercial_traite) return Response.json({ skip: true, reason: 'already_done' });
    // Créditer le commercial — dans balance_blocked (seuil 5000 F avant retrait)
    const bedouComm = await ensureBedou(promo.commercial_email, 'commercial', commercial.full_name);
    const newBalanceBlocked = (bedouComm.balance_blocked || 0) + BONUS_COMMERCIAL;
    await updateBedou(bedouComm.id, {
      solde: (bedouComm.solde || 0) + BONUS_COMMERCIAL,
      // Ne pas créditer solde_disponible : le gain commercial est bloqué jusqu'au seuil de 5000 F
      balance_blocked: newBalanceBlocked,
      gains_totaux: (bedouComm.gains_totaux || 0) + BONUS_COMMERCIAL,
    });
    await createTransaction({
      user_email: promo.commercial_email,
      user_nom: commercial.full_name,
      role: 'commercial',
      type: 'bonus',
      sens: 'credit',
      montant: BONUS_COMMERCIAL,
      source: 'promo',
      methode: 'interne',
      reference_id: course_id,
      description: `Bonus parrainage client ${client_email} - code ${clientUser.code_promo_utilise}`,
      statut: 'valide',
    });
    // Notif commercial avec deep-link
    await base44.asServiceRole.entities.Notification.create({
      destinataire_email: promo.commercial_email,
      destinataire_role: 'commercial',
      titre: '🎉 Bonus parrainage reçu !',
      message: `+${BONUS_COMMERCIAL} F CFA ajoutés à vos gains. Un client parrainé a effectué sa première course.`,
      type: 'success',
      lue: false,
      target_screen: '/mon-bedou',
      target_entity_type: 'transaction',
    });
    // Marquer le bonus comme versé
    await base44.asServiceRole.entities.User.update(clientUser.id, { bonus_commercial_traite: true });
    return Response.json({ success: true, bonus: BONUS_COMMERCIAL });
  }

  // ── ACTION: finaliser_course (livreur appelle à la livraison) ─────────────
  // Débite le client, crédite le livreur (80%), CDL garde 20%
  if (action === 'finaliser_course') {
    const { course_id, client_email, client_nom, livreur_email, livreur_nom, montant } = body;
    if (!montant || montant <= 0) return Response.json({ error: 'Montant invalide' }, { status: 400 });
    // Anti double-exécution
    const existingTx = await base44.asServiceRole.entities.Transaction.filter({ reference_id: course_id, type: 'paiement' });
    if (existingTx.length > 0) return Response.json({ error: 'Course déjà réglée' }, { status: 400 });
    // Bedou client
    const bedouClient = await getBedou(client_email);
    if (!bedouClient) return Response.json({ error: 'Bedou client introuvable' }, { status: 404 });
    if ((bedouClient.solde_disponible || 0) < montant) {
      return Response.json({ success: false, insuffisant: true, solde: bedouClient.solde_disponible || 0 }, { status: 200 });
    }
    // Débiter client
    await updateBedou(bedouClient.id, {
      solde: Math.max(0, (bedouClient.solde || 0) - montant),
      solde_disponible: Math.max(0, (bedouClient.solde_disponible || 0) - montant),
      depenses_totales: (bedouClient.depenses_totales || 0) + montant,
    });
    await createTransaction({
      user_email: client_email,
      user_nom: client_nom,
      role: 'client',
      type: 'paiement',
      sens: 'debit',
      montant,
      source: 'course',
      methode: 'interne',
      reference_id: course_id,
      description: `Paiement course #${course_id} via Bedou`,
      statut: 'valide',
    });
    // Créditer livreur 80%
    const gainLivreur = Math.round(montant * 0.8);
    const commissionCdl = montant - gainLivreur;
    const bedouLivreur = await ensureBedou(livreur_email, 'livreur', livreur_nom);
    await updateBedou(bedouLivreur.id, {
      solde: (bedouLivreur.solde || 0) + gainLivreur,
      solde_disponible: (bedouLivreur.solde_disponible || 0) + gainLivreur,
      gains_totaux: (bedouLivreur.gains_totaux || 0) + gainLivreur,
    });
    await createTransaction({
      user_email: livreur_email,
      user_nom: livreur_nom,
      role: 'livreur',
      type: 'gain',
      sens: 'credit',
      montant: gainLivreur,
      source: 'course',
      methode: 'interne',
      reference_id: course_id,
      description: `Gain course #${course_id} (80% de ${montant} FCFA)`,
      statut: 'valide',
    });
    // Créditer Bedou CDL (20%)
    const bedouCdl = await ensureBedou(CDL_EMAIL, 'admin', 'CDL');
    await updateBedou(bedouCdl.id, {
      solde: (bedouCdl.solde || 0) + commissionCdl,
      solde_disponible: (bedouCdl.solde_disponible || 0) + commissionCdl,
      gains_totaux: (bedouCdl.gains_totaux || 0) + commissionCdl,
    });
    await createTransaction({
      user_email: CDL_EMAIL,
      user_nom: 'CDL',
      role: 'admin',
      type: 'commission',
      sens: 'credit',
      montant: commissionCdl,
      source: 'course',
      methode: 'interne',
      reference_id: course_id,
      description: `Commission CDL 20% course #${course_id}`,
      statut: 'valide',
    });
    return Response.json({ success: true, gainLivreur, commissionCdl });
  }

  // ── ACTION: ajuster_solde (admin) ────────────────────────────
  if (action === 'ajuster_solde') {
    if (user.role !== 'admin') return Response.json({ error: 'Interdit' }, { status: 403 });
    const { target_email, montant, sens, description } = body;
    const bedou = await getBedou(target_email);
    if (!bedou) return Response.json({ error: 'Bedou introuvable' }, { status: 404 });
    const delta = sens === 'credit' ? montant : -montant;
    await updateBedou(bedou.id, {
      solde: Math.max(0, (bedou.solde || 0) + delta),
      solde_disponible: Math.max(0, (bedou.solde_disponible || 0) + delta),
    });
    await createTransaction({
      user_email: target_email,
      user_nom: bedou.user_nom,
      role: bedou.role,
      type: 'ajustement',
      sens,
      montant,
      source: 'manuel',
      methode: 'interne',
      reference_id: user.email,
      description: description || `Ajustement admin par ${user.email}`,
      valide_par: user.email,
      statut: 'valide',
    });
    return Response.json({ success: true });
  }

  return Response.json({ error: 'Action inconnue' }, { status: 400 });
});