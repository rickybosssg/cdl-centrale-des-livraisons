import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

export default function PubliciteDisplayLivreur({ userId, userEmail, user, disponible, coursesToday }) {
  const [publicites, setPublicites] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [viewedPubIds, setViewedPubIds] = useState(new Set());
  const [dismissed, setDismissed] = useState(false);

  // Charger les pubs et filtrer
  useEffect(() => {
    const loadPublicites = async () => {
      try {
        // ÉTAPE 1: Charger TOUTES les pubs sans filtre
        const allPubs = await base44.entities.Publicite.list('-created_date', 50);
        console.log('🎯 [ÉTAPE 1] TOUTES les pubs:', allPubs?.length || 0);
        allPubs?.forEach((p, i) => {
          console.log(`  [${i}] "${p.titre}" | active=${p.active} | placement=${p.placement} | date_debut=${p.date_debut} | date_fin=${p.date_fin}`);
        });

        const now = new Date();

        // ÉTAPE 2: Filtrer par critères
        console.log('🎯 [ÉTAPE 2] Filtrage en cours...');
        const filtered = (allPubs || []).filter(pub => {
          // Filtre 1: Actif
          if (!pub.active) {
            console.log(`  ❌ "${pub.titre}" inactive`);
            return false;
          }
          
          // Filtre 2: Dates valides
          if (pub.date_debut && pub.date_fin) {
            const start = new Date(pub.date_debut);
            const end = new Date(pub.date_fin);
            if (now < start || now > end) {
              console.log(`  ❌ "${pub.titre}" hors_periode`);
              return false;
            }
          }
          
          // Filtre 3: Placement (accepter tous ou dashboard_livreur)
          const placement = pub.placement || '';
          const acceptedPlacements = ['toutes_pages', 'home_livreur', 'accueil_livreur', 'dashboard_livreur', ''];
          if (placement && !acceptedPlacements.includes(placement)) {
            console.log(`  ❌ "${pub.titre}" placement=${placement}`);
            return false;
          }
          
          console.log(`  ✅ "${pub.titre}" VALIDE`);
          return true;
        });

        // ÉTAPE 3: Sélectionner et afficher
        console.log(`✅ [ÉTAPE 3] Filtrées: ${filtered.length}`);
        if (filtered.length > 0) {
          const randomIdx = Math.floor(Math.random() * filtered.length);
          const selected = filtered[randomIdx];
          console.log(`🎲 Sélectionnée (${randomIdx}/${filtered.length}):`, selected.titre);
          setPublicites([selected]);
          setCurrentIndex(0);
          trackView(selected.id);
        } else {
          console.log(`⚠️ Zéro pub valide. Affichage TEST FALLBACK.`);
          const testPub = {
            id: 'TEST_' + Date.now(),
            titre: '🧪 PUBLICITÉ TEST',
            description: 'Système en cours de test. Créez une pub en admin.',
            image_url: 'https://images.unsplash.com/photo-1460925895917-adf4ee868993?w=400&h=200&fit=crop',
            lien_url: '#',
            active: true,
          };
          console.log(`🔧 FALLBACK TEST:`, testPub);
          setPublicites([testPub]);
        }

        setLoading(false);
      } catch (err) {
        console.error('❌ Erreur chargement publicités:', err);
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
  }, [disponible, coursesToday]);

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

  if (loading || dismissed) return null;
  if (!publicites || publicites.length === 0) {
    console.log('⚠️ [DEBUG] Aucune pub à afficher');
    return null;
  }

  const currentPub = publicites[currentIndex];
  const isCompact = coursesToday > 0; // Format compact si livreur actif

  console.log(`🖼️ [DEBUG] Affichage pub: "${currentPub?.titre}" (compact=${isCompact})`);

  return (
    <div className="w-full bg-white border-b border-primary/10 shadow-sm p-3 mt-0 z-40 block" style={{ display: 'block' }}>
      {/* DEBUG: afficher les infos en dev */}
      <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800 font-mono">
        🔍 DEBUG: {currentPub?.id} | cours_jour={coursesToday} | dispo={disponible}
      </div>
      <div className="max-w-6xl mx-auto">
        {/* Format compact (petit bandeau si actif) */}
        {isCompact ? (
          <div className="relative rounded-lg overflow-hidden bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 p-3">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => trackClick(currentPub.id, currentPub.lien_url)}>
              {currentPub.image_url && (
                <img
                  src={`${currentPub.image_url}${currentPub.image_url.includes('?') ? '&' : '?'}cache=${Date.now()}`}
                  alt={currentPub.titre}
                  className="h-14 w-14 rounded object-cover flex-shrink-0"
                  onError={(e) => console.error('❌ Erreur img compact:', e.target.src)}
                />
              )}
              <div className="flex-1">
                {currentPub.titre && <p className="text-sm font-bold text-primary">{currentPub.titre}</p>}
                {currentPub.description && <p className="text-xs text-muted-foreground line-clamp-1">{currentPub.description}</p>}
              </div>
              {currentPub.lien_url && (
                <span className="text-xs font-bold px-2 py-1 rounded bg-primary text-white flex-shrink-0 hover:bg-primary/80">Voir</span>
              )}
              <button onClick={() => setDismissed(true)} className="flex-shrink-0 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          // Format grand (bannière complète si inactif)
          <div className="relative rounded-lg overflow-hidden bg-gradient-to-r from-primary/5 to-accent/5 border border-primary/10 min-h-48">
            {currentPub.image_url && (
              <div className="relative h-40 overflow-hidden">
                <img
                  src={`${currentPub.image_url}${currentPub.image_url.includes('?') ? '&' : '?'}cache=${Date.now()}`}
                  alt={currentPub.titre}
                  className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => trackClick(currentPub.id, currentPub.lien_url)}
                  onError={(e) => console.error('❌ Erreur chargement image:', e.target.src)}
                  onLoad={() => console.log('✅ Image chargée:', currentPub.image_url)}
                />
                <div className="absolute inset-0 bg-gradient-to-r from-black/20 to-transparent" />
              </div>
            )}

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
            </div>

            <button
              onClick={() => setDismissed(true)}
              className="absolute top-2 right-2 z-20 p-1 bg-black/30 hover:bg-black/50 rounded-full transition-colors"
              title="Fermer"
            >
              <X className="h-4 w-4 text-white" />
            </button>

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
        )}
      </div>
    </div>
  );
}