import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Volume2, VolumeX, X } from "lucide-react";

/**
 * AdBanner - Affiche une pub image/vidéo de manière compacte et discrète
 * Utilisé dans l'écran attente livreur et dashboards
 */
export default function AdBanner({ placement = "accueil", userRole = "client", compact = true }) {
  const [ad, setAd] = useState(null);
  const [muted, setMuted] = useState(true);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    if (closed) return;

    const loadAd = async () => {
      try {
        const now = new Date().toISOString();
        const allAds = await base44.entities.Publicite.filter({ active: true });

        const active = allAds.filter(adItem => {
          const start = new Date(adItem.date_debut);
          const end = new Date(adItem.date_fin);
          return start <= new Date(now) && new Date(now) <= end;
        });

        const targeted = active.filter(adItem => {
          const cible = (adItem.destinataires || "tous").split(",").map(c => c.trim());
          if (cible.includes("tous")) return true;
          if (userRole === "client" && cible.includes("clients")) return true;
          if (userRole === "livreur" && cible.includes("livreurs")) return true;
          if (userRole === "partenaire" && cible.includes("partenaires")) return true;
          return false;
        });

        if (targeted.length > 0) {
          setAd(targeted[Math.floor(Math.random() * targeted.length)]);
        }
      } catch (err) {
        console.error("[AdBanner] Error:", err);
      }
    };

    loadAd();
  }, [placement, userRole, closed]);

  // Tracker vue
  useEffect(() => {
    if (!ad?.id || closed) return;
    const timer = setTimeout(async () => {
      try {
        await base44.functions.invoke("trackAdView", { adId: ad.id });
      } catch (err) {
        console.error("[AdBanner] Track view error:", err);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [ad?.id, closed]);

  if (!ad || closed) return null;

  const isVideo = ad.type === "Vidéo";
  const handleClick = async () => {
    try {
      await base44.functions.invoke("trackAdClick", { adId: ad.id });
    } catch (err) {
      console.error("[AdBanner] Track click error:", err);
    }
    if (ad.lien_url) window.open(ad.lien_url, "_blank");
  };

  return (
    <div
      className="relative w-full bg-gray-900 rounded-lg overflow-hidden cursor-pointer group transition-all hover:shadow-lg"
      onClick={handleClick}
    >
      {/* Media */}
      <div className="relative aspect-video bg-black">
        {isVideo ? (
          <video
            src={ad.image_url}
            autoPlay
            muted={muted}
            loop
            className="w-full h-full object-cover"
          />
        ) : (
          <img
            src={ad.image_url}
            alt={ad.titre}
            className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
          />
        )}

        {/* Controls */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-3">
          {isVideo && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMuted(!muted);
              }}
              className="bg-white/20 hover:bg-white/40 p-1.5 rounded-full transition-colors"
            >
              {muted ? (
                <VolumeX className="h-4 w-4 text-white" />
              ) : (
                <Volume2 className="h-4 w-4 text-white" />
              )}
            </button>
          )}

          {ad.titre && (
            <p className="text-white font-bold text-xs truncate flex-1 ml-2">{ad.titre}</p>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              setClosed(true);
            }}
            className="bg-white/20 hover:bg-white/40 p-1 rounded-full transition-colors flex-shrink-0"
          >
            <X className="h-3.5 w-3.5 text-white" />
          </button>
        </div>
      </div>

      {/* Badge */}
      <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded-full">
        <p className="text-white text-[10px] font-bold">📢 Publicité</p>
      </div>
    </div>
  );
}