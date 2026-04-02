import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Appelée quand une course est livrée — met à jour streak et notifie si rang change
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const today = new Date().toDateString();
    const lastDate = user.streak_derniere_date || null;
    const yesterday = new Date(Date.now() - 86400000).toDateString();

    let newStreak = user.streak_jours || 0;

    if (lastDate === today) {
      // Déjà actif aujourd'hui — pas de changement
    } else if (lastDate === yesterday) {
      // Jour consécutif
      newStreak += 1;
    } else {
      // Streak cassé — repart à 1
      newStreak = 1;
    }

    // Calculer rang actuel vs précédent pour notification
    const livreurs = await base44.asServiceRole.entities.User.filter({ user_type: 'livreur' });
    function calcScore(u) {
      const p = u.courses_proposees || 0;
      const a = u.courses_acceptees || 0;
      const taux = p > 0 ? Math.min(a / p, 1) : 0.5;
      const rapide = Math.max(0, 1 - ((u.temps_reponse_moyen_sec || 60) / 120));
      const activite = Math.min((u.total_courses_livrees || 0) / 100, 1);
      return Math.round((taux * 40) + (rapide * 35) + (activite * 25));
    }
    const scored = livreurs.map(l => ({ email: l.email, score: calcScore(l) })).sort((a, b) => b.score - a.score);
    const currentRank = scored.findIndex(l => l.email === user.email) + 1;
    const previousRank = user.rank_precedent || currentRank;
    const rankChange = previousRank - currentRank;

    // Notifier si montée dans classement
    if (rankChange > 0) {
      await base44.asServiceRole.entities.Notification.create({
        destinataire_email: user.email,
        destinataire_role: 'livreur',
        titre: `📈 Tu as gagné ${rankChange} place${rankChange > 1 ? 's' : ''} !`,
        message: `Bravo ! Tu es maintenant #${currentRank} dans le classement CDL. Continue sur ta lancée !`,
        type: 'success',
        lue: false,
      });
    } else if (rankChange < 0 && Math.abs(rankChange) >= 2) {
      await base44.asServiceRole.entities.Notification.create({
        destinataire_email: user.email,
        destinataire_role: 'livreur',
        titre: `📉 Tu as perdu ${Math.abs(rankChange)} places`,
        message: `Tu es maintenant #${currentRank}. Sois plus rapide et accepte plus de courses pour remonter !`,
        type: 'warning',
        lue: false,
      });
    }

    // Notifier si proche du top 3
    if (currentRank <= 6 && currentRank > 3 && previousRank > 6) {
      await base44.asServiceRole.entities.Notification.create({
        destinataire_email: user.email,
        destinataire_role: 'livreur',
        titre: '🏆 Tu approches du top 3 !',
        message: `Plus que ${currentRank - 3} place${currentRank - 3 > 1 ? 's' : ''} pour intégrer l'élite CDL !`,
        type: 'info',
        lue: false,
      });
    }

    // Notifier streak
    if (newStreak === 3 || newStreak === 7 || newStreak === 14) {
      await base44.asServiceRole.entities.Notification.create({
        destinataire_email: user.email,
        destinataire_role: 'livreur',
        titre: `🔥 ${newStreak} jours consécutifs !`,
        message: `Incroyable — ${newStreak} jours actifs de suite ! Tu gagnes +${Math.min(newStreak * 3, 30)} pts bonus dans le classement.`,
        type: 'success',
        lue: false,
      });
    }

    // Sauvegarder
    await base44.auth.updateMe({
      streak_jours: newStreak,
      streak_derniere_date: today,
      rank_precedent: currentRank,
    });

    return Response.json({ success: true, streak: newStreak, rank: currentRank });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});