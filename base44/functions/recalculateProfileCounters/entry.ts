import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Seul l'admin ou le système peut appeler cette fonction
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Only admins can recalculate counters' }, { status: 403 });
    }

    // Compter les profils actifs par type
    const profiles = await base44.entities.UserProfile.filter({
      deleted: false,
    });

    const counts = {
      clients_total: new Set(),
      livreurs_total: new Set(),
      partenaires_total: new Set(),
      commerciaux_total: new Set(),
      clients_actifs: new Set(),
      livreurs_actifs: new Set(),
      partenaires_actifs: new Set(),
      commerciaux_actifs: new Set(),
    };

    profiles.forEach(profile => {
      const key = `${profile.profile_type}s_total`;
      if (counts[key]) counts[key].add(profile.user_email);

      if (profile.status === 'actif') {
        const activeKey = `${profile.profile_type}s_actifs`;
        if (counts[activeKey]) counts[activeKey].add(profile.user_email);
      }
    });

    // Convertir en nombres
    const finalCounts = {};
    Object.entries(counts).forEach(([key, set]) => {
      finalCounts[key] = set.size;
    });

    return Response.json({
      success: true,
      counts: finalCounts,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});