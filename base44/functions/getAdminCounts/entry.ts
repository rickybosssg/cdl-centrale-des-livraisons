import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // ✅ CORRECTION: Utiliser UserProfile comme source unique de vérité
    const [profiles, users] = await Promise.all([
      base44.asServiceRole.entities.UserProfile.filter({ deleted: false }),
      base44.asServiceRole.entities.User.list("-created_date", 1000),
    ]);

    console.log('[getAdminCounts] Profils trouvés:', profiles.length);

    // LOGIQUE : Compter par profile_type uniquement (pas de fusion User/UserProfile)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // === LIVREURS ===
    const livreurEmails = new Set();
    const livreursPendantEmails = new Set();
    profiles.filter(p => p.profile_type === 'livreur').forEach(p => {
      livreurEmails.add(p.user_email);
      if (p.status === 'en_attente' || p.status === 'incomplet') {
        livreursPendantEmails.add(p.user_email);
      }
    });
    const tousLivreurs = livreurEmails.size;
    const livreursPendants = livreursPendantEmails.size;

    // === CLIENTS ===
    const clientEmails = new Set();
    let clientsNouveaux = 0;
    profiles.filter(p => p.profile_type === 'client').forEach(p => {
      clientEmails.add(p.user_email);
      if (new Date(p.created_date) > new Date(sevenDaysAgo)) {
        clientsNouveaux++;
      }
    });
    const tousClients = clientEmails.size;

    // === PARTENAIRES ===
    const partenaireEmails = new Set();
    const partenairesPendantEmails = new Set();
    profiles.filter(p => p.profile_type === 'partenaire').forEach(p => {
      partenaireEmails.add(p.user_email);
      if (p.status === 'en_attente' || p.status === 'incomplet') {
        partenairesPendantEmails.add(p.user_email);
      }
    });
    const tousPartenaires = partenaireEmails.size;
    const partenairesAttente = partenairesPendantEmails.size;

    // === COMMERCIAUX ===
    const commercialEmails = new Set();
    const commercialsPendantEmails = new Set();
    profiles.filter(p => p.profile_type === 'commercial').forEach(p => {
      commercialEmails.add(p.user_email);
      if (p.status === 'en_attente') {
        commercialsPendantEmails.add(p.user_email);
      }
    });
    const tousCommerciaux = commercialEmails.size;
    const commerciauxAttente = commercialsPendantEmails.size;

    // === PROFILS INCOMPLETS ===
    const profilesIncomplets = profiles.filter(p => p.status === 'incomplet').length;

    const result = {
      livreurs: { pending: livreursPendants, count: tousLivreurs },
      clients: { new: clientsNouveaux, count: tousClients },
      partenaires: { pending: partenairesAttente, count: tousPartenaires },
      commerciaux: { pending: commerciauxAttente, count: tousCommerciaux },
      profilesIncomplets,
    };

    console.log('[getAdminCounts] Résultat final:', JSON.stringify(result));

    return Response.json(result);
  } catch (error) {
    console.error('[getAdminCounts] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});