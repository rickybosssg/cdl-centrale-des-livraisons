import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import PubliciteTracker from "./PubliciteTracker";
import PubliciteCard from "./PubliciteCard";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function AdCarousel({ placement = "accueil", userRole = "client" }) {
  const [ads, setAds] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const loadAds = async () => {
      try {
        const now = new Date().toISOString();
        const allAds = await base44.entities.Publicite.list('-created_date', 50);
        if (!isMounted) return;

        const safeAds = Array.isArray(allAds) ? allAds : [];
        const active = safeAds.filter(ad => {
          if (!ad?.active) return false;
          if (!ad?.date_debut || !ad?.date_fin) return true;
          const start = new Date(ad.date_debut);
          const end = new Date(ad.date_fin);
          return start <= new Date(now) && new Date(now) <= end;
        });

        const targeted = active.filter(ad => {
          // Filtre placement
          const matchPlace = !placement
            || ad.placement === placement
            || ad.placement === 'toutes_pages'
            || ad.placement === 'tous';

          // Filtre cibles — supporte targets (array) et destinataires (string legacy)
          const targets = Array.isArray(ad.targets) ? ad.targets : [];
          const destStr = ad.destinataires || '';
          // Si aucune cible définie → visible par tous
          if (targets.length === 0 && !destStr) return matchPlace;
          // Targets array (nouveau format)
          if (targets.length > 0) {
            const matchTarget = targets.includes('all')
              || targets.includes('tous')
              || targets.includes(userRole);
            return matchPlace && matchTarget;
          }
          // Fallback legacy destinataires string
          const cibles = destStr.split(',').map(c => c.trim().toLowerCase());
          const matchDest = cibles.includes('tous')
            || cibles.includes('all')
            || cibles.includes(userRole)
            || cibles.includes(userRole + 's'); // "clients", "livreurs"...
          return matchPlace && matchDest;
        });

        if (isMounted) setAds(targeted);
      } catch (err) {
        console.error("[AdCarousel] Error:", err);
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadAds();

    const unsub = base44.entities.Publicite.subscribe(() => {
      if (isMounted) loadAds();
    });
    
    const intervalId = setInterval(() => {
      if (isMounted) loadAds();
    }, 30000);
    
    return () => {
      isMounted = false;
      unsub?.();
      clearInterval(intervalId);
    };
  }, [placement, userRole]);

  const goNext = () => setCurrentIndex((currentIndex + 1) % ads.length);
  const goPrev = () => setCurrentIndex((currentIndex - 1 + ads.length) % ads.length);

  // Auto-rotate (toujours appelé — avant tout return conditionnel)
  useEffect(() => {
    if (ads.length === 0) return;
    const timer = setInterval(goNext, 8000);
    return () => clearInterval(timer);
  }, [currentIndex, ads.length]);

  if (loading || ads.length === 0 || error) return null;

  const current = ads?.[currentIndex];
  if (!current) return null;

  return (
    <PubliciteTracker publiciteId={current.id} userRole={userRole}>
      <div className="relative w-full group">
        <PubliciteCard publicite={current} userRole={userRole} />

        {/* Navigation entre pubs */}
        {ads.length > 1 && (
          <>
            <button
              onClick={goPrev}
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/40 p-2 rounded-full opacity-0 group-hover:opacity-100 transition-all z-10"
            >
              <ChevronLeft className="h-5 w-5 text-white" />
            </button>
            <button
              onClick={goNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/40 p-2 rounded-full opacity-0 group-hover:opacity-100 transition-all z-10"
            >
              <ChevronRight className="h-5 w-5 text-white" />
            </button>

            {/* Dots pubs */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
              {ads.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentIndex(i)}
                  className={`rounded-full transition-all ${
                    i === currentIndex ? 'bg-white w-4 h-1.5' : 'bg-white/40 w-1.5 h-1.5'
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </PubliciteTracker>
  );
}