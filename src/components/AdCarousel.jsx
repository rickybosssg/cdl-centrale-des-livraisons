import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import AdDisplay from "@/components/AdDisplay";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function AdCarousel({ placement = "accueil", userRole = "client" }) {
  const [ads, setAds] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAds = async () => {
      try {
        // ✅ Charger TOUTES les pubs actives SANS filtre placement initial
        const now = new Date().toISOString();
        const allAds = await base44.entities.Publicite.list('-created_date', 50);

        // ✅ Filtrer par date et active
        const active = allAds.filter(ad => {
          if (!ad.active) return false;
          if (!ad.date_debut || !ad.date_fin) return true;
          const start = new Date(ad.date_debut);
          const end = new Date(ad.date_fin);
          return start <= new Date(now) && new Date(now) <= end;
        });

        // ✅ Filtrer par placement et cible (sans bloquant)
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

    // Subscribe pour mise à jour temps réel
    const unsub = base44.entities.Publicite.subscribe((event) => {
      if (event.type === 'create' || event.type === 'update') {
        loadAds();
      }
    });

    return unsub;
  }, [placement, userRole]);

  if (loading || ads.length === 0) return null;

  const current = ads[currentIndex];
  const next = () => setCurrentIndex((currentIndex + 1) % ads.length);
  const prev = () => setCurrentIndex((currentIndex - 1 + ads.length) % ads.length);

  // Auto-rotate toutes les 8 secondes
  useEffect(() => {
    const timer = setInterval(next, 8000);
    return () => clearInterval(timer);
  }, [currentIndex, ads.length]);

  return (
    <div className="relative w-full bg-gray-900 rounded-lg overflow-hidden group">
      {/* Pub */}
      <div className="relative aspect-video bg-black">
        {current.type === "video" ? (
          <video
            src={current.image_url}
            autoPlay
            muted
            loop
            className="w-full h-full object-cover"
          />
        ) : (
          <img
            src={current.image_url}
            alt={current.titre}
            className="w-full h-full object-cover"
          />
        )}

        {/* Navigation */}
        {ads.length > 1 && (
          <>
            <button
              onClick={prev}
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/40 p-2 rounded-full opacity-0 group-hover:opacity-100 transition-all"
            >
              <ChevronLeft className="h-5 w-5 text-white" />
            </button>
            <button
              onClick={next}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/40 p-2 rounded-full opacity-0 group-hover:opacity-100 transition-all"
            >
              <ChevronRight className="h-5 w-5 text-white" />
            </button>

            {/* Dots */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
              {ads.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentIndex(i)}
                  className={`h-2 rounded-full transition-all ${
                    i === currentIndex ? "bg-white w-6" : "bg-white/40 w-2"
                  }`}
                />
              ))}
            </div>
          </>
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
  );
}