import { cn } from "@/lib/utils";

const STATUS_CONFIG = {
  en_attente: { label: "En attente", className: "bg-amber-100 text-amber-700 border-amber-200" },
  assignee_attente: { label: "Assignée", className: "bg-blue-100 text-blue-700 border-blue-200" },
  acceptee: { label: "Acceptée", className: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  en_cours: { label: "En cours", className: "bg-purple-100 text-purple-700 border-purple-200" },
  livree: { label: "Livrée", className: "bg-green-100 text-green-700 border-green-200" },
  annulee: { label: "Annulée", className: "bg-red-100 text-red-700 border-red-200" },
  aucun_livreur: { label: "Sans livreur", className: "bg-red-100 text-red-700 border-red-200" },
  refusee: { label: "Refusée", className: "bg-red-100 text-red-700 border-red-200" },
};

export default function StatusBadge({ statut }) {
  const config = STATUS_CONFIG[statut] || STATUS_CONFIG.en_attente;
  return (
    <span className={cn(
      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
      config.className
    )}>
      {config.label}
    </span>
  );
}