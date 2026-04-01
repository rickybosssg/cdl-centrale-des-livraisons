import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Seul l'admin ou le système peut appeler cette fonction
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Only admins can recalculate counters' }, { status: 403 });
    }

    console.log('[recalculateProfileCounters] ← COMPTEURS: Début recalcul...');
    // Compter les profils actifs par type
    const profiles = await base44.entities.UserProfile.filter({
      deleted: false,
    });
    console.log('[recalculateProfileCounters] ← COMPTEURS: Total profils:', profiles.length);

    const counts = {
      clients_total: new Set(),
      livreurs_total: new Set(),
      partenaires_total: new Set(),
      commerciaux_total: new Set(),
      clients_actifs: new Set(),
      livreurs_actifs: new Set(),
      partenaires_actifs: new Set(),
      commerciaux_actifs: new Set(),
      clients_en_attente: new Set(),
      livreurs_en_attente: new Set(),
      partenaires_en_attente: new Set(),
      commerciaux_en_attente: new Set(),
    };

    profiles.forEach(profile => {
      const key = `${profile.profile_type}s_total`;
      if (counts[key]) counts[key].add(profile.user_email);

      if (profile.status === 'actif') {
        const activeKey = `${profile.profile_type}s_actifs`;
        if (counts[activeKey]) counts[activeKey].add(profile.user_email);
      } else if (profile.status === 'en_attente') {
        const pendingKey = `${profile.profile_type}s_en_attente`;
        if (counts[pendingKey]) counts[pendingKey].add(profile.user_email);
      }
    });
    console.log('[recalculateProfileCounters] ← COMPTEURS: Comptage complet');

    // Convertir en nombres
    const finalCounts = {};
    Object.entries(counts).forEach(([key, set]) => {
      finalCounts[key] = set.size;
    });

    console.log('[recalculateProfileCounters] ← COMPTEURS: Résultats finaux:', JSON.stringify(finalCounts));
    console.log('[recalculateProfileCounters] ← COMPTEURS: Profils EN ATTENTE par type:');
    console.log(`  - Clients: ${finalCounts.clients_en_attente || 0}`);
    console.log(`  - Livreurs: ${finalCounts.livreurs_en_attente || 0}`);
    console.log(`  - Partenaires: ${finalCounts.partenaires_en_attente || 0}`);
    console.log(`  - Commerciaux: ${finalCounts.commerciaux_en_attente || 0}`);

    return Response.json({
      success: true,
      counts: finalCounts,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});