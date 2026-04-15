import { Card, CardContent } from "@/components/ui/card";
import { Eye, Heart, Trash2, AlertCircle, CheckCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import moment from "moment";

const STATUS_COLORS = {
  "en_attente": { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", label: "⏳ En attente" },
  "validée": { bg: "bg-green-50", border: "border-green-200", text: "text-green-700", label: "✅ Validée" },
  "refusée": { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", label: "❌ Refusée" },
  "expirée": { bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-700", label: "⌛ Expirée" },
};

export default function PubsGrid({ pubs, onDelete, onToggle }) {
  if (pubs.length === 0) {
    return (
      <div className="text-center py-12 space-y-4 bg-muted/30 rounded-xl p-6">
        <div className="text-4xl">📢</div>
        <p className="font-semibold text-gray-700">Aucune publicité pour le moment</p>
        <p className="text-sm text-muted-foreground">Lance ta première pub pour attirer des clients</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {pubs.map(pub => {
        const cfg = STATUS_COLORS[pub.statut] || STATUS_COLORS.en_attente;
        const isExpired = pub.date_fin && new Date(pub.date_fin) < new Date();
        const isActive = pub.active && !isExpired;

        return (
          <Card key={pub.id} className={`overflow-hidden border-l-4 ${cfg.border} hover:shadow-lg transition-shadow`}>
            {/* Image/Video preview */}
            {(pub.image_url || pub.video_url) && (
              <div className="relative h-40 bg-gray-200 overflow-hidden">
                {pub.image_url && (
                  <img src={pub.image_url} alt={pub.titre} className="w-full h-full object-cover" />
                )}
                {pub.video_url && !pub.image_url && (
                  <div className="w-full h-full flex items-center justify-center bg-gray-800 text-white">
                    ▶️ Vidéo
                  </div>
                )}
                {/* Status badge */}
                <div className={`absolute top-2 right-2 px-2 py-1 rounded-full text-xs font-semibold flex items-center gap-1 ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
                  {pub.statut === "validée" && isActive && <span className="h-2 w-2 rounded-full bg-current animate-pulse" />}
                  {cfg.label}
                </div>
              </div>
            )}

            {/* Content */}
            <CardContent className="p-4 space-y-3">
              {/* Title */}
              <h3 className="font-semibold text-sm line-clamp-2">{pub.titre || "Sans titre"}</h3>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Eye className="h-3 w-3" />
                  <span>{pub.impressions || 0} vues</span>
                </div>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Heart className="h-3 w-3" />
                  <span>{pub.clics || 0} clics</span>
                </div>
              </div>

              {/* Dates */}
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {pub.date_debut && pub.date_fin && (
                  <span>
                    {moment(pub.date_debut).format("DD/MM")} → {moment(pub.date_fin).format("DD/MM")}
                  </span>
                )}
              </div>

              {/* Cost */}
              <div className="text-sm font-bold text-primary">
                {(pub.cout || 5000).toLocaleString()} FCFA
              </div>

              {/* Refusal reason */}
              {pub.statut === "refusée" && pub.motif_refus && (
                <div className="flex items-start gap-2 p-2 rounded bg-red-50 border border-red-200">
                  <AlertCircle className="h-3.5 w-3.5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-[10px] text-red-700">{pub.motif_refus}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2 border-t">
                {pub.statut === "validée" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 gap-1 text-xs h-8"
                    onClick={() => onToggle?.(pub)}
                  >
                    {isActive ? "⏸️ Pause" : "▶️ Activer"}
                  </Button>
                )}
                {pub.statut === "en_attente" && (
                  <div className="flex-1 text-xs py-1 rounded bg-amber-50 text-amber-700 flex items-center justify-center font-medium">
                    En attente de validation
                  </div>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600 hover:bg-red-50 gap-1 text-xs h-8"
                  onClick={() => onDelete?.(pub.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Supprimer
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}