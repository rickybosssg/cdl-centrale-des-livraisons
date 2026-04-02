import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Calcule le classement des livreurs basé sur performance (sans bonus financier)
function calcScore(u) {
  const p = u.courses_proposees || 0;
  const a = u.courses_acceptees || 0;
  const taux = p > 0 ? Math.min(a / p, 1) : 0.5;
  const rapideScore = Math.max(0, 1 - ((u.temps_reponse_moyen_sec || 60) / 120));
  const activiteScore = Math.min((u.total_courses_livrees || 0) / 100, 1);
  return Math.round((taux * 40) + (rapideScore * 35) + (activiteScore * 25));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Récupérer tous les livreurs actifs
    const livreurs = await base44.asServiceRole.entities.User.filter({ user_type: 'livreur' });

    // Calculer le score de chacun
    const scored = livreurs
      .map(l => ({ email: l.email, score: calcScore(l) }))
      .sort((a, b) => b.score - a.score);

    const rank = scored.findIndex(l => l.email === user.email) + 1;
    const myScore = calcScore(user);

    return Response.json({
      rank: rank > 0 ? rank : scored.length + 1,
      total: scored.length,
      score: myScore,
      top3: scored.slice(0, 3),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});