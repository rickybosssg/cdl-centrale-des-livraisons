import { useState, useEffect, useRef } from 'react';

/**
 * Affichage carrousel pour les publicités multi-images
 * - 1 image → affichage simple
 * - N images → slider swipeable avec dots
 */
export default function PubliciteCarouselDisplay({ images = [], titre, onImageClick, onClose }) {
  const [current, setCurrent] = useState(0);
  const touchStartX = useRef(null);
  const touchEndX = useRef(null);

  const validImages = images.filter(Boolean);
  if (validImages.length === 0) return null;

  const goTo = (idx) => setCurrent(Math.max(0, Math.min(idx, validImages.length - 1)));
  const prev = () => goTo(current - 1);
  const next = () => goTo(current + 1);

  const handleTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchMove = (e) => { touchEndX.current = e.touches[0].clientX; };
  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 40) {
      if (diff > 0) next(); else prev();
    }
    touchStartX.current = null;
    touchEndX.current = null;
  };

  const isSingle = validImages.length === 1;

  return (
    <div className="relative w-full rounded-2xl overflow-hidden bg-black">
      {/* Slide container */}
      <div
        className="relative"
        style={{ aspectRatio: '16/7' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={onImageClick}
      >
        {/* Images avec transition */}
        <div
          className="flex h-full transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${current * 100}%)`, width: `${validImages.length * 100}%` }}
        >
          {validImages.map((url, idx) => (
            <div key={idx} style={{ width: `${100 / validImages.length}%` }} className="h-full flex-shrink-0">
              <img
                src={url}
                alt={`${titre || 'Publicité'} ${idx + 1}`}
                className="w-full h-full object-cover cursor-pointer"
                loading={idx === 0 ? 'eager' : 'lazy'}
              />
            </div>
          ))}
        </div>

        {/* Overlay gradient bas */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent pointer-events-none" />

        {/* Fermer */}
        {onClose && (
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="absolute top-3 right-3 bg-black/40 hover:bg-black/60 text-white w-8 h-8 rounded-full flex items-center justify-center transition-colors z-10"
          >
            <span className="text-lg leading-none">×</span>
          </button>
        )}

        {/* Flèches navigation (desktop) */}
        {!isSingle && (
          <>
            {current > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); prev(); }}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white w-8 h-8 rounded-full flex items-center justify-center transition-colors z-10 hidden sm:flex"
              >
                ‹
              </button>
            )}
            {current < validImages.length - 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); next(); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white w-8 h-8 rounded-full flex items-center justify-center transition-colors z-10 hidden sm:flex"
              >
                ›
              </button>
            )}
          </>
        )}

        {/* Compteur image (discret) */}
        {!isSingle && (
          <div className="absolute top-3 left-3 bg-black/50 text-white text-xs font-medium px-2 py-0.5 rounded-full z-10">
            {current + 1}/{validImages.length}
          </div>
        )}
      </div>

      {/* Dots indicateurs */}
      {!isSingle && (
        <div className="flex justify-center gap-1.5 py-2 bg-black/80">
          {validImages.map((_, idx) => (
            <button
              key={idx}
              onClick={(e) => { e.stopPropagation(); goTo(idx); }}
              className={`rounded-full transition-all ${
                idx === current ? 'bg-white w-5 h-1.5' : 'bg-white/40 w-1.5 h-1.5'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}