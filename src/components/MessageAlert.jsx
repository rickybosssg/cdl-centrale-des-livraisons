const ROLE_LABELS = {
  livreur: "🛵 Livreur",
  client: "👤 Client",
  partenaire: "🏪 Partenaire",
  commercial: "📣 Commercial",
};

export default function MessageAlert({ newMsg }) {
  if (!newMsg) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-gradient-to-r from-red-500 to-red-600 text-white animate-pulse">
      <div className="flex items-center justify-between gap-3 px-4 py-4">
        <div className="flex items-center gap-3 flex-1">
          <span className="text-2xl animate-bounce">🔔</span>
          <div className="min-w-0">
            <p className="text-sm font-bold">NOUVEAU MESSAGE !</p>
            <p className="text-xs opacity-90">{ROLE_LABELS[newMsg.role] || "Utilisateur"} : {newMsg.contenu}</p>
          </div>
        </div>
        <span className="text-xs bg-white/30 px-3 py-1 rounded-full font-bold whitespace-nowrap">✓</span>
      </div>
    </div>
  );
}