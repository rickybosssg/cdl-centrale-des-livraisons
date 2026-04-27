import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Annulation de course avec ou sans frais selon la règle CDL :
 * - Pas encore acceptée → annulation gratuite (statuts: en_attente, assignee_attente, aucun_livreur)
 * - Acceptée mais colis non récupéré (statut: acceptee) → 50% de frais
 *   - CDL prend 20% des frais
 *   - Le livreur reçoit 80% des frais
 * - En cours (statut: en_cours) → annulation client impossible (admin seulement)
 *
 * IMPORTANT : Le Bedou n'est PAS débité à la création de course.
 * Le débit Bedou client n'intervient qu'à la finalisation (livrerColis).
 * Donc, l'annulation avec frais débite directement du Bedou client.
 */

const CDL_EMAIL = 'weezyh2@gmail.com';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST required' }, { status: 405 });
  }

  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { courseId, adminOverride } = await req.json();
  if (!courseId) {
    return Response.json({ error: 'courseId required' }, { status: 400 });
  }

  // 1. Récupérer la course
  const courses = await base44.asServiceRole.entities.Course.filter({ id: courseId });
  if (!courses || courses.length === 0) {
    return Response.json({ error: 'Course introuvable' }, { status: 404 });
  }
  const c = courses[0];

  // 2. Vérifier autorisation
  const isAdmin = user.role === 'admin';
  if (!isAdmin && c.client_email !== user.email) {
    return Response.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const statut = c.statut;
  const FREE_CANCEL = ['en_attente', 'assignee_attente', 'aucun_livreur'];
  const FEE_CANCEL = ['acceptee'];
  // en_cours : client ne peut pas annuler sauf admin
  const ADMIN_ONLY = ['en_cours'];

  const canCancel = FREE_CANCEL.includes(statut) || FEE_CANCEL.includes(statut) || (isAdmin && ADMIN_ONLY.includes(statut));
  if (!canCancel) {
    return Response.json({ error: `Annulation impossible en statut: ${statut}`, statut }, { status: 400 });
  }

  const now = new Date().toISOString();
  const prix = parseFloat(c.prix) || 0;
  const isFree = FREE_CANCEL.includes(statut);

  // ── Annulation GRATUITE ──────────────────────────────────────────────────
  if (isFree) {
    await base44.asServiceRole.entities.Course.update(c.id, {
      statut: 'annulee',
      annulee_par: isAdmin ? 'admin' : 'client',
      frais_annulation: 0,
      date_annulation: now,
    });

    // Libérer le livreur si assigné
    if (c.livreur_email) {
      const livs = await base44.asServiceRole.entities.User.filter({ email: c.livreur_email });
      if (livs?.[0]) {
        await base44.asServiceRole.entities.User.update(livs[0].id, {
          nombre_courses_actives: Math.max(0, (livs[0].nombre_courses_actives || 1) - 1),
          disponible: true,
        }).catch(() => {});
      }
    }

    // Notifications
    await base44.asServiceRole.entities.Notification.create({
      destinataire_email: c.client_email,
      destinataire_role: 'client',
      titre: '✅ Course annulée',
      message: 'Votre course a été annulée sans frais.',
      type: 'info',
      lue: false,
      course_id: courseId,
    }).catch(() => {});

    if (c.livreur_email) {
      await base44.asServiceRole.entities.Notification.create({
        destinataire_email: c.livreur_email,
        destinataire_role: 'livreur',
        titre: '❌ Course annulée',
        message: 'La course a été annulée par le client avant acceptation.',
        type: 'warning',
        lue: false,
        course_id: courseId,
      }).catch(() => {});
    }

    return Response.json({ success: true, courseId, statut: 'annulee', fraisAnnulation: 0, gratuit: true });
  }

  // ── Annulation AVEC FRAIS (50%) ──────────────────────────────────────────
  const fraisAnnulation = Math.round(prix * 0.5);
  const partCdl = Math.round(fraisAnnulation * 0.2);
  const partLivreur = fraisAnnulation - partCdl; // 80% des frais

  console.log(`[cancelCourseWithFees] Course ${courseId} | Prix: ${prix}F | Frais: ${fraisAnnulation}F | CDL: ${partCdl}F | Livreur: ${partLivreur}F`);

  // Vérifier solde client
  const clientBedouList = await base44.asServiceRole.entities.Bedou.filter({ user_email: c.client_email });
  if (!clientBedouList || clientBedouList.length === 0) {
    return Response.json({ error: 'Bedou client introuvable' }, { status: 400 });
  }
  const clientBedou = clientBedouList[0];
  const soldeDisponible = parseFloat(clientBedou.solde_disponible) || 0;

  if (soldeDisponible < fraisAnnulation) {
    return Response.json({
      error: 'insufficient_balance',
      required: fraisAnnulation,
      available: soldeDisponible,
      message: `Solde insuffisant. Il vous manque ${fraisAnnulation - soldeDisponible} F CFA.`,
    });
  }

  // Débiter client
  await base44.asServiceRole.entities.Bedou.update(clientBedou.id, {
    solde: Math.max(0, (parseFloat(clientBedou.solde) || 0) - fraisAnnulation),
    solde_disponible: Math.max(0, soldeDisponible - fraisAnnulation),
    depenses_totales: (parseFloat(clientBedou.depenses_totales) || 0) + fraisAnnulation,
  });

  await base44.asServiceRole.entities.Transaction.create({
    user_email: c.client_email,
    user_nom: c.client_name,
    role: 'client',
    type: 'annulation',
    sens: 'debit',
    montant: fraisAnnulation,
    source: 'course',
    methode: 'interne',
    reference_id: courseId,
    statut: 'valide',
    date_validation: now,
    description: `Frais annulation course #${courseId?.slice(0, 8)} (50%)`,
  });

  // Créditer livreur (80% des frais)
  if (c.livreur_email && partLivreur > 0) {
    const livreurBedouList = await base44.asServiceRole.entities.Bedou.filter({ user_email: c.livreur_email });
    if (livreurBedouList?.[0]) {
      const lb = livreurBedouList[0];
      await base44.asServiceRole.entities.Bedou.update(lb.id, {
        solde: (parseFloat(lb.solde) || 0) + partLivreur,
        solde_disponible: (parseFloat(lb.solde_disponible) || 0) + partLivreur,
        gains_totaux: (parseFloat(lb.gains_totaux) || 0) + partLivreur,
      });
      await base44.asServiceRole.entities.Transaction.create({
        user_email: c.livreur_email,
        user_nom: c.livreur_name,
        role: 'livreur',
        type: 'compensation',
        sens: 'credit',
        montant: partLivreur,
        source: 'course',
        methode: 'interne',
        reference_id: courseId,
        statut: 'valide',
        date_validation: now,
        description: `Compensation annulation course #${courseId?.slice(0, 8)} (80% des frais)`,
      });
      // Notifier livreur
      await base44.asServiceRole.entities.Notification.create({
        destinataire_email: c.livreur_email,
        destinataire_role: 'livreur',
        titre: '❌ Course annulée — compensation reçue',
        message: `Le client a annulé la course. Compensation : +${partLivreur.toLocaleString()} F CFA crédités sur votre Bedou.`,
        type: 'info',
        lue: false,
        course_id: courseId,
        target_screen: '/mon-bedou',
      }).catch(() => {});
    }

    // Libérer le livreur
    const livs = await base44.asServiceRole.entities.User.filter({ email: c.livreur_email });
    if (livs?.[0]) {
      await base44.asServiceRole.entities.User.update(livs[0].id, {
        nombre_courses_actives: Math.max(0, (livs[0].nombre_courses_actives || 1) - 1),
        disponible: true,
      }).catch(() => {});
    }
  }

  // Créditer CDL (20% des frais)
  if (partCdl > 0) {
    const cdlBedouList = await base44.asServiceRole.entities.Bedou.filter({ user_email: CDL_EMAIL });
    if (cdlBedouList?.[0]) {
      const cb = cdlBedouList[0];
      await base44.asServiceRole.entities.Bedou.update(cb.id, {
        solde: (parseFloat(cb.solde) || 0) + partCdl,
        solde_disponible: (parseFloat(cb.solde_disponible) || 0) + partCdl,
        gains_totaux: (parseFloat(cb.gains_totaux) || 0) + partCdl,
      });
      await base44.asServiceRole.entities.Transaction.create({
        user_email: CDL_EMAIL,
        user_nom: 'CDL',
        role: 'admin',
        type: 'commission',
        sens: 'credit',
        montant: partCdl,
        source: 'course',
        methode: 'interne',
        reference_id: courseId,
        statut: 'valide',
        date_validation: now,
        description: `Commission CDL annulation course #${courseId?.slice(0, 8)} (20%)`,
      });
    }
  }

  // Mettre à jour course
  await base44.asServiceRole.entities.Course.update(c.id, {
    statut: 'annulee',
    date_annulation: now,
    annulee_par: isAdmin ? 'admin' : 'client',
    frais_annulation: fraisAnnulation,
    montant_livreur_annulation: partLivreur,
    montant_cdl_annulation: partCdl,
    statut_paiement: 'frais_preleves',
  });

  // Notifier client
  await base44.asServiceRole.entities.Notification.create({
    destinataire_email: c.client_email,
    destinataire_role: 'client',
    titre: '✅ Course annulée',
    message: `Votre course a été annulée. ${fraisAnnulation.toLocaleString()} F CFA prélevés sur votre Bedou (frais d'annulation 50%).`,
    type: 'warning',
    lue: false,
    course_id: courseId,
    target_screen: '/mon-bedou',
  }).catch(() => {});

  return Response.json({
    success: true,
    courseId,
    statut: 'annulee',
    fraisAnnulation,
    partCdl,
    partLivreur,
  });
});