import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import PubliciteTracker from './PubliciteTracker';

const ROLE_PLACEMENT = {
  client: 'dashboard_client',
  livreur: 'dashboard_livreur',
  partenaire: 'dashboard_partenaire',
  commercial: 'dashboard_commercial',
  admin: 'dashboard_admin',
};

export default function PubliciteDisplayGeneric({ userId, userEmail, userRole = 'client' }) {
  const [pub, setPub] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const placement = ROLE_PLACEMENT[userRole] || 'dashboard_client';

  useEffect(() => {
    const loadPublicite = async () => {
      try {
        const now = new Date();
        const allPubs = await base44.entities.Publicite.list('-created_date', 50);

        const filtered = (allPubs || []).filter(p => {
          if (!p.active) return false;
          if (p.placement !== placement) return false;
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
        } else {
          setPub(null);
        }
      } catch (err) {
        console.error('[Publicite] Error:', err);
      }
    };

    loadPublicite();
    
    // Écoute temps réel
    const unsub = base44.entities.Publicite.subscribe(() => loadPublicite());
    
    // Refresh automatique toutes les 30 secondes
    const intervalId = setInterval(loadPublicite, 30000);
    
    return () => {
      unsub?.();
      clearInterval(intervalId);
    };
  }, [userRole, placement, refreshTrigger]);

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
    }).catch((err) => console.error('[PubliciteDisplayGeneric] Click tracking error:', err));

    if (pubUrl) window.open(pubUrl, '_blank');
  };

  if (dismissed || !pub || !pub.image_url) return null;

  return (
    <PubliciteTracker publiciteId={pub.id} userRole={userRole}>
      <div className="relative w-full rounded-lg overflow-hidden bg-gray-100">
        <img
          src={pub.image_url}
          alt={pub.titre || 'Publicité'}
          className="w-full h-auto display-block cursor-pointer hover:opacity-95 transition-opacity"
          onClick={() => trackClick(pub.id, pub.lien_url)}
          loading="lazy"
        />
        
        <button
          onClick={() => setDismissed(true)}
          className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white rounded-full w-7 h-7 flex items-center justify-center text-lg leading-none transition-colors z-10"
          title="Fermer"
        >
          ×
        </button>
      </div>
    </PubliciteTracker>
  );
}