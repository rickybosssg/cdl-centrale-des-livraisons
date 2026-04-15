import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { X, ExternalLink } from "lucide-react";

/**
 * PubCDLBanner — Affiche une publicité CDL ciblée selon le rôle
 * Utilise les champs: active, targets (array), placement, date_debut, date_fin
 */
export default function PubCDLBanner({ placement, userRole = "client" }) {
  const [pub, setPub] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const now = new Date();
        const all = await base44.entities.Publicite.list("-created_date", 100);
        const eligible = (all || []).filter(p => {
          if (!p.active || p.deleted) return false;
          if (p.date_debut && new Date(p.date_debut) > now) return false;
          if (p.date_fin && new Date(p.date_fin) < now) return false;
          if (placement && p.placement !== placement && p.placement !== "toutes_pages") return false;
          const targets = p.targets || ["all"];
          return targets.includes("all") || targets.includes(userRole);
        });
        if (mounted && eligible.length > 0) {
          setPub(eligible[Math.floor(Math.random() * eligible.length)]);
        }
      } catch (_) {}
    };
    load();
    return () => { mounted = false; };
  }, [placement, userRole]);

  // Tracker vue
  useEffect(() => {
    if (!pub?.id || dismissed) return;
    const t = setTimeout(() => {
      base44.entities.Publicite.update(pub.id, { impressions: (pub.impressions || 0) + 1 }).catch(() => {});
    }, 1000);
    return () => clearTimeout(t);
  }, [pub?.id]);

  const handleClick = () => {
    if (!pub) return;
    base44.entities.Publicite.update(pub.id, { clics: (pub.clics || 0) + 1 }).catch(() => {});
    if (pub.lien_url) window.open(pub.lien_url, "_blank");
  };

  if (!pub || dismissed) return null;

  return (
    <div className="relative rounded-2xl overflow-hidden shadow-sm border border-border bg-black/5">
      {/* Badge pub */}
      <span className="absolute top-2 left-2 z-10 bg-black/50 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
        📢 Publicité
      </span>
      {/* Fermer */}
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-2 right-2 z-10 bg-black/50 hover:bg-black/70 text-white p-1 rounded-full"
      >
        <X className="h-3 w-3" />
      </button>

      {/* Vidéo */}
      {pub.video_url ? (
        <div className="w-full bg-black" style={{ aspectRatio: "16/9" }}>
          <video
            src={pub.video_url}
            autoPlay muted loop playsInline
            className="w-full h-full object-contain cursor-pointer"
            onClick={handleClick}
          />
        </div>
      ) : pub.image_url ? (
        /* Image — fond neutre + contain pour ne jamais rogner */
        <div
          className="w-full flex items-center justify-center bg-gray-50 cursor-pointer"
          style={{ minHeight: "120px", maxHeight: "240px" }}
          onClick={handleClick}
        >
          <img
            src={pub.image_url}
            alt={pub.titre}
            className="max-w-full max-h-60 object-contain"
            style={{ display: "block" }}
          />
        </div>
      ) : null}

      {/* Titre + CTA */}
      {(pub.titre || pub.description || pub.lien_url) && (
        <div className="px-3 py-2 bg-white flex items-center gap-2 cursor-pointer" onClick={handleClick}>
          <div className="flex-1 min-w-0">
            {pub.titre && <p className="text-xs font-semibold truncate">{pub.titre}</p>}
            {pub.description && <p className="text-[10px] text-muted-foreground truncate">{pub.description}</p>}
          </div>
          {pub.lien_url && <ExternalLink className="h-3.5 w-3.5 text-primary flex-shrink-0" />}
        </div>
      )}
    </div>
  );
}