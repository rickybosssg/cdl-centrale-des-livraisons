/**
 * AdminBadge - Affiche un petit badge rouge avec un compteur
 * Utilisé sur les tuiles du dashboard admin
 */
export default function AdminBadge({ count = 0 }) {
  if (count <= 0) return null;

  const displayCount = count > 99 ? "99+" : count;

  return (
    <div className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold rounded-full h-6 w-6 flex items-center justify-center shadow-lg">
      {displayCount}
    </div>
  );
}