import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Volume2, VolumeX, X } from "lucide-react";

export default function AdDisplay({ ad, onClose, compact = false, placement = "accueil", userRole = "client" }) {
  const [muted, setMuted] = useState(true);
  const [countdownClose, setCountdownClose] = useState(null);
  const [loadedAd, setLoadedAd] = useState(ad);
  const videoRef = useRef(null);

  // Charger une pub si pas fournie
  useEffect(() => {
    if (ad) {
      setLoadedAd(ad);
      return;
    }

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
          setLoadedAd(targeted[Math.floor(Math.random() * targeted.length)]);
        }
      } catch (err) {
        console.error("[AdDisplay] Error loading ad:", err);
      }
    };

    loadAd();
  }, [ad, placement, userRole]);

  // Tracker vue
  useEffect(() => {
    if (!loadedAd?.id) return;

    const trackView = async () => {
      try {
        await base44.functions.invoke("trackAdView", { adId: loadedAd.id });
      } catch (err) {
        console.error("[AdDisplay] Track view error:", err);
      }
    };

    trackView();
  }, [loadedAd?.id]);

  // Countdown fermeture auto après 3 sec si vidéo
  useEffect(() => {
    if (!loadedAd || loadedAd.type !== "video" || !onClose) return;

    const timer = setTimeout(() => setCountdownClose(3), 3000);
    const countdownInterval = setInterval(() => {
      setCountdownClose(prev => {
        if (prev && prev <= 1) {
          clearInterval(countdownInterval);
          onClose();
          return null;
        }
        return prev ? prev - 1 : null;
      });
    }, 1000);

    return () => {
      clearTimeout(timer);
      clearInterval(countdownInterval);
    };
  }, [loadedAd, onClose]);

  if (!loadedAd) return null;

  const isVideo = loadedAd.type === "video";
  const handleClick = async () => {
    try {
      await base44.functions.invoke("trackAdClick", { adId: loadedAd.id });
    } catch (err) {
      console.error("[AdDisplay] Track click error:", err);
    }
    if (loadedAd.lien_url) window.open(loadedAd.lien_url, "_blank");
  };

  // Compact: petit affichage (banner)
  if (compact) {
    return (
      <div className="relative w-full bg-gray-900 rounded-lg overflow-hidden cursor-pointer group"
        onClick={handleClick}>
        {isVideo ? (
          <div className="relative aspect-video bg-black">
            <video ref={videoRef} src={loadedAd.image_url} autoPlay muted={muted} loop className="w-full h-full object-cover" />
            <button
              onClick={(e) => { e.stopPropagation(); setMuted(!muted); }}
              className="absolute top-2 right-2 bg-black/50 p-1.5 rounded-full hover:bg-black/70 transition-colors">
              {muted ? <VolumeX className="h-4 w-4 text-white" /> : <Volume2 className="h-4 w-4 text-white" />}
            </button>
          </div>
        ) : (
          <img src={loadedAd.image_url} alt={loadedAd.titre} className="w-full h-full object-cover group-hover:opacity-90 transition-opacity" />
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent p-3 flex flex-col justify-between">
          <div className="flex justify-end">
            {onClose && (
              <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="bg-white/20 hover:bg-white/40 p-1 rounded-full transition-colors">
                <X className="h-4 w-4 text-white" />
              </button>
            )}
          </div>
          <div>
            {loadedAd.titre && <p className="text-white font-bold text-sm mb-1 truncate">{loadedAd.titre}</p>}
            {countdownClose && <p className="text-white/70 text-xs">Fermeture dans {countdownClose}s</p>}
          </div>
        </div>
      </div>
    );
  }

  // Full-screen modal (écran attente)
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="relative w-full max-w-md bg-black rounded-xl overflow-hidden">
        {isVideo ? (
          <div className="relative aspect-video bg-black">
            <video ref={videoRef} src={loadedAd.image_url} autoPlay muted={muted} loop className="w-full h-full object-cover" />
            <button
              onClick={() => setMuted(!muted)}
              className="absolute top-3 right-3 bg-white/20 hover:bg-white/40 p-2 rounded-full transition-colors">
              {muted ? <VolumeX className="h-5 w-5 text-white" /> : <Volume2 className="h-5 w-5 text-white" />}
            </button>
          </div>
        ) : (
          <img src={loadedAd.image_url} alt={loadedAd.titre} className="w-full h-auto object-cover" />
        )}

        <div className="p-4 bg-black space-y-3">
          {loadedAd.titre && <p className="text-white font-bold text-base">{loadedAd.titre}</p>}
          {loadedAd.description && <p className="text-white/80 text-xs">{loadedAd.description}</p>}

          <div className="flex gap-2">
            {loadedAd.lien_url && (
              <button
                onClick={handleClick}
                className="flex-1 bg-primary hover:bg-primary/90 text-white font-semibold py-2 rounded-lg text-sm transition-colors">
                Voir plus
              </button>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="flex-1 bg-white/20 hover:bg-white/30 text-white font-semibold py-2 rounded-lg text-sm transition-colors">
                {countdownClose ? `Fermer (${countdownClose}s)` : "Passer"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}