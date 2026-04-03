import { useState } from 'react';
import ImageLightbox from './ImageLightbox';
import VideoPlayer from './VideoPlayer';
import { Play } from 'lucide-react';

export default function MediaGallery({ images = [], videoUrl, videoTitle }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const validImages = images.filter(Boolean);
  const hasImages = validImages.length > 0;
  const hasVideo = !!videoUrl;

  if (!hasImages && !hasVideo) return null;

  // Cas 1 : Vidéo seule
  if (hasVideo && !hasImages) {
    return (
      <>
        <VideoPlayer videoUrl={videoUrl} title={videoTitle} />
      </>
    );
  }

  // Cas 2 : 1 image seule
  if (validImages.length === 1 && !hasVideo) {
    return (
      <>
        <div
          className="relative w-full aspect-video bg-gray-900 rounded-xl overflow-hidden cursor-pointer group"
          onClick={() => { setLightboxIndex(0); setLightboxOpen(true); }}
        >
          <img
            src={validImages[0]}
            alt="Image"
            className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
          />
          <div className="absolute inset-0 bg-black/40 group-hover:bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <p className="text-white text-xs font-semibold">Cliquer pour agrandir</p>
          </div>
        </div>
        <ImageLightbox images={validImages} initialIndex={lightboxIndex} onClose={() => setLightboxOpen(false)} />
      </>
    );
  }

  // Cas 3 : Plusieurs images (avec ou sans vidéo)
  return (
    <>
      <div className="space-y-3">
        {/* Vidéo en haut si présente */}
        {hasVideo && (
          <VideoPlayer videoUrl={videoUrl} title={videoTitle} />
        )}

        {/* Grille d'images */}
        <div className={`grid gap-2 ${validImages.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {validImages.map((img, idx) => (
            <div
              key={idx}
              className="relative aspect-square bg-gray-900 rounded-lg overflow-hidden cursor-pointer group"
              onClick={() => { setLightboxIndex(idx); setLightboxOpen(true); }}
            >
              <img
                src={img}
                alt={`Photo ${idx + 1}`}
                className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
              />
              <div className="absolute inset-0 bg-black/40 group-hover:bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="text-white text-xs font-bold">{idx + 1}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Indicateur si > 3 images */}
        {validImages.length > 3 && (
          <p className="text-xs text-muted-foreground text-center">
            +{validImages.length - 3} photo(s)
          </p>
        )}
      </div>

      {/* Lightbox */}
      {lightboxOpen && (
        <ImageLightbox images={validImages} initialIndex={lightboxIndex} onClose={() => setLightboxOpen(false)} />
      )}
    </>
  );
}