import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Vérifier si admin
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    // Compter livreurs : User + UserProfile livreur
    const [livreurUsers, userProfileLivreurs] = await Promise.all([
      base44.asServiceRole.entities.User.filter({ user_type: "livreur" }),
      base44.asServiceRole.entities.UserProfile.filter({ profile_type: "livreur", deleted: false }),
    ]);
    
    // Fusionner User + UserProfile (éviter doublons)
    const mapLivreurs = new Map();
    livreurUsers.forEach(u => mapLivreurs.set(u.email, { ...u, source: 'User' }));
    userProfileLivreurs.forEach(p => {
      if (!mapLivreurs.has(p.user_email)) {
        mapLivreurs.set(p.user_email, { email: p.user_email, profile_type: 'livreur', source: 'UserProfile', status: p.status });
      }
    });
    const tousLivreurs = Array.from(mapLivreurs.values());
    
    const livreursPendants = tousLivreurs.filter(l => {
      if (l.source === 'User') return !l.statut_validation_livreur || l.statut_validation_livreur === 'en_attente';
      return l.status === 'incomplet' || l.status === 'en_attente';
    }).length;

    // Compter clients : User + UserProfile client
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [clientUsers, userProfileClients] = await Promise.all([
      base44.asServiceRole.entities.User.filter({ user_type: "client" }),
      base44.asServiceRole.entities.UserProfile.filter({ profile_type: "client", deleted: false }),
    ]);
    const mapClients = new Map();
    clientUsers.forEach(u => mapClients.set(u.email, u));
    userProfileClients.forEach(p => {
      if (!mapClients.has(p.user_email)) {
        mapClients.set(p.user_email, { email: p.user_email, created_date: p.created_date });
      }
    });
    const tousClients = Array.from(mapClients.values());
    const clientsNouveaux = tousClients.filter(c => 
      new Date(c.created_date) > new Date(sevenDaysAgo)
    ).length;

    // Compter partenaires : Partenaire + UserProfile partenaire
    const [partenairesData, userProfilePartenaires] = await Promise.all([
      base44.asServiceRole.entities.Partenaire.list("-created_date", 500),
      base44.asServiceRole.entities.UserProfile.filter({ profile_type: "partenaire", deleted: false }),
    ]);
    const mapPartenaires = new Map();
    partenairesData.forEach(p => mapPartenaires.set(p.user_email, p));
    userProfilePartenaires.forEach(p => {
      if (!mapPartenaires.has(p.user_email)) {
        mapPartenaires.set(p.user_email, { user_email: p.user_email, statut: p.status });
      }
    });
    const tousPartenaires = Array.from(mapPartenaires.values());
    const partenairesAttente = tousPartenaires.filter(p => 
      p.statut === "en_attente" || !p.statut || p.status === "en_attente"
    ).length;

    // Compter commerciaux : User + UserProfile commercial
    const [commerciauxUsers, userProfileCommerciaux] = await Promise.all([
      base44.asServiceRole.entities.User.filter({ user_type: "commercial" }),
      base44.asServiceRole.entities.UserProfile.filter({ profile_type: "commercial", deleted: false }),
    ]);
    const mapCommerciaux = new Map();
    commerciauxUsers.forEach(u => mapCommerciaux.set(u.email, u));
    userProfileCommerciaux.forEach(p => {
      if (!mapCommerciaux.has(p.user_email)) {
        mapCommerciaux.set(p.user_email, { email: p.user_email, status: p.status });
      }
    });
    const tousCommerciaux = Array.from(mapCommerciaux.values());
    const commerciauxAttente = tousCommerciaux.filter(c => 
      !c.statut_validation_commercial || c.statut_validation_commercial === "en_attente" || c.status === "en_attente"
    ).length;

    // Compter profils incomplets
    const profiles = await base44.asServiceRole.entities.UserProfile.filter({ status: "incomplet" });
    const profilesIncomplets = profiles.length;

    return Response.json({
      livreurs: {
        pending: livreursPendants,
        count: tousLivreurs.length,
      },
      clients: {
        new: clientsNouveaux,
        count: tousClients.length,
      },
      partenaires: {
        pending: partenairesAttente,
        count: tousPartenaires.length,
      },
      commerciaux: {
        pending: commerciauxAttente,
        count: tousCommerciaux.length,
      },
      profilesIncomplets: profilesIncomplets,
    });
  } catch (error) {
    console.error('[getAdminCounts] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});