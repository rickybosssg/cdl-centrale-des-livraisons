import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { X } from 'lucide-react';

/**
 * Composant d'affichage global des publicités
 * Affiche TOUTES les pubs actives à TOUS les utilisateurs sans filtrage
 * À ajouter dans tous les dashboards et pages principales
 */
export default function PublicAdGlobal({ placement = 'home' }) {
  const [ad, setAd] = useState(null);
  const [closed, setClosed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (closed) return;

    const loadAd = async () => {
      try {
        setLoading(true);
        const now = new Date().toISOString();

        // Charger TOUTES les pubs actives SANS filtre de rôle
        const allAds = await base44.entities.Publicite.list('-created_date', 50);

        // Filtrer seulement par :
        // 1. active = true
        // 2. dates valides
        // 3. placement (si spécifié)
        const availableAds = allAds.filter(a => {
          if (!a.active) return false;
          
          const hasValidDates = !a.date_debut || !a.date_fin || 
            (new Date(a.date_debut) <= new Date(now) && 
             new Date(now) <= new Date(a.date_fin));
          if (!hasValidDates) return false;

          const matchPlacement = !placement || 
            a.placement === placement || 
            a.placement === 'toutes_pages' || 
            a.placement === 'tous';
          return matchPlacement;
        });

        if (availableAds.length > 0) {
          const randomAd = availableAds[Math.floor(Math.random() * availableAds.length)];
          setAd(randomAd);

          // Tracker vue
          try {
            await base44.functions.invoke('trackAdView', { adId: randomAd.id });
          } catch (_) {}
        }
      } catch (err) {
        console.error('[PublicAdGlobal] Error loading ads:', err);
      } finally {
        setLoading(false);
      }
    };

    loadAd();

    // Subscribe pour mettre à jour en temps réel
    const unsub = base44.entities.Publicite.subscribe((event) => {
      if (event.type === 'create' || event.type === 'update') {
        // Recharger les pubs
        loadAd();
      }
    });

    return () => unsub();
  }, [placement, closed]);

  if (!ad || closed || loading) return null;

  const handleClick = async () => {
    try {
      await base44.functions.invoke('trackAdClick', { adId: ad.id });
    } catch (_) {}
    if (ad.lien_url) window.open(ad.lien_url, '_blank');
  };

  return (
    <div className="relative w-full rounded-lg overflow-hidden shadow-md border border-border/50 group cursor-pointer hover:shadow-lg transition-shadow">
      {/* Image/Vidéo */}
      <div className="relative aspect-video bg-black overflow-hidden" onClick={handleClick}>
        {ad.type === 'Vidéo' || ad.type === 'video' ? (
          <video
            src={ad.image_url}
            autoPlay
            muted
            loop
            className="w-full h-full object-cover"
          />
        ) : (
          <img
            src={ad.image_url}
            alt={ad.titre || 'Publicité'}
            className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
          />
        )}

        {/* Overlay gradient + titre */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent flex flex-col justify-between p-3">
          <div className="flex justify-between items-start">
            <span className="text-white text-[10px] font-bold bg-black/60 px-2 py-1 rounded-full">
              📢 PUBLICITÉ
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setClosed(true);
              }}
              className="bg-black/60 hover:bg-black/80 p-1.5 rounded-full transition-colors"
            >
              <X className="h-4 w-4 text-white" />
            </button>
          </div>
          <div>
            {ad.titre && (
              <p className="text-white font-bold text-sm mb-1">{ad.titre}</p>
            )}
            {ad.description && (
              <p className="text-white/80 text-xs truncate">{ad.description}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}