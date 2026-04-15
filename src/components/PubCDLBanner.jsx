import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { X, ExternalLink, ChevronRight } from "lucide-react";

/**
 * PubCDLBanner — Affichage premium publicités CDL
 * - object-contain : jamais de rognage
 * - fond flouté basé sur l'image pour combler les bandes
 * - responsive mobile-first
 */
export default function PubCDLBanner({ placement, userRole = "client" }) {
  const [pub, setPub] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const trackedRef = useRef(false);

  // Charger la pub
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

  // Tracker impression (1 fois, après 1s)
  useEffect(() => {
    if (!pub?.id || dismissed || trackedRef.current) return;
    const t = setTimeout(() => {
      trackedRef.current = true;
      base44.entities.Publicite.update(pub.id, { impressions: (pub.impressions || 0) + 1 }).catch(() => {});
    }, 1000);
    return () => clearTimeout(t);
  }, [pub?.id, dismissed]);

  const handleClick = () => {
    if (!pub) return;
    base44.entities.Publicite.update(pub.id, { clics: (pub.clics || 0) + 1 }).catch(() => {});
    if (pub.lien_url) window.open(pub.lien_url, "_blank");
  };

  if (!pub || dismissed) return null;

  const hasMedia = pub.video_url || pub.image_url;
  const CDL_FALLBACK = "https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg";

  return (
    <div
      className="relative rounded-2xl overflow-hidden shadow-md border border-white/10 bg-gray-900"
      style={{ animation: "fadeInUp 0.35s ease" }}
    >
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Badge + Fermer */}
      <div className="absolute top-2 left-2 z-20">
        <span className="bg-black/60 text-white text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm">
          📢 Publicité
        </span>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-2 right-2 z-20 bg-black/60 hover:bg-black/80 text-white p-1.5 rounded-full backdrop-blur-sm transition-colors"
      >
        <X className="h-3 w-3" />
      </button>

      {/* ── VIDÉO ── */}
      {pub.video_url ? (
        <div className="relative w-full bg-black" style={{ aspectRatio: "16/9" }}>
          <video
            src={pub.video_url}
            autoPlay muted loop playsInline
            className="w-full h-full object-contain cursor-pointer"
            onClick={handleClick}
          />
        </div>

      ) : (
        /* ── IMAGE avec fond flouté ── */
        <div className="relative w-full overflow-hidden cursor-pointer" onClick={handleClick}>
          {/* Fond flouté (background blur basé sur la même image) */}
          {pub.image_url && !imgError && (
            <div
              className="absolute inset-0 scale-110"
              style={{
                backgroundImage: `url(${pub.image_url})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                filter: "blur(18px) brightness(0.45)",
              }}
            />
          )}
          {/* Image principale en contain — jamais rognée */}
          <div className="relative z-10 flex items-center justify-center py-3 px-3" style={{ minHeight: "140px" }}>
            {!imgError ? (
              <>
                {!imgLoaded && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  </div>
                )}
                <img
                  src={pub.image_url || CDL_FALLBACK}
                  alt={pub.titre || "Publicité CDL"}
                  className="max-w-full max-h-52 object-contain rounded-lg transition-opacity duration-300"
                  style={{ opacity: imgLoaded ? 1 : 0, display: "block" }}
                  onLoad={() => setImgLoaded(true)}
                  onError={() => setImgError(true)}
                />
              </>
            ) : (
              /* Fallback logo CDL */
              <img
                src={CDL_FALLBACK}
                alt="CDL"
                className="h-16 w-16 object-contain rounded-xl opacity-80"
              />
            )}
          </div>
        </div>
      )}

      {/* ── Footer CTA ── */}
      <div
        className="flex items-center gap-3 px-4 py-3 bg-white cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={handleClick}
      >
        <div className="flex-1 min-w-0">
          {pub.titre && (
            <p className="text-sm font-bold text-gray-900 truncate">{pub.titre}</p>
          )}
          {pub.description && (
            <p className="text-xs text-gray-500 truncate mt-0.5">{pub.description}</p>
          )}
          {!pub.titre && !pub.description && (
            <p className="text-xs text-gray-400">Sponsorisé</p>
          )}
        </div>
        {pub.lien_url && (
          <div className="flex items-center gap-1 bg-primary text-white text-xs font-semibold px-3 py-1.5 rounded-full flex-shrink-0">
            Voir <ChevronRight className="h-3 w-3" />
          </div>
        )}
      </div>
    </div>
  );
}