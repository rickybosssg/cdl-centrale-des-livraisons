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
        // ✅ CORRECTION: Charger TOUTES les pubs sans filtre initial
        const allAds = await base44.entities.Publicite.list('-created_date', 50);

        // ✅ Filtrer par dates valides
        const active = allAds.filter(adItem => {
          if (!adItem.active) return false;
          if (!adItem.date_debut || !adItem.date_fin) return true;
          const start = new Date(adItem.date_debut);
          const end = new Date(adItem.date_fin);
          return start <= new Date(now) && new Date(now) <= end;
        });

        // ✅ CORRECTION: Afficher les pubs sans filtrage par rôle
        // Si destinataires est vide ou 'tous', afficher à tous
        const targeted = active.filter(adItem => {
          const dest = adItem.destinataires || 'tous';
          if (!dest || dest === 'tous' || dest === '') return true;
          const cible = dest.split(',').map(c => c.trim());
          if (cible.includes('tous')) return true;
          // Optionnel : filtrer par rôle seulement si explicitement défini
          if (userRole === 'client' && cible.includes('clients')) return true;
          if (userRole === 'livreur' && cible.includes('livreurs')) return true;
          if (userRole === 'partenaire' && cible.includes('partenaires')) return true;
          if (userRole === 'commercial' && cible.includes('commerciaux')) return true;
          if (userRole === 'admin' && cible.includes('admin')) return true;
          // Si pas de rôle défini, afficher quand même
          return cible.length === 0;
        });

        if (targeted.length > 0) {
          setAd(targeted[Math.floor(Math.random() * targeted.length)]);
        }
      } catch (err) {
        console.error("[AdBanner] Error:", err);
      }
    };

    loadAd();

    // Subscribe pour mise à jour temps réel
    const unsub = base44.entities.Publicite.subscribe((event) => {
      if (event.type === 'create' || event.type === 'update') {
        loadAd();
      }
    });

    return unsub;
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