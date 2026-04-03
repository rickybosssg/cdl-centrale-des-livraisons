import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import PubliciteCarouselDisplay from './PubliciteCarouselDisplay';
import PubliciteTracker from './PubliciteTracker';

export default function PubliciteHomeBanner({ userRole = 'client', userId, userEmail }) {
  const [pub, setPub] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Clé session pour persistance
  const SESSION_KEY = `pub_dismissed_${userRole}`;

  useEffect(() => {
    // Vérifier si déjà rejetée cette session
    const isDismissed = sessionStorage.getItem(SESSION_KEY) === 'true';
    if (isDismissed) {
      setDismissed(true);
      setLoading(false);
      return;
    }

    const loadPublicite = async () => {
      try {
        const now = new Date().toISOString();
        const allPubs = await base44.entities.Publicite.list('-created_date', 50);

        // Filtrer : actif, dates valides, profil adapté
        const filtered = (allPubs || []).filter(p => {
          if (!p.active) return false;
          if (p.date_debut && new Date(p.date_debut) > now) return false;
          if (p.date_fin && new Date(p.date_fin) < now) return false;

          // Filtre placement : accueil ou tous
          const matchPlace =
            p.placement === 'accueil' ||
            p.placement === 'toutes_pages' ||
            p.placement === 'tous';
          if (!matchPlace) return false;

          // Filtre profil : tous, vide, ou correspondant
          const targets = p.targets || ['all'];
          if (targets.includes('all')) return true;
          if (!targets.includes(userRole)) return false;

          return true;
        });

        if (filtered.length > 0) {
          const selected = filtered[Math.floor(Math.random() * filtered.length)];
          setPub(selected);
          trackView(selected.id);
        }
      } catch (err) {
        console.error('[PubliciteHomeBanner] Error:', err);
      } finally {
        setLoading(false);
      }
    };

    loadPublicite();
    
    // Écoute temps réel des changements de pubs
    const unsub = base44.entities.Publicite.subscribe(() => loadPublicite());
    
    // Refresh automatique toutes les 30 secondes
    const intervalId = setInterval(loadPublicite, 30000);
    
    return () => {
      unsub?.();
      clearInterval(intervalId);
    };
  }, [userRole, refreshTrigger]);

  const trackView = (pubId) => {
    base44.functions
      .invoke('trackPubliciteInteraction', {
        publicite_id: pubId,
        interaction_type: 'view',
        user_id: userId,
        user_email: userEmail,
        user_role: userRole,
      })
      .catch(() => {});
  };

  const trackClick = (pubId, pubUrl) => {
    base44.functions
      .invoke('trackPubliciteInteraction', {
        publicite_id: pubId,
        interaction_type: 'click',
        user_id: userId,
        user_email: userEmail,
        user_role: userRole,
      })
      .catch((err) => console.error('[PubliciteHomeBanner] Click tracking error:', err));

    if (pubUrl) window.open(pubUrl, '_blank');
  };

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem(SESSION_KEY, 'true');
  };

  if (loading || dismissed || !pub) return null;

  // Parser images : 'images' (JSON array), fallback sur 'image_url'
  let images = [];
  if (pub.images) {
    try {
      const parsed = JSON.parse(pub.images);
      images = Array.isArray(parsed) ? parsed : [pub.image_url];
    } catch {
      images = pub.image_url ? [pub.image_url] : [];
    }
  } else {
    images = pub.image_url ? [pub.image_url] : [];
  }

  if (images.length === 0) return null;

  return (
    <PubliciteTracker publiciteId={pub.id} userRole={userRole}>
      <div className="w-full">
        <PubliciteCarouselDisplay
          images={images}
          titre={pub.titre}
          onClose={handleDismiss}
          onImageClick={() => trackClick(pub.id, pub.lien_url)}
        />
      </div>
    </PubliciteTracker>
  );
}