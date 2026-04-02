// Gamification avancée — objectifs journaliers, streak, comparaison classement

const DAILY_GOALS = [
  { target: 3, label: '3 courses', reward: '+5 pts score', emoji: '🎯' },
  { target: 5, label: '5 courses', reward: '+12 pts score', emoji: '🔥' },
  { target: 10, label: '10 courses', reward: 'Badge ELITE', emoji: '👑' },
];

function StreakFlame({ streak }) {
  if (!streak || streak < 2) return null;
  const color = streak >= 7 ? 'text-red-500' : streak >= 3 ? 'text-orange-500' : 'text-yellow-500';
  return (
    <div className={`flex items-center gap-1 font-bold text-sm ${color}`}>
      🔥 {streak} jours consécutifs
    </div>
  );
}

export default function LivreurGameStats({ user, coursesToday, classement }) {
  const streak = user.streak_jours || 0;
  const prevRank = user.rank_precedent || null;
  const currentRank = classement?.rank || null;
  const rankChange = prevRank && currentRank ? prevRank - currentRank : null;

  // Objectif actif = premier non atteint
  const activeGoal = DAILY_GOALS.find(g => coursesToday < g.target) || DAILY_GOALS[DAILY_GOALS.length - 1];
  const prevGoal = DAILY_GOALS.find(g => coursesToday >= g.target && DAILY_GOALS.indexOf(DAILY_GOALS.find(g2 => g2 === g)) < DAILY_GOALS.length - 1);
  const progressPct = Math.min((coursesToday / activeGoal.target) * 100, 100);
  const allGoalsDone = coursesToday >= DAILY_GOALS[DAILY_GOALS.length - 1].target;

  return (
    <div className="space-y-3">

      {/* Notification classement */}
      {rankChange !== null && rankChange !== 0 && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 font-semibold text-sm ${
          rankChange > 0
            ? 'bg-green-50 border-green-400 text-green-800'
            : 'bg-red-50 border-red-400 text-red-800'
        }`}>
          <span className="text-xl">{rankChange > 0 ? '📈' : '📉'}</span>
          <div>
            {rankChange > 0
              ? `Tu as gagné ${rankChange} place${rankChange > 1 ? 's' : ''} ! Maintenant #${currentRank}`
              : `Tu as perdu ${Math.abs(rankChange)} place${Math.abs(rankChange) > 1 ? 's' : ''} — reviens en force !`}
          </div>
        </div>
      )}

      {/* Proximité top 3 */}
      {currentRank && currentRank <= 6 && currentRank > 3 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-yellow-400 bg-yellow-50 text-yellow-800 font-semibold text-sm">
          <span className="text-xl">🏆</span>
          Tu es à {currentRank - 3} place{currentRank - 3 > 1 ? 's' : ''} du top 3 ! Accélère !
        </div>
      )}

      {/* Objectif journalier */}
      <div className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">{activeGoal.emoji}</span>
            <div>
              <p className="font-bold text-sm">Objectif du jour</p>
              <p className="text-xs text-muted-foreground">
                {allGoalsDone ? '🎉 Tous les objectifs atteints !' : `${coursesToday} / ${activeGoal.target} courses — ${activeGoal.reward}`}
              </p>
            </div>
          </div>
          <StreakFlame streak={streak} />
        </div>

        {/* Barre de progression */}
        <div className="space-y-1">
          <div className="h-3 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                allGoalsDone ? 'bg-green-500' : 'bg-primary'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {/* Jalons */}
          <div className="flex justify-between">
            {DAILY_GOALS.map(g => (
              <div key={g.target} className="flex flex-col items-center gap-0.5">
                <div className={`h-2 w-2 rounded-full border-2 ${
                  coursesToday >= g.target ? 'bg-primary border-primary' : 'bg-white border-muted-foreground/40'
                }`} />
                <span className="text-[9px] text-muted-foreground">{g.target}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Badges débloqués aujourd'hui */}
        {DAILY_GOALS.filter(g => coursesToday >= g.target).map(g => (
          <div key={g.target} className="flex items-center gap-2 text-xs text-green-700 font-semibold">
            <span>✅</span> {g.label} atteint — {g.reward} débloqué !
          </div>
        ))}
      </div>

      {/* Streak */}
      {streak >= 2 && (
        <div className={`rounded-xl p-3 flex items-center gap-3 border-2 ${
          streak >= 7 ? 'bg-red-50 border-red-300' : streak >= 3 ? 'bg-orange-50 border-orange-300' : 'bg-yellow-50 border-yellow-300'
        }`}>
          <span className="text-3xl">🔥</span>
          <div>
            <p className="font-bold text-sm">{streak} jours consécutifs actifs !</p>
            <p className="text-xs text-muted-foreground">
              {streak >= 7 ? 'Légendaire — tu domines CDL !' : streak >= 3 ? 'Garde ce rythme !' : 'Continue demain pour prolonger le streak !'}
            </p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs font-bold text-primary">+{Math.min(streak * 3, 30)} pts</p>
            <p className="text-[10px] text-muted-foreground">bonus score</p>
          </div>
        </div>
      )}

      {/* Comparaison classement */}
      {classement && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-bold text-sm">🏆 Classement CDL</p>
            <span className="text-xs text-muted-foreground">{classement.total} livreurs</span>
          </div>

          {/* Ma position */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/10 border border-primary/30">
            <span className="text-2xl font-extrabold text-primary">#{classement.rank}</span>
            <div className="flex-1">
              <p className="font-semibold text-sm text-primary">Ma position</p>
              <p className="text-xs text-muted-foreground">Score : {classement.score}/100</p>
            </div>
            {rankChange !== null && rankChange > 0 && (
              <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">▲{rankChange}</span>
            )}
            {rankChange !== null && rankChange < 0 && (
              <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">▼{Math.abs(rankChange)}</span>
            )}
          </div>

          {/* Top 3 */}
          {classement.top3?.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase">Top 3</p>
              {classement.top3.map((l, i) => {
                const isMe = l.email === user.email;
                const medals = ['🥇', '🥈', '🥉'];
                return (
                  <div key={l.email} className={`flex items-center gap-2 p-2 rounded-lg text-xs ${isMe ? 'bg-primary/10 font-bold' : 'bg-muted/40'}`}>
                    <span className="text-base">{medals[i]}</span>
                    <span className="flex-1 truncate">{isMe ? 'Moi' : (l.email?.split('@')[0] || 'Livreur')}</span>
                    <span className="font-bold text-primary">{l.score}/100</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}