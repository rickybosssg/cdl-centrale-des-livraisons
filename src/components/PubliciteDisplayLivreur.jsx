import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { X, ExternalLink } from 'lucide-react';

export default function PubliciteDisplayLivreur({ userId, userEmail }) {
  const [pub, setPub] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [clicked, setClicked] = useState(false);

  useEffect(() => {
    const loadPublicite = async () => {
      try {
        const now = new Date();
        const allPubs = await base44.entities.Publicite.list('-created_date', 50);

        if (!allPubs || allPubs.length === 0) {
          setPub(null);
          return;
        }

        // Filtrer: active + placement dashboard_livreur + dates valides
        const filtered = allPubs.filter(p => {
          if (!p.active) return false;
          if (p.placement !== 'dashboard_livreur') return false;
          if (p.date_debut && new Date(p.date_debut) > now) return false;
          if (p.date_fin && new Date(p.date_fin) < now) return false;
          return true;
        });

        if (filtered.length === 0) {
          setPub(null);
          return;
        }

        // Sélectionner aléatoire
        const selected = filtered[Math.floor(Math.random() * filtered.length)];
        setPub(selected);
        
        // Track view
        trackView(selected.id);
      } catch (err) {
        console.error('Error loading publicite:', err);
        setPub(null);
      }
    };

    loadPublicite();

    // Subscribe real-time updates
    const unsub = base44.entities.Publicite.subscribe(() => {
      loadPublicite();
    });

    return unsub;
  }, []);

  const trackView = async (pubId) => {
    try {
      await base44.functions.invoke('trackPubliciteInteraction', {
        publicite_id: pubId,
        interaction_type: 'view',
        user_id: userId,
        user_email: userEmail,
        user_role: 'livreur',
      });
    } catch (err) {
      console.error('Error tracking view:', err);
    }
  };

  const trackClick = async (pubId, pubUrl) => {
    try {
      await base44.functions.invoke('trackPubliciteInteraction', {
        publicite_id: pubId,
        interaction_type: 'click',
        user_id: userId,
        user_email: userEmail,
        user_role: 'livreur',
      });
    } catch (err) {
      console.error('Error tracking click:', err);
    }

    if (pubUrl) {
      window.open(pubUrl, '_blank');
    }
  };

  if (dismissed || !pub) return null;

  return (
    <div className="rounded-2xl overflow-hidden shadow-lg border border-primary/10 bg-white hover:shadow-xl transition-shadow">
      {/* Image */}
      <div className="relative h-40 bg-gradient-to-br from-primary/10 to-accent/10 overflow-hidden group">
        {pub.image_url && (
          <img
            src={pub.image_url}
            alt={pub.titre}
            className="w-full h-full object-cover cursor-pointer group-hover:scale-105 transition-transform duration-300"
            onClick={() => trackClick(pub.id, pub.lien_url)}
          />
        )}
        
        {/* Overlay sombre léger */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />

        {/* Bouton fermer */}
        <button
          onClick={() => setDismissed(true)}
          className="absolute top-3 right-3 bg-white/90 hover:bg-white text-gray-800 rounded-full p-1.5 shadow-md transition-all z-10"
          title="Fermer la publicité"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Contenu */}
      <div className="p-4 space-y-3">
        {pub.titre && (
          <h3 className="font-bold text-base text-foreground leading-tight">
            {pub.titre}
          </h3>
        )}

        {pub.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {pub.description}
          </p>
        )}

        {/* CTA Button */}
        {pub.lien_url && (
          <button
            onClick={() => trackClick(pub.id, pub.lien_url)}
            className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-primary to-blue-600 text-white font-semibold text-sm flex items-center justify-center gap-2 hover:shadow-md transition-all active:scale-95"
          >
            <span>Voir l'offre</span>
            <ExternalLink className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}