import { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ImageLightbox({ images = [], initialIndex = 0, onClose }) {
  const [current, setCurrent] = useState(initialIndex);
  const validImages = images.filter(Boolean);
  
  if (!validImages.length) return null;

  const goNext = () => setCurrent((current + 1) % validImages.length);
  const goPrev = () => setCurrent((current - 1 + validImages.length) % validImages.length);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [current]);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[9999] bg-black/95 flex flex-col items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        {/* Image principale */}
        <div className="relative w-full h-full flex items-center justify-center max-h-[90vh]">
          <motion.img
            src={validImages[current]}
            alt={`Photo ${current + 1}`}
            className="max-w-full max-h-full object-contain"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            onClick={e => e.stopPropagation()}
          />

          {/* Bouton fermer */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 bg-white/20 hover:bg-white/40 text-white rounded-full w-10 h-10 flex items-center justify-center transition-colors z-10"
          >
            <X className="h-6 w-6" />
          </button>

          {/* Navigation */}
          {validImages.length > 1 && (
            <>
              <button
                onClick={e => { e.stopPropagation(); goPrev(); }}
                className="absolute left-4 bg-white/20 hover:bg-white/40 text-white rounded-full w-10 h-10 flex items-center justify-center transition-colors z-10"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                onClick={e => { e.stopPropagation(); goNext(); }}
                className="absolute right-4 bg-white/20 hover:bg-white/40 text-white rounded-full w-10 h-10 flex items-center justify-center transition-colors z-10"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}
        </div>

        {/* Compteur + Dots */}
        <div className="absolute bottom-6 flex flex-col items-center gap-4">
          <p className="text-white/80 text-sm font-medium">
            {current + 1} / {validImages.length}
          </p>
          {validImages.length > 1 && (
            <div className="flex gap-2">
              {validImages.map((_, i) => (
                <button
                  key={i}
                  onClick={e => { e.stopPropagation(); setCurrent(i); }}
                  className={`rounded-full transition-all ${
                    i === current ? 'bg-white w-3 h-3' : 'bg-white/40 w-2 h-2'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}