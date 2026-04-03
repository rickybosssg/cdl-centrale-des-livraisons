import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import PubliciteTracker from "./PubliciteTracker";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function AdCarousel({ placement = "accueil", userRole = "client" }) {
  const [ads, setAds] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [subIndex, setSubIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    const loadAds = async () => {
      try {
        const now = new Date().toISOString();
        const allAds = await base44.entities.Publicite.list('-created_date', 50);

        const active = allAds.filter(ad => {
          if (!ad.active) return false;
          if (!ad.date_debut || !ad.date_fin) return true;
          const start = new Date(ad.date_debut);
          const end = new Date(ad.date_fin);
          return start <= new Date(now) && new Date(now) <= end;
        });

        const targeted = active.filter(ad => {
          const matchPlace = !placement || ad.placement === placement || ad.placement === 'toutes_pages' || ad.placement === 'tous';
          const dest = ad.destinataires || 'tous';
          const matchDest = !dest || dest === 'tous' || dest === '' || 
            (() => {
              const cible = dest.split(',').map(c => c.trim());
              if (cible.includes('tous')) return true;
              if (userRole === 'client' && cible.includes('clients')) return true;
              if (userRole === 'livreur' && cible.includes('livreurs')) return true;
              if (userRole === 'partenaire' && cible.includes('partenaires')) return true;
              if (userRole === 'commercial' && cible.includes('commerciaux')) return true;
              if (userRole === 'admin' && cible.includes('admin')) return true;
              return cible.length === 0;
            })();
          return matchPlace && matchDest;
        });

        setAds(targeted);
      } catch (err) {
        console.error("[AdCarousel] Error:", err);
      } finally {
        setLoading(false);
      }
    };

    loadAds();

    // Écoute temps réel
    const unsub = base44.entities.Publicite.subscribe(() => loadAds());
    
    // Refresh automatique toutes les 30 secondes
    const intervalId = setInterval(loadAds, 30000);
    
    return () => {
      unsub?.();
      clearInterval(intervalId);
    };
  }, [placement, userRole, refreshTrigger]);

  useEffect(() => { setSubIndex(0); }, [currentIndex]);

  if (loading || ads.length === 0) return null;

  const current = ads[currentIndex];
  const goNext = () => setCurrentIndex((currentIndex + 1) % ads.length);
  const goPrev = () => setCurrentIndex((currentIndex - 1 + ads.length) % ads.length);

  // Extraire les images de la pub courante
  const getCurrentImages = (ad) => {
    if (ad.images) {
      try {
        const parsed = JSON.parse(ad.images);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {}
    }
    return ad.image_url ? [ad.image_url] : [];
  };



  const currentImages = getCurrentImages(current);
  const currentImage = currentImages[subIndex] || currentImages[0];

  // Auto-rotate toutes les 8 secondes
  useEffect(() => {
    const timer = setInterval(goNext, 8000);
    return () => clearInterval(timer);
  }, [currentIndex, ads.length]);

  return (
    <PubliciteTracker publiciteId={current.id} userRole={userRole}>
      <div className="relative w-full bg-gray-900 rounded-lg overflow-hidden group">
        {/* Pub */}
        <div className="relative aspect-video bg-black">
          <img
            src={currentImage}
            alt={current.titre}
            className="w-full h-full object-cover"
            loading="lazy"
          />

          {/* Navigation images internes (multi-images) */}
          {currentImages.length > 1 && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
              {currentImages.map((_, i) => (
                <button key={i} onClick={() => setSubIndex(i)}
                  className={`h-1.5 rounded-full transition-all ${i === subIndex ? 'bg-white w-4' : 'bg-white/50 w-1.5'}`}
                />
              ))}
            </div>
          )}

          {/* Navigation entre pubs */}
          {ads.length > 1 && (
            <>
              <button onClick={goPrev} className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/40 p-2 rounded-full opacity-0 group-hover:opacity-100 transition-all">
                <ChevronLeft className="h-5 w-5 text-white" />
              </button>
              <button onClick={goNext} className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/40 p-2 rounded-full opacity-0 group-hover:opacity-100 transition-all">
                <ChevronRight className="h-5 w-5 text-white" />
              </button>
            </>
          )}

          {/* Dots pubs */}
          {ads.length > 1 && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 flex gap-1.5">
              {ads.map((_, i) => (
                <button key={i} onClick={() => setCurrentIndex(i)}
                  className={`h-1.5 rounded-full transition-all ${i === currentIndex ? 'bg-white w-4' : 'bg-white/40 w-1.5'}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Info overlay */}
        {current.titre && (
          <div className="p-3 bg-gradient-to-t from-black/80 to-transparent">
            <p className="text-white font-semibold text-sm truncate">{current.titre}</p>
            {current.lien_url && (
              <a
                href={current.lien_url}
                target="_blank"
                rel="noreferrer"
                className="text-primary text-xs font-medium mt-1 inline-block hover:underline"
              >
                En savoir plus →
              </a>
            )}
          </div>
        )}
      </div>
    </PubliciteTracker>
  );
}