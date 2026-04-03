import { useState } from 'react';
import MediaGallery from './MediaGallery';
import { base44 } from '@/api/base44Client';

export default function PubliciteCard({ publicite, userRole = 'client', onClose }) {
  const [dismissed, setDismissed] = useState(false);

  if (!publicite || dismissed) return null;

  // Parser images
  let allImages = [];
  if (publicite.image_url) allImages.push(publicite.image_url);
  if (publicite.images) {
    try {
      const parsed = JSON.parse(publicite.images);
      if (Array.isArray(parsed)) allImages.push(...parsed);
    } catch {}
  }
  allImages = allImages.filter(Boolean);

  // Pas de média => ne pas afficher
  if (allImages.length === 0 && !publicite.video_url) return null;

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
    <div className="relative w-full rounded-2xl overflow-hidden shadow-lg bg-gray-100">
      {/* Média unifiée */}
      <MediaGallery
        images={allImages}
        videoUrl={publicite.video_url}
        videoTitle={publicite.video_title}
      />

      {/* Overlay texte + CTA */}
      {publicite.titre && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4 z-10">
          <p className="font-bold text-base text-white line-clamp-2">{publicite.titre}</p>
          {publicite.description && (
            <p className="text-xs text-white/80 mt-1 line-clamp-1">{publicite.description}</p>
          )}
          {publicite.lien_url && (
            <a
              href={publicite.lien_url}
              target="_blank"
              rel="noreferrer"
              onClick={() => trackClick(publicite.id, publicite.lien_url)}
              className="text-white/90 text-xs font-medium mt-2 inline-block underline hover:text-white transition-colors"
            >
              En savoir plus →
            </a>
          )}
        </div>
      )}

      {/* Bouton fermer */}
      {onClose && (
        <button
          onClick={() => { setDismissed(true); onClose?.(); }}
          className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white rounded-full w-8 h-8 flex items-center justify-center text-xl leading-none transition-colors z-20"
          title="Fermer"
        >
          ×
        </button>
      )}
    </div>
  );
}