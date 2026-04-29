/**
 * PubliciteCard — Carte publicitaire professionnelle
 * Design moderne : image bien cadrée, CTA visible, carrousel si multi-images
 */
import { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { ChevronLeft, ChevronRight, Play, ExternalLink } from 'lucide-react';

function AdCarouselImages({ images }) {
  const [idx, setIdx] = useState(0);
  const total = images.length;
  const prev = () => setIdx(i => (i - 1 + total) % total);
  const next = () => setIdx(i => (i + 1) % total);

  return (
    <div className="relative w-full aspect-[16/9] bg-gray-900 overflow-hidden rounded-t-2xl">
      <img
        src={images[idx]}
        alt={`Photo ${idx + 1}`}
        className="w-full h-full object-cover transition-opacity duration-300"
        loading="lazy"
      />
      {total > 1 && (
        <>
          <button onClick={prev}
            className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 z-10 active:scale-90 transition-transform">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={next}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 z-10 active:scale-90 transition-transform">
            <ChevronRight className="h-4 w-4" />
          </button>
          {/* Dots */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
            {images.map((_, i) => (
              <button key={i} onClick={() => setIdx(i)}
                className={`rounded-full transition-all ${i === idx ? 'bg-white w-4 h-1.5' : 'bg-white/50 w-1.5 h-1.5'}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function AdVideo({ videoUrl, videoTitle }) {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  const handlePlay = () => {
    if (videoRef.current) {
      videoRef.current.play();
      setPlaying(true);
    }
  };

  return (
    <div className="relative w-full aspect-[16/9] bg-gray-900 rounded-t-2xl overflow-hidden">
      <video
        ref={videoRef}
        src={videoUrl}
        className="w-full h-full object-cover"
        playsInline
        muted
        preload="metadata"
        onEnded={() => setPlaying(false)}
        controls={playing}
      />
      {!playing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40">
          <button
            onClick={handlePlay}
            className="h-14 w-14 rounded-full bg-white/90 flex items-center justify-center shadow-lg active:scale-90 transition-transform"
          >
            <Play className="h-6 w-6 text-gray-900 ml-0.5" />
          </button>
          {videoTitle && <p className="text-white text-xs font-semibold px-3 text-center">{videoTitle}</p>}
        </div>
      )}
    </div>
  );
}

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
  allImages = [...new Set(allImages.filter(Boolean))];

  const hasImages = allImages.length > 0;
  const hasVideo = !!publicite.video_url;

  if (!hasImages && !hasVideo) return null;

  const trackClick = () => {
    base44.functions.invoke('trackPubliciteInteraction', {
      publicite_id: publicite.id,
      interaction_type: 'click',
      user_role: userRole,
    }).catch(() => {});
    if (publicite.lien_url) window.open(publicite.lien_url, '_blank');
  };

  const ctaLabel = publicite.lien_url?.includes('wa.me') ? '💬 Contacter sur WhatsApp'
    : publicite.lien_url ? 'Voir l\'offre →'
    : null;

  return (
    <div className="relative w-full rounded-2xl overflow-hidden shadow-md bg-white border border-gray-100">
      {/* Badge "Publicité" */}
      <span className="absolute top-2 left-2 z-20 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-black/40 text-white/80 backdrop-blur-sm">
        Pub
      </span>

      {/* Bouton fermer */}
      {onClose && (
        <button
          onClick={() => { setDismissed(true); onClose?.(); }}
          className="absolute top-2 right-2 z-20 bg-black/40 hover:bg-black/60 text-white rounded-full w-7 h-7 flex items-center justify-center transition-colors"
        >
          ×
        </button>
      )}

      {/* Média */}
      {hasVideo
        ? <AdVideo videoUrl={publicite.video_url} videoTitle={publicite.video_title} />
        : <AdCarouselImages images={allImages} />
      }

      {/* Corps texte + CTA */}
      {(publicite.titre || publicite.description || publicite.lien_url) && (
        <div className="px-4 py-3 space-y-2">
          {publicite.titre && (
            <p className="font-bold text-sm text-gray-900 leading-snug line-clamp-2">{publicite.titre}</p>
          )}
          {publicite.description && (
            <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{publicite.description}</p>
          )}
          {publicite.lien_url && (
            <button
              onClick={trackClick}
              className="w-full py-2.5 rounded-xl bg-primary text-white text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-transform shadow-sm"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {ctaLabel || 'En savoir plus'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}