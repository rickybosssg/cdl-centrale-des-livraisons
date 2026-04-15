/**
 * CDL — Garantie crédit Bedou après compensation d'annulation
 * Déclenché par automation entity sur Transaction (create/update)
 * Vérifie que chaque transaction "compensation" validée impacte bien le solde Bedou.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json().catch(() => ({}));
    const { event, data } = body;

    // Récupérer la transaction (depuis payload ou depuis la BDD)
    let tx = data;
    if (!tx && event?.entity_id) {
      const rows = await base44.asServiceRole.entities.Transaction.filter({ id: event.entity_id });
      tx = rows?.[0];
    }

    if (!tx) return Response.json({ skipped: true, reason: 'no_transaction' });

    // Uniquement les compensations livreur validées
    const isCompensation = ['compensation', 'compensation_annulation'].includes(tx.type);
    const isCredit = tx.sens === 'credit';
    const isValide = tx.statut === 'valide';
    const hasEmail = !!tx.user_email;

    if (!isCompensation || !isCredit || !isValide || !hasEmail) {
      return Response.json({ skipped: true, reason: 'not_applicable', type: tx.type, sens: tx.sens, statut: tx.statut });
    }

    const montant = parseFloat(tx.montant) || 0;
    if (montant <= 0) return Response.json({ skipped: true, reason: 'montant_zero' });

    // Vérifier IMMÉDIATEMENT si déjà crédité (avant tout accès au solde)
    if (tx.bedou_credited === true) {
      return Response.json({ skipped: true, reason: 'already_credited' });
    }

    // Récupérer le Bedou du livreur
    const bedouList = await base44.asServiceRole.entities.Bedou.filter({
      user_email: tx.user_email,
      role: 'livreur',
    });

    if (!bedouList || bedouList.length === 0) {
      console.log(`[ensureCancel] Bedou livreur ${tx.user_email} introuvable — création...`);
      // Créer le Bedou si manquant
      const newBedou = await base44.asServiceRole.entities.Bedou.create({
        user_email: tx.user_email,
        role: 'livreur',
        solde: montant,
        solde_disponible: montant,
        solde_bloque: 0,
        gains_totaux: montant,
      });
      console.log(`[ensureCancel] Bedou créé pour ${tx.user_email} avec ${montant}F`);
      return Response.json({ success: true, action: 'created', montant, bedou_id: newBedou.id });
    }

    const bedou = bedouList[0];
    const soldeDispo = parseFloat(bedou.solde_disponible) || 0;
    const soldeTotal = parseFloat(bedou.solde) || 0;
    const gainsTotaux = parseFloat(bedou.gains_totaux) || 0;

    // Créditer le Bedou
    await base44.asServiceRole.entities.Bedou.update(bedou.id, {
      solde: soldeTotal + montant,
      solde_disponible: soldeDispo + montant,
      gains_totaux: gainsTotaux + montant,
    });

    // Marquer la transaction comme créditée
    await base44.asServiceRole.entities.Transaction.update(tx.id, {
      bedou_credited: true,
      bedou_credited_at: new Date().toISOString(),
    });

    console.log(`[ensureCancel] ✅ Bedou ${tx.user_email} crédité +${montant}F (solde: ${soldeDispo} → ${soldeDispo + montant})`);

    // Notification livreur
    await base44.asServiceRole.entities.Notification.create({
      destinataire_email: tx.user_email,
      destinataire_role: 'livreur',
      titre: '💰 Compensation reçue',
      message: `${montant.toLocaleString()} F CFA ont été crédités sur votre Bedou (annulation course).`,
      type: 'success',
      lue: false,
    }).catch(() => {});

    return Response.json({
      success: true,
      action: 'credited',
      montant,
      new_solde: soldeDispo + montant,
    });

  } catch (error) {
    console.error('[ensureCancel] ERROR:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});