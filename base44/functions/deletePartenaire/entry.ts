import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await req.json();
    const { partenaire_id, partenaire_email, reason } = body;

    if (!partenaire_id || !partenaire_email) {
      return Response.json({ error: 'Missing partenaire_id or partenaire_email' }, { status: 400 });
    }

    // Fetch partenaire
    const partenaires = await base44.asServiceRole.entities.Partenaire.filter({ id: partenaire_id });
    if (!partenaires || partenaires.length === 0) {
      return Response.json({ error: 'Partenaire introuvable' }, { status: 404 });
    }
    const partenaire = partenaires[0];

    // Soft delete
    await base44.asServiceRole.entities.Partenaire.update(partenaire_id, {
      statut: 'suspendu',
      deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by_admin_email: user.email,
      delete_reason: reason || null,
    });

    // Désactiver les produits du partenaire
    const produits = await base44.asServiceRole.entities.ProduitPartenaire.filter({ partenaire_id });
    for (const produit of produits) {
      await base44.asServiceRole.entities.ProduitPartenaire.update(produit.id, { disponible: false });
    }

    // Notification au partenaire
    try {
      await base44.asServiceRole.entities.Notification.create({
        destinataire_email: partenaire_email,
        destinataire_role: 'partenaire',
        titre: '🔒 Compte supprimé',
        message: `Votre compte partenaire CDL a été désactivé par l'administration.${reason ? ` Raison : ${reason}` : ''} Veuillez contacter l'équipe CDL pour plus d'informations.`,
        type: 'warning',
        lue: false,
      });
    } catch (_) {}

    // Log admin
    console.log(`[ADMIN] Partenaire ${partenaire.nom_commerce} (${partenaire_email}) supprimé par ${user.email}. Raison: ${reason || 'Aucune'}`);

    return Response.json({
      success: true,
      message: `Partenaire ${partenaire.nom_commerce} supprimé avec succès`,
    });

  } catch (error) {
    console.error('[DELETE_PARTENAIRE] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});