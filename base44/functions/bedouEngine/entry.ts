import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const COMMISSION_LIVREUR = 0.20; // 20% CDL
const COMMISSION_PARTENAIRE = 0.05; // 5% CDL
const BONUS_COMMERCIAL = 50; // 50 F CFA fixe
const CDL_EMAIL = 'weezyh2@gmail.com'; // Compte Bedou CDL

// Bonus sur les 3 premières recharges uniquement
const BONUS_RECHARGE = [
  { seuil: 10000, bonus: 1500 },
  { seuil: 5000,  bonus: 500  },
];
const MAX_BONUS_RECHARGES = 3; // Limite à 3 recharges avec bonus

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
        solde_bonus: 0,
        bonus: 0,
        bonus_recharge_count: 0,
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
    const bedou = await ensureBedou(user.email, user.user_type || user.current_role || 'client', user.full_name);
    const transactions = await base44.asServiceRole.entities.Transaction.filter(
      { user_email: user.email }, '-created_date', 50
    );
    return Response.json({ bedou, transactions });
  }

  // ── ACTION: demande_recharge ──────────────────────────────────
  if (action === 'demande_recharge') {
    const { montant, methode, preuve_paiement } = body;
    if (!montant || montant < 100) return Response.json({ error: 'Montant minimum 100 F CFA' }, { status: 400 });
    const bedou = await ensureBedou(user.email, user.user_type || user.current_role || 'client', user.full_name);
    if (bedou.statut_bedou === 'suspendu') return Response.json({ error: 'Bedou suspendu' }, { status: 403 });
    // Bonus uniquement sur les 3 premières recharges
    const bonusCount = bedou.bonus_recharge_count || 0;
    const bonusEligible = bonusCount < MAX_BONUS_RECHARGES;
    const bonusObj = bonusEligible ? BONUS_RECHARGE.find(b => montant >= b.seuil) : null;
    const bonus_applique = bonusObj ? bonusObj.bonus : 0;
    const bonus_restants = Math.max(0, MAX_BONUS_RECHARGES - bonusCount - (bonus_applique > 0 ? 1 : 0));
    const demande = await base44.asServiceRole.entities.DemandeRecharge.create({
      user_email: user.email,
      user_nom: user.full_name,
      role: user.user_type,
      montant,
      methode,
      numero_transaction: '',
      preuve_paiement: preuve_paiement || '',
      statut: 'en_attente',
      bonus_applique,
    });
    const ADMIN_EMAIL = 'weezyh2@gmail.com';
    const notifTitle = '💰 Nouvelle demande de recharge Bedou';
    const notifMsg = `${user.full_name} demande une recharge de ${montant.toLocaleString()} F CFA via ${methode}.`;

    // 1. Notification interne admin
    await base44.asServiceRole.entities.Notification.create({
      destinataire_email: ADMIN_EMAIL,
      destinataire_role: 'admin',
      titre: notifTitle,
      message: notifMsg,
      type: 'info',
      lue: false,
      target_screen: '/gestion-transactions',
      target_section: 'recharges',
    });

    // 2. Push FCM admin via canal officiel (fire & forget)
    base44.asServiceRole.functions.invoke('sendCdlNotification', {
      role: 'admin',
      title: notifTitle,
      body: notifMsg,
      data: {
        type: 'bedou_recharge_request',
        entity_id: demande.id,
        entity_type: 'DemandeRecharge',
        notif_route: '/gestion-transactions',
        user_nom: user.full_name,
        montant: String(montant),
      },
    }).catch(e => console.warn('[bedouEngine] Push admin non-bloquant:', e.message));

    return Response.json({ success: true, demande, bonus_applique, bonus_restants });
  }

  // ── ACTION: valider_recharge (admin) ──────────────────────────
  if (action === 'valider_recharge') {
    if (user.role !== 'admin') return Response.json({ error: 'Interdit' }, { status: 403 });
    const { demande_id } = body;
    const [demande] = await base44.asServiceRole.entities.DemandeRecharge.filter({ id: demande_id });
    if (!demande) return Response.json({ error: 'Demande introuvable' }, { status: 404 });
    if (demande.statut !== 'en_attente') return Response.json({ error: 'Déjà traitée' }, { status: 400 });

    const bedou = await ensureBedou(demande.user_email, demande.role, demande.user_nom);
    const bonusApplique = demande.bonus_applique || 0;
    const bedouUpdates = {
      solde: (bedou.solde || 0) + demande.montant + bonusApplique,
      solde_disponible: (bedou.solde_disponible || 0) + demande.montant,
      solde_bonus: (bedou.solde_bonus || 0) + bonusApplique,
      bonus: (bedou.bonus || 0) + bonusApplique,
    };
    // Incrémenter le compteur si un bonus a été appliqué
    if (bonusApplique > 0) {
      bedouUpdates.bonus_recharge_count = (bedou.bonus_recharge_count || 0) + 1;
    }
    await updateBedou(bedou.id, bedouUpdates);
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
    // Vérifier le rôle via user_type OU current_role (multi-profils)
    const userRole = user.user_type || user.current_role || '';
    if (!['livreur', 'partenaire', 'commercial'].includes(userRole)) {
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
    // Notifier le client du refus
    await base44.asServiceRole.entities.Notification.create({
      destinataire_email: demande.user_email,
      destinataire_role: demande.role,
      titre: '❌ Retrait refusé',
      message: `Votre demande de retrait de ${demande.montant?.toLocaleString()} F CFA a été refusée.${motif ? ` Motif : ${motif}` : ''}`,
      type: 'danger',
      lue: false,
      target_screen: '/mon-bedou',
    }).catch(() => {});
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

  // ── ACTION: relancer_settlement (admin) — relance les courses bloquées en pending ──
  if (action === 'relancer_settlement') {
    if (user.role !== 'admin') return Response.json({ error: 'Interdit' }, { status: 403 });
    const { course_id } = body;
    const L = (msg) => console.log(`[relancer_settlement] ${new Date().toISOString()} | ${msg}`);

    // Charger la course
    const courseList = await base44.asServiceRole.entities.Course.filter({ id: course_id });
    const course = courseList?.[0];
    if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

    if (course.settlement_status === 'completed') {
      L(`SKIP — déjà réglée`);
      return Response.json({ success: true, alreadyDone: true });
    }
    if (!['livree', 'en_cours'].includes(course.statut)) {
      return Response.json({ error: `Statut invalide pour règlement : ${course.statut}` }, { status: 400 });
    }
    if (!course.prix || !course.client_email || !course.livreur_email) {
      return Response.json({ error: 'Données course incomplètes (prix/client/livreur manquants)' }, { status: 400 });
    }

    const montant = course.prix;
    const client_email = course.client_email;
    const livreur_email = course.livreur_email;
    const client_nom = course.client_name || course.client_email;
    const livreur_nom = course.livreur_name || course.livreur_email;
    const settledAt = new Date().toISOString();
    L(`START | course=${course_id} | montant=${montant} | client=${client_email} | livreur=${livreur_email}`);
    console.log(`[SETTLEMENT_TRIGGERED] course_id=${course_id} | source=relancer_settlement_admin`);

    // Anti-doublon : transaction paiement existante ?
    const existingTx = await base44.asServiceRole.entities.Transaction.filter({ reference_id: course_id, type: 'paiement' }).catch(() => []);
    if (existingTx.length > 0) {
      L(`SKIP — transaction paiement déjà présente`);
      await base44.asServiceRole.entities.Course.update(course_id, { settlement_status: 'completed', settled_at: settledAt }).catch(() => {});
      return Response.json({ success: true, alreadyDone: true });
    }

    const gainLivreur = Math.round(montant * 0.8);
    const commissionCdl = montant - gainLivreur;

    // Log règlement
    let settlementLog = null;
    try {
      settlementLog = await base44.asServiceRole.entities.CourseSettlementLog.create({
        course_id, client_email, client_nom, driver_email: livreur_email, driver_nom: livreur_nom,
        cdl_wallet_email: CDL_EMAIL, course_amount: montant,
        client_debit: montant, driver_credit: gainLivreur, cdl_commission: commissionCdl,
        settlement_status: 'pending',
      });
    } catch (_) {}

    const updateLog = (upd) => settlementLog?.id
      ? base44.asServiceRole.entities.CourseSettlementLog.update(settlementLog.id, upd).catch(() => {})
      : Promise.resolve();

    // Vérifier solde client
    console.log(`[BEDOU_BALANCE_CHECK] client=${client_email} | montant_requis=${montant}`);
    const bedouClient = await getBedou(client_email);
    if (!bedouClient) {
      await updateLog({ settlement_status: 'failed', error_message: 'Bedou client introuvable' });
      await base44.asServiceRole.entities.Course.update(course_id, { settlement_status: 'failed', settlement_error: 'Bedou client introuvable' }).catch(() => {});
      console.log(`[SETTLEMENT_FAILED] course_id=${course_id} | raison=bedou_client_introuvable`);
      return Response.json({ success: false, error: 'Bedou client introuvable' }, { status: 404 });
    }
    const soldeBonus = bedouClient.solde_bonus || 0;
    const soldeDispo = bedouClient.solde_disponible || 0;
    const totalSolde = soldeBonus + soldeDispo;
    console.log(`[BEDOU_BALANCE_CHECK] client=${client_email} | total=${totalSolde} | requis=${montant} | suffisant=${totalSolde >= montant}`);
    if (totalSolde < montant) {
      await updateLog({ settlement_status: 'failed', error_message: `Solde insuffisant: ${totalSolde}` });
      await base44.asServiceRole.entities.Course.update(course_id, { settlement_status: 'failed', settlement_error: `Solde insuffisant: ${totalSolde}` }).catch(() => {});
      console.log(`[SETTLEMENT_FAILED] course_id=${course_id} | raison=solde_insuffisant | solde=${totalSolde}`);
      return Response.json({ success: false, insuffisant: true, solde: totalSolde });
    }
    const fromBonus = Math.min(soldeBonus, montant);
    const fromDispo = montant - fromBonus;

    // Débiter client
    await updateBedou(bedouClient.id, {
      solde: Math.max(0, (bedouClient.solde || 0) - montant),
      solde_bonus: Math.max(0, soldeBonus - fromBonus),
      solde_disponible: Math.max(0, soldeDispo - fromDispo),
      depenses_totales: (bedouClient.depenses_totales || 0) + montant,
    });
    const txClient = await createTransaction({ user_email: client_email, user_nom: client_nom, role: 'client', type: 'paiement', sens: 'debit', montant, source: 'course', methode: 'interne', reference_id: course_id, description: `Paiement course ${course_id} via Bedou (relance admin)`, statut: 'valide' });
    console.log(`[BEDOU_DEBIT_CLIENT_SUCCESS] course_id=${course_id} | client=${client_email} | montant=${montant} | tx_id=${txClient?.id}`);

    // Créditer livreur 80%
    const bedouLivreur = await ensureBedou(livreur_email, 'livreur', livreur_nom);
    await updateBedou(bedouLivreur.id, { solde: (bedouLivreur.solde || 0) + gainLivreur, solde_disponible: (bedouLivreur.solde_disponible || 0) + gainLivreur, gains_totaux: (bedouLivreur.gains_totaux || 0) + gainLivreur });
    const txLivreur = await createTransaction({ user_email: livreur_email, user_nom: livreur_nom, role: 'livreur', type: 'gain', sens: 'credit', montant: gainLivreur, source: 'course', methode: 'interne', reference_id: course_id, description: `Gain course ${course_id} — relance admin`, statut: 'valide' });
    console.log(`[BEDOU_CREDIT_DRIVER_SUCCESS] course_id=${course_id} | livreur=${livreur_email} | gain=${gainLivreur} | tx_id=${txLivreur?.id}`);

    // Créditer CDL 20%
    const bedouCdl = await ensureBedou(CDL_EMAIL, 'admin', 'CDL');
    await updateBedou(bedouCdl.id, { solde: (bedouCdl.solde || 0) + commissionCdl, solde_disponible: (bedouCdl.solde_disponible || 0) + commissionCdl, gains_totaux: (bedouCdl.gains_totaux || 0) + commissionCdl });
    const txCdl = await createTransaction({ user_email: CDL_EMAIL, user_nom: 'CDL', role: 'admin', type: 'commission', sens: 'credit', montant: commissionCdl, source: 'course', methode: 'interne', reference_id: course_id, description: `Commission CDL 20% — course ${course_id} (relance admin)`, statut: 'valide' });
    console.log(`[CDL_COMMISSION_SUCCESS] course_id=${course_id} | commission=${commissionCdl} | tx_id=${txCdl?.id}`);

    // Marquer completed
    await base44.asServiceRole.entities.Course.update(course_id, { settlement_status: 'completed', settled_at: settledAt, statut: 'livree', date_livraison: settledAt, statut_paiement: 'paye', gain_livreur: gainLivreur, commission_cdl: commissionCdl, statut_paiement_livreur: 'Payé' }).catch(() => {});
    await updateLog({ settlement_status: 'completed', settled_at: settledAt, tx_client_id: txClient?.id || '', tx_driver_id: txLivreur?.id || '', tx_cdl_id: txCdl?.id || '' });
    console.log(`[SETTLEMENT_COMPLETED] course_id=${course_id} | source=relance_admin | gainLivreur=${gainLivreur} | commissionCdl=${commissionCdl}`);

    return Response.json({ success: true, gainLivreur, commissionCdl, settlement_log_id: settlementLog?.id });
  }

  // ── ACTION: audit_settlement_pending (admin) — liste les courses pending ──
  if (action === 'audit_settlement_pending') {
    if (user.role !== 'admin') return Response.json({ error: 'Interdit' }, { status: 403 });
    const pending = await base44.asServiceRole.entities.Course.filter(
      { settlement_status: 'pending' }, '-created_date', 50
    );
    const relevant = pending.filter(c => ['livree', 'en_cours'].includes(c.statut) && c.client_email && c.livreur_email && c.prix);
    return Response.json({ success: true, count: relevant.length, courses: relevant.map(c => ({
      id: c.id,
      statut: c.statut,
      settlement_status: c.settlement_status,
      client_email: c.client_email,
      livreur_email: c.livreur_email,
      prix: c.prix,
      created_date: c.created_date,
    }))});
  }

  // ── ACTION: finaliser_course ──────────────────────────────────────────────
  // Débite client, crédite livreur (80%) + CDL (20%).
  // APPEL UNIQUE : quand le livreur clique "Colis livré".
  // ATOMICITÉ : si le débit client échoue, rien n'est crédité.
  // ANTI-DOUBLON RENFORCÉ : vérification Transaction + settlement_status Course.
  if (action === 'finaliser_course') {
    const { course_id, client_email, client_nom, livreur_email, livreur_nom, montant } = body;
    const L = (msg) => console.log(`[bedouEngine/finaliser_course] ${new Date().toISOString()} | ${msg}`);

    if (!course_id) return Response.json({ error: 'course_id requis' }, { status: 400 });
    if (!montant || montant <= 0) return Response.json({ error: 'Montant invalide' }, { status: 400 });
    if (!client_email || !livreur_email) return Response.json({ error: 'client_email et livreur_email requis' }, { status: 400 });

    const settledAt = new Date().toISOString();
    console.log(`[COURSE_TEST_AUDIT_START] course_id=${course_id} | montant=${montant} | client=${client_email} | livreur=${livreur_email} | ts=${settledAt}`);
    L(`START | course=${course_id} | montant=${montant} | client=${client_email} | livreur=${livreur_email}`);

    // ── ANTI-DOUBLON 1 : settlement_status sur la Course ─────────────────────
    // Vérification prioritaire — bloque avant toute lecture Bedou
    console.log(`[SETTLEMENT_TRIGGERED] course_id=${course_id} | vérification anti-doublon...`);
    const courseCheck = await base44.asServiceRole.entities.Course.filter({ id: course_id }, null, 1).catch(() => []);
    const courseRecord = courseCheck?.[0];
    if (courseRecord?.settlement_status === 'completed') {
      console.log(`[SETTLEMENT_TRIGGERED] SKIP — déjà completed`);
      L(`SKIP — settlement_status=completed (course déjà réglée)`);
      const gainLivreur = Math.round(montant * 0.8);
      return Response.json({ success: true, alreadyDone: true, gainLivreur, commissionCdl: montant - gainLivreur });
    }

    // ── ANTI-DOUBLON 2 : transaction de paiement existante ───────────────────
    const existingTx = await base44.asServiceRole.entities.Transaction.filter({ reference_id: course_id, type: 'paiement' }).catch(() => []);
    if (existingTx.length > 0) {
      L(`SKIP — transaction paiement déjà présente`);
      // Synchroniser le settlement_status si besoin
      if (courseRecord && courseRecord.settlement_status !== 'completed') {
        base44.asServiceRole.entities.Course.update(course_id, { settlement_status: 'completed', settled_at: settledAt }).catch(() => {});
      }
      const gainLivreur = Math.round(montant * 0.8);
      return Response.json({ success: true, alreadyDone: true, gainLivreur, commissionCdl: montant - gainLivreur });
    }

    // ── Calculs ───────────────────────────────────────────────────────────────
    const gainLivreur = Math.round(montant * 0.8);
    const commissionCdl = montant - gainLivreur;
    L(`Calculs — gainLivreur=${gainLivreur} commissionCdl=${commissionCdl}`);

    // ── Créer log de règlement (pending) ─────────────────────────────────────
    let settlementLog = null;
    try {
      settlementLog = await base44.asServiceRole.entities.CourseSettlementLog.create({
        course_id,
        client_email,
        client_nom: client_nom || client_email,
        driver_email: livreur_email,
        driver_nom: livreur_nom || livreur_email,
        cdl_wallet_email: CDL_EMAIL,
        course_amount: montant,
        client_debit: montant,
        driver_credit: gainLivreur,
        cdl_commission: commissionCdl,
        settlement_status: 'pending',
      });
      L(`SettlementLog créé — id=${settlementLog.id}`);
    } catch (logErr) {
      L(`SettlementLog création échouée (non bloquant): ${logErr.message}`);
    }

    const updateLog = (updates) => {
      if (!settlementLog?.id) return Promise.resolve();
      return base44.asServiceRole.entities.CourseSettlementLog.update(settlementLog.id, updates).catch(() => {});
    };

    // ── ÉTAPE 1 : Vérifier et débiter client ─────────────────────────────────
    console.log(`[BEDOU_BALANCE_CHECK] course_id=${course_id} | client=${client_email} | recherche solde...`);
    const bedouClient = await getBedou(client_email);
    if (!bedouClient) {
      const errMsg = 'Bedou client introuvable';
      console.log(`[SETTLEMENT_FAILED] course_id=${course_id} | raison=${errMsg}`);
      await updateLog({ settlement_status: 'failed', error_message: errMsg });
      await base44.asServiceRole.entities.Course.update(course_id, { settlement_status: 'failed', settlement_error: errMsg }).catch(() => {});
      // Notifier admin
      base44.asServiceRole.functions.invoke('sendCdlNotification', {
        role: 'admin',
        title: '⚠️ Règlement course échoué',
        body: `Bedou client introuvable — course ${course_id} — ${client_email}`,
        data: { type: 'warning', entity_id: course_id, entity_type: 'Course', notif_route: '/gerer-courses' },
      }).catch(() => {});
      return Response.json({ success: false, insuffisant: false, error: errMsg }, { status: 404 });
    }

    const soldeBonus = bedouClient.solde_bonus || 0;
    const soldeDispo = bedouClient.solde_disponible || 0;
    const totalSolde = soldeBonus + soldeDispo;
    console.log(`[BEDOU_BALANCE_CHECK] client=${client_email} | bonus=${soldeBonus} | dispo=${soldeDispo} | total=${totalSolde} | requis=${montant} | suffisant=${totalSolde >= montant}`);
    L(`Solde client — bonus=${soldeBonus} dispo=${soldeDispo} total=${totalSolde} requis=${montant}`);

    if (totalSolde < montant) {
      const errMsg = `Solde insuffisant : ${totalSolde} F CFA (requis : ${montant} F CFA)`;
      console.log(`[SETTLEMENT_FAILED] course_id=${course_id} | raison=${errMsg}`);
      L(`REJET — ${errMsg}`);
      await updateLog({ settlement_status: 'failed', error_message: errMsg });
      await base44.asServiceRole.entities.Course.update(course_id, { settlement_status: 'failed', settlement_error: errMsg }).catch(() => {});
      // Notifier admin du solde insuffisant
      base44.asServiceRole.functions.invoke('sendCdlNotification', {
        role: 'admin',
        title: '⚠️ Solde Bedou insuffisant — course bloquée',
        body: `Client ${client_email} — solde ${totalSolde} F / requis ${montant} F — course ${course_id}`,
        data: { type: 'warning', entity_id: course_id, entity_type: 'Course', notif_route: '/gerer-courses' },
      }).catch(() => {});
      return Response.json({ success: false, insuffisant: true, solde: totalSolde });
    }

    // Ordre de prélèvement : solde_bonus d'abord, puis solde_disponible
    const fromBonus = Math.min(soldeBonus, montant);
    const fromDispo = montant - fromBonus;

    // ── ÉTAPE 2 : Débiter client ──────────────────────────────────────────────
    await updateBedou(bedouClient.id, {
      solde: Math.max(0, (bedouClient.solde || 0) - montant),
      solde_bonus: Math.max(0, soldeBonus - fromBonus),
      solde_disponible: Math.max(0, soldeDispo - fromDispo),
      depenses_totales: (bedouClient.depenses_totales || 0) + montant,
    });
    const txClient = await createTransaction({
      user_email: client_email,
      user_nom: client_nom,
      role: 'client',
      type: 'paiement',
      sens: 'debit',
      montant,
      source: 'course',
      methode: 'interne',
      reference_id: course_id,
      description: `Paiement course ${course_id} via Bedou`,
      statut: 'valide',
    });
    console.log(`[BEDOU_DEBIT_CLIENT_SUCCESS] course_id=${course_id} | client=${client_email} | montant=${montant} | tx_id=${txClient?.id}`);
    L(`Client débité — txId=${txClient?.id}`);

    // ── ÉTAPE 3 : Créditer livreur (80%) ─────────────────────────────────────
    const bedouLivreur = await ensureBedou(livreur_email, 'livreur', livreur_nom);
    await updateBedou(bedouLivreur.id, {
      solde: (bedouLivreur.solde || 0) + gainLivreur,
      solde_disponible: (bedouLivreur.solde_disponible || 0) + gainLivreur,
      gains_totaux: (bedouLivreur.gains_totaux || 0) + gainLivreur,
    });
    const txLivreur = await createTransaction({
      user_email: livreur_email,
      user_nom: livreur_nom,
      role: 'livreur',
      type: 'gain',
      sens: 'credit',
      montant: gainLivreur,
      source: 'course',
      methode: 'interne',
      reference_id: course_id,
      description: `Gain course ${course_id} — 80% de ${montant} FCFA`,
      statut: 'valide',
    });
    console.log(`[BEDOU_CREDIT_DRIVER_SUCCESS] course_id=${course_id} | livreur=${livreur_email} | gain=${gainLivreur} | tx_id=${txLivreur?.id}`);
    L(`Livreur crédité — gain=${gainLivreur} txId=${txLivreur?.id}`);

    // ── ÉTAPE 4 : Créditer CDL (20%) ─────────────────────────────────────────
    const bedouCdl = await ensureBedou(CDL_EMAIL, 'admin', 'CDL');
    await updateBedou(bedouCdl.id, {
      solde: (bedouCdl.solde || 0) + commissionCdl,
      solde_disponible: (bedouCdl.solde_disponible || 0) + commissionCdl,
      gains_totaux: (bedouCdl.gains_totaux || 0) + commissionCdl,
    });
    const txCdl = await createTransaction({
      user_email: CDL_EMAIL,
      user_nom: 'CDL',
      role: 'admin',
      type: 'commission',
      sens: 'credit',
      montant: commissionCdl,
      source: 'course',
      methode: 'interne',
      reference_id: course_id,
      description: `Commission CDL 20% — course ${course_id}`,
      statut: 'valide',
    });
    console.log(`[CDL_COMMISSION_SUCCESS] course_id=${course_id} | commission=${commissionCdl} | tx_id=${txCdl?.id}`);
    L(`CDL crédité — commission=${commissionCdl} txId=${txCdl?.id}`);

    // ── ÉTAPE 5 : Marquer la course comme réglée ──────────────────────────────
    base44.asServiceRole.entities.Course.update(course_id, {
      settlement_status: 'completed',
      settled_at: settledAt,
    }).catch(e => L(`Course settlement_status update non-bloquant: ${e.message}`));

    // ── ÉTAPE 6 : Mettre à jour le log de règlement ───────────────────────────
    await updateLog({
      settlement_status: 'completed',
      settled_at: settledAt,
      tx_client_id: txClient?.id || '',
      tx_driver_id: txLivreur?.id || '',
      tx_cdl_id: txCdl?.id || '',
    });
    console.log(`[SETTLEMENT_COMPLETED] course_id=${course_id} | settlement_log_id=${settlementLog?.id} | gainLivreur=${gainLivreur} | commissionCdl=${commissionCdl} | client=${client_email} | livreur=${livreur_email}`);
    L(`CourseSettlementLog mis à jour — completed`);

    // ── ÉTAPE 7 : Notifications push (fire & forget) ──────────────────────────
    // Client
    base44.asServiceRole.functions.invoke('sendCdlNotification', {
      user_email: client_email,
      title: '💳 Paiement course effectué',
      body: `Votre Bedou a été débité de ${montant.toLocaleString()} F CFA.`,
      data: { type: 'course_delivered', entity_id: course_id, entity_type: 'Course', notif_route: `/course/${course_id}/track` },
    }).catch(e => L(`Push client non-bloquant: ${e.message}`));

    // Livreur
    base44.asServiceRole.functions.invoke('sendCdlNotification', {
      user_email: livreur_email,
      title: '💰 Gain course crédité',
      body: `Votre Bedou a été crédité de ${gainLivreur.toLocaleString()} F CFA.`,
      data: { type: 'course_delivered_driver', entity_id: course_id, entity_type: 'Course', notif_route: '/mes-gains' },
    }).catch(e => L(`Push livreur non-bloquant: ${e.message}`));

    // Admin/CDL
    base44.asServiceRole.functions.invoke('sendCdlNotification', {
      role: 'admin',
      title: '📊 Commission CDL reçue',
      body: `CDL a reçu ${commissionCdl.toLocaleString()} F CFA sur une course livrée.`,
      data: { type: 'payment_validated', entity_id: course_id, entity_type: 'Course', notif_route: '/admin/financial-dashboard' },
    }).catch(e => L(`Push admin non-bloquant: ${e.message}`));

    console.log(`[COURSE_TEST_AUDIT_END] course_id=${course_id} | status=SUCCESS | gainLivreur=${gainLivreur} | commissionCdl=${commissionCdl} | settlementLog=${settlementLog?.id}`);
    L(`DONE | gainLivreur=${gainLivreur} commissionCdl=${commissionCdl} settlementLog=${settlementLog?.id}`);
    return Response.json({ success: true, gainLivreur, commissionCdl, settlement_log_id: settlementLog?.id });
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