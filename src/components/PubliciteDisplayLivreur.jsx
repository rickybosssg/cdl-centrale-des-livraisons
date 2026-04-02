import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

export default function PubliciteDisplayLivreur({ userId, userEmail }) {
  const [publicites, setPublicites] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [viewedPubIds, setViewedPubIds] = useState(new Set());
  const [dismissed, setDismissed] = useState(false);

  // Charger les pubs et filtrer par rôle + dates
  useEffect(() => {
    const loadPublicites = async () => {
      try {
        const allPubs = await base44.entities.Publicite.list('-created_date', 50);
        const now = new Date();

        // Filtrer par : active + dates valides + placement approprié
        const filtered = (allPubs || []).filter(pub => {
          if (!pub.active) return false;

          // Vérifier les dates
          if (pub.date_debut && pub.date_fin) {
            const start = new Date(pub.date_debut);
            const end = new Date(pub.date_fin);
            if (now < start || now > end) return false;
          }

          // Filtrer par emplacement livreur
          const placement = pub.placement || '';
          
          // "global" visible par tous
          if (placement === 'toutes_pages') return true;
          
          // Placement spécifique livreur
          if (placement === 'home_livreur' || placement === 'accueil_livreur') return true;
          
          return false;
        });

        setPublicites(filtered);
        setLoading(false);

        // Tracker les vues pour chaque pub affichée
        filtered.forEach(pub => {
          trackView(pub.id);
        });
      } catch (err) {
        console.error('Erreur chargement publicités:', err);
        setLoading(false);
      }
    };

    loadPublicites();

    // Subscribe aux changements temps réel
    const unsub = base44.entities.Publicite.subscribe(event => {
      if (event.type === 'create' || event.type === 'update' || event.type === 'delete') {
        loadPublicites();
      }
    });

    return unsub;
  }, []);

  const trackView = async (pubId) => {
    if (viewedPubIds.has(pubId)) return;
    
    try {
      await base44.functions.invoke('trackPubliciteInteraction', {
        publicite_id: pubId,
        interaction_type: 'view',
        user_id: userId,
        user_email: userEmail,
        user_role: 'livreur',
      });
      setViewedPubIds(prev => new Set([...prev, pubId]));
    } catch (err) {
      console.error('Erreur tracking vue:', err);
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
      console.error('Erreur tracking clic:', err);
    }

    if (pubUrl) {
      window.open(pubUrl, '_blank');
    }
  };

  if (loading || publicites.length === 0 || dismissed) return null;

  const currentPub = publicites[currentIndex];

  return (
    <div className="w-full bg-white border-b border-primary/10 shadow-sm p-3">
      <div className="max-w-6xl mx-auto">
        {/* Bannière */}
        <div className="relative rounded-lg overflow-hidden bg-gradient-to-r from-primary/5 to-accent/5 border border-primary/10">
          {/* Image */}
          {currentPub.image_url && (
            <div className="relative h-40 overflow-hidden">
              <img
                src={currentPub.image_url}
                alt={currentPub.titre}
                className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => trackClick(currentPub.id, currentPub.lien_url)}
              />
              <div className="absolute inset-0 bg-gradient-to-r from-black/20 to-transparent" />
            </div>
          )}

          {/* Contenu overlay */}
          <div className="absolute inset-0 flex items-center justify-between p-4">
            <div className="flex-1 max-w-xs z-10">
              {currentPub.titre && (
                <h3 className="text-sm sm:text-base font-bold text-white drop-shadow-lg mb-1">
                  {currentPub.titre}
                </h3>
              )}
              {currentPub.description && (
                <p className="text-xs sm:text-sm text-white/90 drop-shadow-md line-clamp-2">
                  {currentPub.description}
                </p>
              )}
            </div>

            {/* Navigation */}
            <div className="flex items-center gap-1 absolute bottom-3 right-3 bg-black/40 rounded-full px-2 py-1">
              {publicites.length > 1 && (
                <>
                  <button
                    onClick={() => setCurrentIndex((i) => (i - 1 + publicites.length) % publicites.length)}
                    className="p-1 hover:bg-black/20 rounded-full transition-colors"
                    title="Précédent"
                  >
                    <ChevronLeft className="h-3 w-3 text-white" />
                  </button>
                  <span className="text-xs text-white px-1">
                    {currentIndex + 1}/{publicites.length}
                  </span>
                  <button
                    onClick={() => setCurrentIndex((i) => (i + 1) % publicites.length)}
                    className="p-1 hover:bg-black/20 rounded-full transition-colors"
                    title="Suivant"
                  >
                    <ChevronRight className="h-3 w-3 text-white" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Bouton fermer */}
          <button
            onClick={() => setDismissed(true)}
            className="absolute top-2 right-2 z-20 p-1 bg-black/30 hover:bg-black/50 rounded-full transition-colors"
            title="Fermer"
          >
            <X className="h-4 w-4 text-white" />
          </button>

          {/* CTA si URL */}
          {currentPub.lien_url && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
              <button
                onClick={() => trackClick(currentPub.id, currentPub.lien_url)}
                className="px-4 py-2 bg-white text-primary font-semibold rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all"
              >
                En savoir plus
              </button>
            </div>
          )}
        </div>

        {/* Indicateurs progression - dots */}
        {publicites.length > 1 && (
          <div className="flex justify-center gap-1 mt-2">
            {publicites.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentIndex(idx)}
                className={`h-1.5 rounded-full transition-all ${
                  idx === currentIndex ? 'bg-primary w-4' : 'bg-muted w-2'
                }`}
                title={`Pub ${idx + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}