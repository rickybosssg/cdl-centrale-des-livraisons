/**
 * cancelCourseAction — Fonction unifiée annulation/suppression de course
 *
 * Gère :
 *   - Annulation client (gratuite ou avec frais 50%)
 *   - Annulation admin (toutes courses)
 *   - Suppression logique admin
 *   - Libération livreur, notifications, Bedou
 *
 * Payload:
 *   courseId   : string (obligatoire)
 *   action     : "cancel_client" | "cancel_admin" | "delete_admin"
 *   raison     : string (obligatoire pour cancel_admin / delete_admin)
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CDL_EMAIL = 'weezyh2@gmail.com';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST required' }, { status: 405 });
  }

  const base44 = createClientFromRequest(req);

  // Auth : tenter user normal, fallback service-role pour admin APK
  let user = null;
  try { user = await base44.auth.me(); } catch (_) {}

  if (!user) {
    return Response.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const body = await req.json();
  const { courseId, action, raison } = body;

  if (!courseId) return Response.json({ error: 'courseId requis' }, { status: 400 });
  if (!action) return Response.json({ error: 'action requise' }, { status: 400 });
  if (['cancel_admin', 'delete_admin'].includes(action) && !raison?.trim()) {
    return Response.json({ error: 'raison requise' }, { status: 400 });
  }

  const isAdmin = user.role === 'admin' || user.role === 'dispatcher' || user.user_type === 'admin';

  // Vérifier permissions selon l'action
  if ((action === 'cancel_admin' || action === 'delete_admin') && !isAdmin) {
    console.error(`[CANCEL_ACTION_ERROR] 403 admin required | user=${user.email} | role=${user.role}`);
    return Response.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 });
  }

  // Récupérer la course
  let courses = [];
  try {
    courses = await base44.asServiceRole.entities.Course.filter({ id: courseId });
  } catch (_) {}
  if (!courses || courses.length === 0) {
    console.error(`[CANCEL_ACTION_ERROR] course not found | courseId=${courseId}`);
    return Response.json({ error: 'Course introuvable' }, { status: 404 });
  }
  const c = courses[0];

  console.log(`[CANCEL_STARTED] course=${courseId} | action=${action} | statut=${c.statut} | user=${user.email} | isAdmin=${isAdmin} | ts=${new Date().toISOString()}`);

  // Vérifier que le client ne peut annuler que ses propres courses
  // Comparaison insensible à la casse pour éviter les faux 403 (APK peut avoir des casses différentes)
  if (action === 'cancel_client' && !isAdmin) {
    const userEmailNorm = (user.email || '').toLowerCase().trim();
    const clientEmailNorm = (c.client_email || '').toLowerCase().trim();
    if (userEmailNorm !== clientEmailNorm) {
      console.error(`[CANCEL_ACTION_ERROR] 403 not owner | user=${userEmailNorm} | client=${clientEmailNorm}`);
      return Response.json({ error: 'Non autorisé — ce n\'est pas votre course', debug: { user_email: userEmailNorm, client_email: clientEmailNorm } }, { status: 403 });
    }
  }

  const now = new Date().toISOString();
  const ancienStatut = c.statut;

  console.log(`[cancelCourseAction] course=${courseId} | action=${action} | statut=${ancienStatut} | user=${user.email}`);

  // ──────────────────────────────────────────────────────────────────────────
  // ACTION : ANNULATION CLIENT
  // ──────────────────────────────────────────────────────────────────────────
  if (action === 'cancel_client') {
    const FREE_STATUTS = ['en_attente', 'assignee_attente', 'aucun_livreur', 'pending_driver_acceptance'];
    const FEE_STATUTS = ['acceptee'];
    const canCancel = FREE_STATUTS.includes(ancienStatut) || FEE_STATUTS.includes(ancienStatut);

    if (!canCancel) {
      return Response.json({
        error: `Annulation impossible en statut: ${ancienStatut}`,
        statut: ancienStatut
      }, { status: 400 });
    }

    const isFree = FREE_STATUTS.includes(ancienStatut);

    // ── Annulation GRATUITE ────────────────────────────────────────────────
    if (isFree) {
      await base44.asServiceRole.entities.Course.update(c.id, {
        statut: 'annulee',
        annulee_par: 'client',
        frais_annulation: 0,
        date_annulation: now,
      });

      // Libérer le livreur si assigné
      if (c.livreur_email) {
        const livs = await base44.asServiceRole.entities.User.filter({ email: c.livreur_email });
        if (livs?.[0]) {
          await base44.asServiceRole.entities.User.update(livs[0].id, {
            nombre_courses_actives: Math.max(0, (livs[0].nombre_courses_actives || 1) - 1),
          }).catch(() => {});
        }
        await base44.asServiceRole.entities.Notification.create({
          destinataire_email: c.livreur_email,
          destinataire_role: 'livreur',
          titre: '❌ Course annulée',
          message: `La course ${c.quartier_depart}→${c.quartier_arrivee} a été annulée par le client.`,
          type: 'warning',
          lue: false,
          course_id: courseId,
        }).catch(() => {});
      }

      await base44.asServiceRole.entities.Notification.create({
        destinataire_email: c.client_email,
        destinataire_role: 'client',
        titre: '✅ Course annulée',
        message: 'Votre course a été annulée sans frais.',
        type: 'info',
        lue: false,
        course_id: courseId,
      }).catch(() => {});

      console.log(`[COURSE_UPDATED] FREE cancel | course=${courseId} | nouveau_statut=annulee | ts=${new Date().toISOString()}`);
    console.log(`[CANCEL_ACTION_SUCCESS] FREE cancel | course=${courseId} | user=${user.email}`);
      return Response.json({ success: true, courseId, statut: 'annulee', fraisAnnulation: 0, gratuit: true });
    }

    // ── Annulation AVEC FRAIS (50%) ────────────────────────────────────────
    const prix = parseFloat(c.prix) || 0;
    const fraisAnnulation = Math.round(prix * 0.5);
    const partCdl = Math.round(fraisAnnulation * 0.2);
    const partLivreur = fraisAnnulation - partCdl;

    console.log(`[cancelCourseAction] FEE cancel | prix=${prix} | frais=${fraisAnnulation} | cdl=${partCdl} | livreur=${partLivreur}`);

    // Vérifier solde client
    const clientBedouList = await base44.asServiceRole.entities.Bedou.filter({ user_email: c.client_email });
    if (!clientBedouList?.[0]) {
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
        await base44.asServiceRole.entities.Notification.create({
          destinataire_email: c.livreur_email,
          destinataire_role: 'livreur',
          titre: '❌ Course annulée — compensation reçue',
          message: `Le client a annulé. Compensation : +${partLivreur.toLocaleString()} F CFA crédités sur votre Bedou.`,
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

    // Mettre à jour la course
    await base44.asServiceRole.entities.Course.update(c.id, {
      statut: 'annulee',
      date_annulation: now,
      annulee_par: 'client',
      frais_annulation: fraisAnnulation,
      montant_livreur_annulation: partLivreur,
      montant_cdl_annulation: partCdl,
      statut_paiement: 'frais_preleves',
    });

    await base44.asServiceRole.entities.Notification.create({
      destinataire_email: c.client_email,
      destinataire_role: 'client',
      titre: '✅ Course annulée',
      message: `Course annulée. ${fraisAnnulation.toLocaleString()} F CFA prélevés (frais 50%).`,
      type: 'warning',
      lue: false,
      course_id: courseId,
      target_screen: '/mon-bedou',
    }).catch(() => {});

    console.log(`[COURSE_UPDATED] FEE cancel | course=${courseId} | nouveau_statut=annulee | frais=${fraisAnnulation} | ts=${new Date().toISOString()}`);
    console.log(`[CANCEL_ACTION_SUCCESS] FEE cancel | course=${courseId} | frais=${fraisAnnulation} | user=${user.email}`);
    return Response.json({ success: true, courseId, statut: 'annulee', fraisAnnulation, partCdl, partLivreur });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ACTION : ANNULATION ADMIN
  // ──────────────────────────────────────────────────────────────────────────
  if (action === 'cancel_admin') {
    if (['annulee', 'annulee_par_admin'].includes(ancienStatut)) {
      return Response.json({ error: 'Course déjà annulée' }, { status: 409 });
    }

    // Libérer le livreur si présent
    if (c.livreur_email) {
      const livreurs = await base44.asServiceRole.entities.User.filter({ email: c.livreur_email });
      if (livreurs?.[0]) {
        await base44.asServiceRole.entities.User.update(livreurs[0].id, {
          nombre_courses_actives: Math.max(0, (livreurs[0].nombre_courses_actives || 1) - 1),
        }).catch(() => {});
      }
      await base44.asServiceRole.entities.Notification.create({
        destinataire_email: c.livreur_email,
        destinataire_role: 'livreur',
        titre: '🚫 Course annulée par l\'administrateur',
        message: `La course ${c.quartier_depart}→${c.quartier_arrivee} a été annulée par l'admin. Raison : ${raison.trim()}`,
        type: 'warning',
        lue: false,
        course_id: courseId,
      }).catch(() => {});
    }

    if (c.client_email) {
      await base44.asServiceRole.entities.Notification.create({
        destinataire_email: c.client_email,
        destinataire_role: 'client',
        titre: '❌ Votre course a été annulée',
        message: `Votre course ${c.quartier_depart}→${c.quartier_arrivee} a été annulée par CDL. Raison : ${raison.trim()}`,
        type: 'danger',
        lue: false,
        course_id: courseId,
        target_screen: `/course/${courseId}`,
      }).catch(() => {});
    }

    await base44.asServiceRole.entities.Course.update(courseId, {
      statut: 'annulee',
      annulee_par_admin: true,
      admin_cancel_reason: raison.trim(),
      admin_cancel_by: user.email,
      admin_cancel_at: now,
      livreur_email: null,
      livreur_name: null,
      telephone_livreur: null,
    });

    await base44.asServiceRole.entities.AdminActionLog.create({
      admin_email: user.email,
      admin_name: user.full_name || user.email,
      action_type: 'COURSE_CANCELLED',
      entity_type: 'Course',
      entity_id: courseId,
      details: `Annulation admin — Raison: ${raison.trim()} | Statut précédent: ${ancienStatut}`,
      metadata_json: JSON.stringify({ ancien_statut: ancienStatut, raison, livreur_email: c.livreur_email || null, client_email: c.client_email }),
    }).catch(() => {});

    console.log(`[COURSE_UPDATED] admin cancel | course=${courseId} | nouveau_statut=annulee | admin=${user.email} | ts=${new Date().toISOString()}`);
    console.log(`[CANCEL_ACTION_SUCCESS] admin cancel | course=${courseId} | admin=${user.email}`);
    return Response.json({ success: true, action: 'cancel_admin', courseId, nouveau_statut: 'annulee' });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ACTION : SUPPRESSION LOGIQUE ADMIN
  // ──────────────────────────────────────────────────────────────────────────
  if (action === 'delete_admin') {
    if (c.is_deleted) {
      return Response.json({ error: 'Course déjà supprimée' }, { status: 409 });
    }

    await base44.asServiceRole.entities.Course.update(courseId, {
      is_deleted: true,
      deleted_at: now,
      deleted_by_admin: user.email,
      delete_reason: raison.trim(),
    });

    await base44.asServiceRole.entities.AdminActionLog.create({
      admin_email: user.email,
      admin_name: user.full_name || user.email,
      action_type: 'COURSE_DELETED',
      entity_type: 'Course',
      entity_id: courseId,
      details: `Suppression logique — Raison: ${raison.trim()} | Statut: ${ancienStatut}`,
      metadata_json: JSON.stringify({ statut_au_moment: ancienStatut, raison, client_email: c.client_email, prix: c.prix }),
    }).catch(() => {});

    console.log(`[COURSE_UPDATED] delete_admin | course=${courseId} | is_deleted=true | admin=${user.email} | ts=${new Date().toISOString()}`);
    console.log(`[DELETE_ADMIN_SUCCESS] | course=${courseId} | admin=${user.email}`);
    return Response.json({ success: true, action: 'delete_admin', courseId });
  }

  return Response.json({ error: `Action inconnue: ${action}` }, { status: 400 });
});