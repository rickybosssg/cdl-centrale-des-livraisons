import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * LOGIQUE PREMIÈRE/DEUXIÈME COURSE AVEC CODE PROMO
 * Traite automatiquement le cas spécial première course + code promo
 * Puis bascule à logique normale pour courses suivantes
 */
Deno.serve(async (req) => {
  if (req.method !== 'POST') return Response.json({ error: 'POST required' }, { status: 405 });

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { course_id, action } = await req.json();
    if (!course_id || !action) {
      return Response.json({ error: 'course_id and action required' }, { status: 400 });
    }

    console.log(`[FirstCourse] Action: ${action}, Course: ${course_id}`);

    // ========== VÉRIFIER LA COURSE ==========
    const coursesData = await base44.asServiceRole.entities.Course.filter({ id: course_id });
    if (coursesData.length === 0) {
      return Response.json({ error: 'Course not found' }, { status: 404 });
    }
    const course = coursesData[0];

    // ========== VÉRIFIER LE CLIENT ==========
    const clientsData = await base44.asServiceRole.entities.Client.filter({ email: course.client_email });
    const client = clientsData.length > 0 ? clientsData[0] : null;

    // ========== CRÉER CLIENT SI ABSENT ==========
    let clientId = client?.id;
    if (!client) {
      const newClient = await base44.asServiceRole.entities.Client.create({
        email: course.client_email,
        nom_complet: course.client_name,
        numero_telephone: course.telephone_expediteur,
        nombre_total_courses: 0,
        nombre_courses_terminees: 0,
        premiere_course_effectuee: false,
        prime_premiere_course_payee: false,
        reduction_premiere_course_appliquee: false,
        statut_client: 'Nouveau',
      });
      clientId = newClient.id;
    }

    // ========== COMPTER COURSES TERMINÉES ==========
    const completedCourses = await base44.asServiceRole.entities.Course.filter({
      client_email: course.client_email,
      statut: 'livree',
    });

    const isFirstCompletedCourse = completedCourses.length === 1 && completedCourses[0].id === course_id;

    console.log(`[FirstCourse] Client: ${course.client_email}, IsFirst: ${isFirstCompletedCourse}, CompletedBefore: ${completedCourses.length - 1}`);

    if (action === 'validate_first_course') {
      // ========== LOGIQUE PREMIÈRE COURSE SPÉCIALE ==========
      if (!isFirstCompletedCourse) {
        return Response.json({ error: 'Not the first course' }, { status: 400 });
      }

      const codePromo = course.code_promo_utilise || client?.code_promo_utilise;
      const hasValidPromo = codePromo ? (await base44.asServiceRole.entities.CodePromo.filter({ code: codePromo, actif: true }))[0] : null;

      let reduction = 0;
      let prixPaye = course.prix || 0;
      let prixInitial = course.prix || 0;

      // === Appliquer réduction 15% si code promo valide ===
      if (hasValidPromo && !client?.reduction_premiere_course_appliquee) {
        reduction = Math.round(prixInitial * 0.15);
        prixPaye = prixInitial - reduction;
      }

      // === Calculs Bedou ===
      const gainLivreur = Math.round(prixInitial * 0.80); // 80% du prix initial
      const gainCommercial = hasValidPromo ? 50 : 0; // 50 F si code promo
      const commissionCDL = 0; // 0 pour première course spéciale

      console.log(`[FirstCourse] Reduction: ${reduction}, PayeClient: ${prixPaye}, LivreurGain: ${gainLivreur}, CommercialGain: ${gainCommercial}`);

      // === TRANSACTION ATOMIQUE ===
      try {
        // 1. Débiter Bedou client
        const bedouClient = await base44.asServiceRole.entities.Bedou.filter({ user_email: course.client_email, role: 'client' });
        if (bedouClient.length > 0) {
          const newSolde = Math.max(0, (bedouClient[0].solde_disponible || 0) - prixPaye);
          await base44.asServiceRole.entities.Bedou.update(bedouClient[0].id, {
            solde: newSolde,
            solde_disponible: newSolde,
            depenses_totales: (bedouClient[0].depenses_totales || 0) + prixPaye,
          });

          // Historique Bedou client
          await base44.asServiceRole.entities.Transaction.create({
            user_email: course.client_email,
            user_nom: course.client_name,
            role: 'client',
            type: 'paiement',
            sens: 'debit',
            montant: prixPaye,
            source: 'course',
            methode: 'interne',
            reference_id: course_id,
            statut: 'valide',
            description: `Première course (réduit: -${reduction}F)`,
          });
        }

        // 2. Créditer Bedou livreur
        const bedouLivreur = await base44.asServiceRole.entities.Bedou.filter({ user_email: course.livreur_email, role: 'livreur' });
        if (bedouLivreur.length > 0) {
          const newSolde = (bedouLivreur[0].solde || 0) + gainLivreur;
          await base44.asServiceRole.entities.Bedou.update(bedouLivreur[0].id, {
            solde: newSolde,
            solde_disponible: newSolde,
            gains_totaux: (bedouLivreur[0].gains_totaux || 0) + gainLivreur,
          });

          // Historique Bedou livreur
          await base44.asServiceRole.entities.Transaction.create({
            user_email: course.livreur_email,
            user_nom: course.livreur_name,
            role: 'livreur',
            type: 'gain',
            sens: 'credit',
            montant: gainLivreur,
            source: 'course',
            methode: 'interne',
            reference_id: course_id,
            statut: 'valide',
            description: 'Gain première course (80%)',
          });
        }

        // 3. Créditer Bedou commercial si code promo valide
        if (hasValidPromo) {
          const bedouCommercial = await base44.asServiceRole.entities.Bedou.filter({ user_email: hasValidPromo.commercial_email, role: 'commercial' });
          if (bedouCommercial.length > 0) {
            const newSolde = (bedouCommercial[0].solde || 0) + gainCommercial;
            await base44.asServiceRole.entities.Bedou.update(bedouCommercial[0].id, {
              solde: newSolde,
              solde_disponible: newSolde,
              gains_totaux: (bedouCommercial[0].gains_totaux || 0) + gainCommercial,
            });

            // Historique Bedou commercial
            await base44.asServiceRole.entities.Transaction.create({
              user_email: hasValidPromo.commercial_email,
              user_nom: hasValidPromo.commercial_name,
              role: 'commercial',
              type: 'gain',
              sens: 'credit',
              montant: gainCommercial,
              source: 'course',
              methode: 'interne',
              reference_id: course_id,
              statut: 'valide',
              description: `Prime première course client (${course.client_name})`,
            });

            // Mettre à jour CodePromo
            await base44.asServiceRole.entities.CodePromo.update(hasValidPromo.id, {
              nombre_utilisations: (hasValidPromo.nombre_utilisations || 0) + 1,
              commission_due: (hasValidPromo.commission_due || 0) + gainCommercial,
            });
          }
        }

        // 4. Créditer Bedou CDL (0 pour première course spéciale)
        const bedouCDL = await base44.asServiceRole.entities.Bedou.filter({ user_email: 'admin@cdl.local', role: 'admin' });
        if (bedouCDL.length > 0 && commissionCDL > 0) {
          const newSolde = (bedouCDL[0].solde || 0) + commissionCDL;
          await base44.entities.Bedou.update(bedouCDL[0].id, {
            solde: newSolde,
            gains_totaux: (bedouCDL[0].gains_totaux || 0) + commissionCDL,
          });
        }

        // 5. Mettre à jour client
        await base44.asServiceRole.entities.Client.update(clientId, {
          nombre_total_courses: (client?.nombre_total_courses || 0) + 1,
          nombre_courses_terminees: (client?.nombre_courses_terminees || 0) + 1,
          total_depense: (client?.total_depense || 0) + prixPaye,
          date_premiere_course: new Date().toISOString(),
          premiere_course_effectuee: true,
          prime_premiere_course_payee: hasValidPromo ? true : false,
          reduction_premiere_course_appliquee: reduction > 0 ? true : false,
          statut_client: 'Actif',
        });

        // 6. Mettre à jour course
        await base44.asServiceRole.entities.Course.update(course_id, {
          prix_initial: prixInitial,
          reduction_appliquee: reduction,
          prix_final: prixPaye,
          commission_cdl: commissionCDL,
          gain_livreur: gainLivreur,
          statut_paiement: 'paye',
          gain_commercial: gainCommercial,
          premiere_course_validee: true,
        });

        // 7. Notifications
        await base44.entities.Notification.create({
          destinataire_email: course.client_email,
          destinataire_role: 'client',
          titre: '✅ Première course validée!',
          message: `Félicitations! Votre première course est terminée. ${reduction > 0 ? `Réduction appliquée: -${reduction}F` : ''}`,
          type: 'success',
        });

        if (hasValidPromo) {
          await base44.entities.Notification.create({
            destinataire_email: hasValidPromo.commercial_email,
            destinataire_role: 'commercial',
            titre: '💰 Prime première course',
            message: `Client ${course.client_name} a complété sa première course. Prime 50F versée.`,
            type: 'success',
          });
        }

        return Response.json({
          success: true,
          message: 'Première course validée',
          data: {
            isFirstCourse: true,
            reduction,
            prixPaye,
            gainLivreur,
            gainCommercial,
            commissionCDL,
          },
        });
      } catch (txErr) {
        console.error('[FirstCourse] Transaction error:', txErr);
        return Response.json({ error: 'Transaction failed: ' + txErr.message }, { status: 500 });
      }
    } else if (action === 'validate_normal_course') {
      // ========== LOGIQUE DEUXIÈME COURSE ET SUIVANTES (NORMALE) ==========
      if (isFirstCompletedCourse) {
        return Response.json({ error: 'Should use first course logic', }, { status: 400 });
      }

      // === Appliquer logique CDL NORMALE ===
      const prixInitial = course.prix || 0;
      const commissionCDL = Math.round(prixInitial * 0.20); // 20% normal
      const gainLivreur = Math.round(prixInitial * 0.80); // 80% normal
      const prixPaye = prixInitial; // Pas de réduction après première course

      console.log(`[NormalCourse] Prix: ${prixInitial}, Commission: ${commissionCDL}, Livreur: ${gainLivreur}`);

      try {
        // 1. Débiter Bedou client
        const bedouClient = await base44.asServiceRole.entities.Bedou.filter({ user_email: course.client_email, role: 'client' });
        if (bedouClient.length > 0) {
          const newSolde = Math.max(0, (bedouClient[0].solde_disponible || 0) - prixPaye);
          await base44.asServiceRole.entities.Bedou.update(bedouClient[0].id, {
            solde: newSolde,
            solde_disponible: newSolde,
            depenses_totales: (bedouClient[0].depenses_totales || 0) + prixPaye,
          });

          await base44.asServiceRole.entities.Transaction.create({
            user_email: course.client_email,
            user_nom: course.client_name,
            role: 'client',
            type: 'paiement',
            sens: 'debit',
            montant: prixPaye,
            source: 'course',
            methode: 'interne',
            reference_id: course_id,
            statut: 'valide',
            description: 'Course normale',
          });
        }

        // 2. Créditer Bedou livreur
        const bedouLivreur = await base44.asServiceRole.entities.Bedou.filter({ user_email: course.livreur_email, role: 'livreur' });
        if (bedouLivreur.length > 0) {
          const newSolde = (bedouLivreur[0].solde || 0) + gainLivreur;
          await base44.asServiceRole.entities.Bedou.update(bedouLivreur[0].id, {
            solde: newSolde,
            solde_disponible: newSolde,
            gains_totaux: (bedouLivreur[0].gains_totaux || 0) + gainLivreur,
          });

          await base44.asServiceRole.entities.Transaction.create({
            user_email: course.livreur_email,
            user_nom: course.livreur_name,
            role: 'livreur',
            type: 'gain',
            sens: 'credit',
            montant: gainLivreur,
            source: 'course',
            methode: 'interne',
            reference_id: course_id,
            statut: 'valide',
            description: 'Gain course (80%)',
          });
        }

        // 3. Créditer Bedou CDL (commission normale)
        const bedouCDL = await base44.asServiceRole.entities.Bedou.filter({ user_email: 'admin@cdl.local', role: 'admin' });
        if (bedouCDL.length > 0 && commissionCDL > 0) {
          const newSolde = (bedouCDL[0].solde || 0) + commissionCDL;
          await base44.asServiceRole.entities.Bedou.update(bedouCDL[0].id, {
            solde: newSolde,
            gains_totaux: (bedouCDL[0].gains_totaux || 0) + commissionCDL,
          });

          await base44.asServiceRole.entities.Transaction.create({
            user_email: 'admin@cdl.local',
            role: 'admin',
            type: 'commission',
            sens: 'credit',
            montant: commissionCDL,
            source: 'course',
            methode: 'interne',
            reference_id: course_id,
            statut: 'valide',
            description: `Commission course ${course.client_name}`,
          });
        }

        // 4. Mettre à jour client (compteurs normaux, sans avantages spéciaux)
        await base44.asServiceRole.entities.Client.update(clientId, {
          nombre_total_courses: (client?.nombre_total_courses || 0) + 1,
          nombre_courses_terminees: (client?.nombre_courses_terminees || 0) + 1,
          total_depense: (client?.total_depense || 0) + prixPaye,
          date_derniere_course: new Date().toISOString(),
          statut_client: client?.nombre_courses_terminees >= 5 ? 'Fidèle' : 'Actif',
        });

        // 5. Mettre à jour course
        await base44.asServiceRole.entities.Course.update(course_id, {
          commission_cdl: commissionCDL,
          gain_livreur: gainLivreur,
          statut_paiement: 'paye',
          gain_commercial: 0, // Pas de gain commercial après première course
          premiere_course_validee: false,
        });

        return Response.json({
          success: true,
          message: 'Course normale validée',
          data: {
            isFirstCourse: false,
            prixPaye,
            gainLivreur,
            commissionCDL,
          },
        });
      } catch (txErr) {
        console.error('[NormalCourse] Transaction error:', txErr);
        return Response.json({ error: 'Transaction failed: ' + txErr.message }, { status: 500 });
      }
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('[FirstCourse] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});