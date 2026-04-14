import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function PubliciteCarousel({ images = [], titre = '', isVideo = false, videoUrl = '', onClose, onImageClick }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlay, setIsAutoPlay] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  // Validar images
  const validImages = Array.isArray(images) ? images.filter(img => img && typeof img === 'string') : [];
  const currentImage = validImages[currentIndex] || '';
  const hasMultiple = validImages.length > 1 && !isVideo;

  const next = () => setCurrentIndex((currentIndex + 1) % Math.max(validImages.length, 1));
  const prev = () => setCurrentIndex((currentIndex - 1 + Math.max(validImages.length, 1)) % Math.max(validImages.length, 1));

  // Optional: Auto-scroll lent (commenté par défaut)
  useEffect(() => {
    if (!isAutoPlay || !hasMultiple) return;
    const timer = setInterval(next, 6000);
    return () => clearInterval(timer);
  }, [currentIndex, isAutoPlay, hasMultiple]);

  if (validImages.length === 0) return null;

  return (
    <div className="relative w-full bg-black rounded-2xl overflow-hidden group">
      {/* Media (image ou vidéo) */}
      <div
        className="relative aspect-video bg-black cursor-pointer"
        onClick={isVideo ? null : onImageClick}
        onMouseEnter={() => hasMultiple && setIsAutoPlay(false)}
      >
        {isVideo && videoUrl ? (
          <video
            src={videoUrl}
            className="w-full h-full object-cover"
            autoPlay
            muted
            loop
            onCanPlayThrough={() => setVideoReady(true)}
            onLoadedMetadata={() => setVideoReady(true)}
          />
        ) : (
          <img
            src={currentImage}
            alt={titre || 'Publicité'}
            className="w-full h-full object-cover group-hover:opacity-95 transition-opacity"
            loading="lazy"
            onClick={onImageClick}
          />
        )}

        {/* Fermer discret */}
        {onClose && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="absolute top-3 right-3 bg-black/40 hover:bg-black/60 p-2 rounded-full transition-colors z-10"
            title="Fermer"
          >
            <span className="text-white text-lg leading-none">×</span>
          </button>
        )}
      </div>

      {/* Navigation multi-images */}
      {hasMultiple && (
        <>
          {/* Flèches */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/40 p-2 rounded-full opacity-0 group-hover:opacity-100 transition-all z-10"
          >
            <ChevronLeft className="h-5 w-5 text-white" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/40 p-2 rounded-full opacity-0 group-hover:opacity-100 transition-all z-10"
          >
            <ChevronRight className="h-5 w-5 text-white" />
          </button>

          {/* Dots */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
            {validImages.map((_, i) => (
              <button
                key={i}
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentIndex(i);
                }}
                className={`h-2 rounded-full transition-all ${
                  i === currentIndex ? 'bg-white w-6' : 'bg-white/50 w-2'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}