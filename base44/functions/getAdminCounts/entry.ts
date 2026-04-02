import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Vérifier si admin
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    // Compter livreurs en attente de validation ou incomplets
    const livreurs = await base44.asServiceRole.entities.User.filter({ user_type: "livreur" });
    const livreursPendants = livreurs.filter(l => 
      !l.statut_validation_livreur || l.statut_validation_livreur === "en_attente"
    ).length;

    // Compter clients nouveaux (créés depuis 7 jours)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const clients = await base44.asServiceRole.entities.User.filter({ user_type: "client" });
    const clientsNouveaux = clients.filter(c => 
      new Date(c.created_date) > new Date(sevenDaysAgo)
    ).length;

    // Compter partenaires en attente
    const partenaires = await base44.asServiceRole.entities.Partenaire.list("-created_date", 500);
    const partenairesAttente = partenaires.filter(p => 
      p.statut === "en_attente" || !p.statut
    ).length;

    // Compter commerciaux en attente
    const commerciaux = await base44.asServiceRole.entities.User.filter({ user_type: "commercial" });
    const commerciauxAttente = commerciaux.filter(c => 
      !c.statut_validation_commercial || c.statut_validation_commercial === "en_attente"
    ).length;

    // Compter profils incomplets
    const profiles = await base44.asServiceRole.entities.UserProfile.filter({ status: "incomplet" });
    const profilesIncomplets = profiles.length;

    return Response.json({
      livreurs: {
        pending: livreursPendants,
        count: livreurs.length,
      },
      clients: {
        new: clientsNouveaux,
        count: clients.length,
      },
      partenaires: {
        pending: partenairesAttente,
        count: partenaires.length,
      },
      commerciaux: {
        pending: commerciauxAttente,
        count: commerciaux.length,
      },
      profilesIncomplets: profilesIncomplets,
    });
  } catch (error) {
    console.error('[getAdminCounts] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});