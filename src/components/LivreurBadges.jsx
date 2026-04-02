// Badges de motivation pour les livreurs — sans bonus financier
// Basé sur : taux d'acceptation, rapidité, activité, total courses

const BADGES = [
  {
    id: 'rapide',
    emoji: '⚡',
    label: 'Rapide',
    desc: 'Temps de réponse < 30s',
    color: 'bg-yellow-50 border-yellow-400 text-yellow-700',
    check: (u) => (u.temps_reponse_moyen_sec || 999) < 30,
  },
  {
    id: 'fiable',
    emoji: '🛡️',
    label: 'Fiable',
    desc: 'Taux d\'acceptation > 80%',
    color: 'bg-blue-50 border-blue-400 text-blue-700',
    check: (u) => {
      const p = u.courses_proposees || 0;
      const a = u.courses_acceptees || 0;
      return p >= 5 && a / p >= 0.8;
    },
  },
  {
    id: 'actif',
    emoji: '🔥',
    label: 'Actif',
    desc: '≥ 20 courses livrées',
    color: 'bg-orange-50 border-orange-400 text-orange-700',
    check: (u) => (u.total_courses_livrees || 0) >= 20,
  },
  {
    id: 'elite',
    emoji: '👑',
    label: 'Élite',
    desc: 'Taux > 90% + réponse < 20s + 50 courses',
    color: 'bg-purple-50 border-purple-400 text-purple-700',
    check: (u) => {
      const p = u.courses_proposees || 0;
      const a = u.courses_acceptees || 0;
      return p >= 10 && a / p >= 0.9 && (u.temps_reponse_moyen_sec || 999) < 20 && (u.total_courses_livrees || 0) >= 50;
    },
  },
];

// Calcule le score de classement (0–100)
function calcScore(u) {
  const p = u.courses_proposees || 0;
  const a = u.courses_acceptees || 0;
  const taux = p > 0 ? Math.min(a / p, 1) : 0.5;
  const rapideScore = Math.max(0, 1 - ((u.temps_reponse_moyen_sec || 60) / 120));
  const activiteScore = Math.min((u.total_courses_livrees || 0) / 100, 1);
  return Math.round((taux * 40) + (rapideScore * 35) + (activiteScore * 25));
}

export default function LivreurBadges({ user, classement }) {
  const earnedBadges = BADGES.filter(b => b.check(user));
  const lockedBadges = BADGES.filter(b => !b.check(user));
  const score = calcScore(user);

  const p = user.courses_proposees || 0;
  const a = user.courses_acceptees || 0;
  const tauxAccept = p > 0 ? Math.round((a / p) * 100) : null;

  return (
    <div className="space-y-3">
      {/* Score & classement */}
      <div className="rounded-2xl bg-gradient-to-br from-primary to-blue-700 text-white p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs font-medium text-white/70">Score de performance</p>
            <p className="text-3xl font-extrabold">{score}<span className="text-lg font-normal text-white/70">/100</span></p>
          </div>
          {classement && (
            <div className="text-right">
              <p className="text-xs text-white/70">Classement</p>
              <p className="text-2xl font-extrabold">#{classement.rank}</p>
              <p className="text-[10px] text-white/60">sur {classement.total} livreurs</p>
            </div>
          )}
        </div>
        {/* Barre de score */}
        <div className="h-2 rounded-full bg-white/20">
          <div
            className="h-full rounded-full bg-white transition-all duration-700"
            style={{ width: `${score}%` }}
          />
        </div>
        {/* Métriques */}
        <div className="grid grid-cols-3 gap-2 mt-3 text-center">
          <div>
            <p className="text-lg font-bold">{user.total_courses_livrees || 0}</p>
            <p className="text-[10px] text-white/70">Courses</p>
          </div>
          <div>
            <p className="text-lg font-bold">{tauxAccept !== null ? `${tauxAccept}%` : '—'}</p>
            <p className="text-[10px] text-white/70">Acceptation</p>
          </div>
          <div>
            <p className="text-lg font-bold">
              {user.temps_reponse_moyen_sec ? `${user.temps_reponse_moyen_sec}s` : '—'}
            </p>
            <p className="text-[10px] text-white/70">Réponse moy.</p>
          </div>
        </div>
      </div>

      {/* Badges débloqués */}
      {earnedBadges.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mes badges</p>
          <div className="flex flex-wrap gap-2">
            {earnedBadges.map(b => (
              <div key={b.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 text-xs font-bold ${b.color}`}>
                <span className="text-base">{b.emoji}</span>
                {b.label}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Prochains badges à débloquer */}
      {lockedBadges.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">À débloquer</p>
          <div className="flex flex-wrap gap-2">
            {lockedBadges.map(b => (
              <div key={b.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 border-dashed border-border bg-muted/30 text-xs text-muted-foreground opacity-60">
                <span className="grayscale">{b.emoji}</span>
                {b.label}
                <span className="text-[10px]">— {b.desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}