import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import PubliciteTracker from "./PubliciteTracker";
import MediaGallery from "./MediaGallery";
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

  if (loading || ads.length === 0 || error) return null;

  const current = ads?.[currentIndex];
  if (!current) return null;

  // Parser images
  let allImages = [];
  if (current.image_url) allImages.push(current.image_url);
  if (current.images) {
    try {
      const parsed = JSON.parse(current.images);
      if (Array.isArray(parsed)) allImages.push(...parsed);
    } catch {}
  }
  allImages = allImages.filter(Boolean);

  // Auto-rotate
  useEffect(() => {
    const timer = setInterval(goNext, 8000);
    return () => clearInterval(timer);
  }, [currentIndex, ads.length]);

  const trackClick = (pubId, pubUrl) => {
    base44.functions
      .invoke('trackPubliciteInteraction', {
        publicite_id: pubId,
        interaction_type: 'click',
        user_role: userRole,
      })
      .catch(() => {});
    if (pubUrl) window.open(pubUrl, '_blank');
  };

  return (
    <PubliciteTracker publiciteId={current.id} userRole={userRole}>
      <div className="relative w-full rounded-2xl overflow-hidden group shadow-lg">
        {/* Galerie média unifiée */}
        <MediaGallery
          images={allImages}
          videoUrl={current?.video_url}
          videoTitle={current?.video_title}
        />

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

        {/* Titre + CTA overlay */}
        {current.titre && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 z-10">
            <p className="font-bold text-base text-white line-clamp-2">{current.titre}</p>
            {current.lien_url && (
              <a
                href={current.lien_url}
                target="_blank"
                rel="noreferrer"
                onClick={() => trackClick(current.id, current.lien_url)}
                className="text-white/90 text-xs font-medium mt-2 inline-block underline hover:text-white transition-colors"
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