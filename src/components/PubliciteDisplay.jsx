import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import PubliciteTracker from './PubliciteTracker';

export default function PubliciteDisplay({ userRole = 'client', userId, userEmail }) {
  const [pub, setPub] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const loadPublicite = async () => {
      try {
        const now = new Date();
        const allPubs = await base44.entities.Publicite.list('-created_date', 50);
        if (!isMounted) return;

        const filtered = (allPubs || []).filter(p => {
          if (!p?.active) return false;
          // Accueil or tous_pages
          if (p.placement !== 'accueil' && p.placement !== 'toutes_pages') return false;
          if (p.date_debut && new Date(p.date_debut) > now) return false;
          if (p.date_fin && new Date(p.date_fin) < now) return false;
          const targets = p.targets || ['all'];
          if (!targets.includes('all') && !targets.includes(userRole)) return false;
          return true;
        });

        if (filtered.length > 0) {
          const selected = filtered[Math.floor(Math.random() * filtered.length)];
          setPub(selected);
          trackView(selected.id);
        } else if (isMounted) {
          setPub(null);
        }
      } catch (err) {
        console.error('[Publicite] Error:', err);
        if (isMounted) setError(err.message);
      }
    };

    loadPublicite();
    const unsub = base44.entities.Publicite.subscribe(() => {
      if (isMounted) loadPublicite();
    });
    return () => { isMounted = false; unsub?.(); };
  }, [userRole]);

  const trackView = (pubId) => {
    base44.functions.invoke('trackPubliciteInteraction', {
      publicite_id: pubId,
      interaction_type: 'view',
      user_id: userId,
      user_email: userEmail,
      user_role: userRole,
    }).catch(() => {});
  };

  const trackClick = (pubId, pubUrl) => {
    base44.functions.invoke('trackPubliciteInteraction', {
      publicite_id: pubId,
      interaction_type: 'click',
      user_id: userId,
      user_email: userEmail,
      user_role: userRole,
    }).catch(() => {});

    if (pubUrl) window.open(pubUrl, '_blank');
  };

  if (error || dismissed || !pub || !pub?.image_url) return null;

  return (
    <PubliciteTracker publiciteId={pub.id} userRole={userRole}>
      <div className="relative w-full rounded-2xl overflow-hidden bg-gray-100 shadow-md">
        {/* Container avec aspect ratio 4/3 */}
        <div className="relative" style={{ aspectRatio: '4/3' }}>
          <img
            src={pub.image_url}
            alt={pub.titre || 'Publicité'}
            className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => trackClick(pub.id, pub.lien_url)}
            loading="lazy"
          />
          
          {/* Overlay gradient pour lisibilité texte */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
          
          {/* Titre texte sur image */}
          {pub.titre && (
            <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
              <p className="font-bold text-base line-clamp-2">{pub.titre}</p>
              {pub.lien_url && (
                <p className="text-xs text-white/80 mt-1">Cliquez pour en savoir plus →</p>
              )}
            </div>
          )}
          
          {/* Bouton fermer */}
          <button
            onClick={() => setDismissed(true)}
            className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white rounded-full w-8 h-8 flex items-center justify-center text-lg leading-none transition-colors z-10"
            title="Fermer"
          >
            ×
          </button>
        </div>
      </div>
    </PubliciteTracker>
  );
}