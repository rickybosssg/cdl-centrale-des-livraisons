import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Annulation de course acceptée avec prélèvement de 50% du prix
 * Transaction ATOMIQUE : tout ou rien
 * - 50% du prix prélevé au client
 * - 20% de ces 50% à CDL
 * - 80% de ces 50% au livreur
 */
Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST required' }, { status: 405 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { courseId } = await req.json();
    if (!courseId) {
      return Response.json({ error: 'courseId required' }, { status: 400 });
    }

    // 1. Récupérer la course
    const course = await base44.entities.Course.filter({ id: courseId });
    if (!course || course.length === 0) {
      return Response.json({ error: 'Course not found' }, { status: 404 });
    }

    const c = course[0];

    // 2. Vérifier les conditions
    if (c.statut !== 'acceptee') {
      return Response.json({ error: 'Course must be accepted' }, { status: 400 });
    }
    if (!c.livreur_email) {
      return Response.json({ error: 'No delivery assigned' }, { status: 400 });
    }
    if (c.client_email !== user.email) {
      return Response.json({ error: 'Only client can cancel' }, { status: 403 });
    }

    // 3. Calculer les frais
    const prix = parseFloat(c.prix) || 0;
    const fraisAnnulation = Math.round(prix * 0.5);
    const partCdl = Math.round(fraisAnnulation * 0.2);
    const partLivreur = Math.round(fraisAnnulation * 0.8);

    console.log(`[cancelCourseWithFees] Course ${courseId}:`);
    console.log(`  Prix: ${prix}F`);
    console.log(`  Frais (50%): ${fraisAnnulation}F`);
    console.log(`  CDL (20%): ${partCdl}F`);
    console.log(`  Livreur (80%): ${partLivreur}F`);

    // 4. Vérifier solde client
    const clientBedou = await base44.entities.Bedou.filter({ user_email: user.email, role: 'client' });
    if (!clientBedou || clientBedou.length === 0) {
      return Response.json({ error: 'Client Bedou not found' }, { status: 400 });
    }

    const clientBedouRecord = clientBedou[0];
    const soldeDisponible = parseFloat(clientBedouRecord.solde_disponible) || 0;

    if (soldeDisponible < fraisAnnulation) {
      return Response.json({
        error: 'insufficient_balance',
        required: fraisAnnulation,
        available: soldeDisponible,
        message: `Solde insuffisant. Vous devez recharger de ${fraisAnnulation - soldeDisponible}F.`,
      });
    }

    // 5. Transaction ATOMIQUE
    const now = new Date().toISOString();
    const transactionId = `TX_CANCEL_${courseId}_${Date.now()}`;

    try {
      // Débiter client
      const newClientSolde = soldeDisponible - fraisAnnulation;
      await base44.entities.Bedou.update(clientBedouRecord.id, {
        solde_disponible: newClientSolde,
        solde: (parseFloat(clientBedouRecord.solde) || 0) - fraisAnnulation,
      });

      // Créditer CDL
      const cdlBedou = await base44.entities.Bedou.filter({ user_email: 'cdl@system', role: 'cdl' });
      if (cdlBedou && cdlBedou.length > 0) {
        const cdlRecord = cdlBedou[0];
        await base44.entities.Bedou.update(cdlRecord.id, {
          solde: (parseFloat(cdlRecord.solde) || 0) + partCdl,
          solde_disponible: (parseFloat(cdlRecord.solde_disponible) || 0) + partCdl,
        });
      }

      // Créditer livreur
      const livreurBedou = await base44.entities.Bedou.filter({ user_email: c.livreur_email, role: 'livreur' });
      if (livreurBedou && livreurBedou.length > 0) {
        const livreurRecord = livreurBedou[0];
        const gain = parseFloat(livreurRecord.gains_totaux) || 0;
        await base44.entities.Bedou.update(livreurRecord.id, {
          solde: (parseFloat(livreurRecord.solde) || 0) + partLivreur,
          solde_disponible: (parseFloat(livreurRecord.solde_disponible) || 0) + partLivreur,
          gains_totaux: gain + partLivreur,
        });
      }

      // Créer transactions historique
      await Promise.all([
        base44.entities.Transaction.create({
          user_id: user.id,
          user_email: user.email,
          user_nom: user.full_name,
          role: 'client',
          type: 'annulation',
          sens: 'debit',
          montant: fraisAnnulation,
          source: 'course',
          methode: 'interne',
          reference_id: courseId,
          statut: 'valide',
          description: `Annulation course ${courseId} avec frais (50%)`,
        }),
        base44.entities.Transaction.create({
          user_id: c.livreur_email ? `livreur_${c.livreur_email}` : 'unknown',
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
          description: `Compensation annulation course ${courseId} (80% des frais)`,
        }),
      ]);

      // Mettre à jour course
      await base44.entities.Course.update(c.id, {
        statut: 'annulee',
        date_annulation: now,
        annulee_par: 'client',
        frais_annulation: fraisAnnulation,
        montant_livreur: partLivreur,
        montant_cdl: partCdl,
        transaction_id: transactionId,
      });

      // Notifications
      try {
        await Promise.all([
          // Client
          base44.entities.Notification.create({
            destinataire_email: user.email,
            destinataire_role: 'client',
            titre: '✅ Course annulée',
            message: `Votre course a été annulée. ${fraisAnnulation}F ont été prélevés sur votre Bedou.`,
            type: 'warning',
            course_id: courseId,
          }),
          // Livreur
          base44.entities.Notification.create({
            destinataire_email: c.livreur_email,
            destinataire_role: 'livreur',
            titre: '❌ Course annulée par client',
            message: `Compensation reçue: ${partLivreur}F crédités automatiquement.`,
            type: 'info',
            course_id: courseId,
          }),
        ]);
      } catch (notifErr) {
        console.warn('[cancelCourseWithFees] Notification error:', notifErr.message);
      }

      return Response.json({
        success: true,
        courseId,
        statut: 'annulee',
        fraisAnnulation,
        partCdl,
        partLivreur,
        newClientSolde,
      });
    } catch (txErr) {
      console.error('[cancelCourseWithFees] Transaction failed:', txErr);
      return Response.json({
        error: 'transaction_failed',
        message: txErr.message,
      }, { status: 500 });
    }
  } catch (error) {
    console.error('[cancelCourseWithFees] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});