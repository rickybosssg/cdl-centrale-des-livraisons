import { useState } from 'react';
import ImageLightbox from './ImageLightbox';
import VideoPlayer from './VideoPlayer';
import { ChevronLeft, ChevronRight, Play } from 'lucide-react';

export default function PartenaireMediaGallery({ 
  photoPrincipale, 
  galerie = [], 
  videos = [],
  videoPresentation 
}) {
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [showLightbox, setShowLightbox] = useState(false);

  // Parser galerie JSON si nécessaire
  let allImages = [];
  if (photoPrincipale) allImages.push(photoPrincipale);
  
  const galerieArray = Array.isArray(galerie) ? galerie : 
    (typeof galerie === 'string' ? (() => {
      try { return JSON.parse(galerie); } catch { return []; }
    })() : []);
  allImages.push(...galerieArray.filter(Boolean));

  // Parser vidéos
  const videosArray = Array.isArray(videos) ? videos :
    (typeof videos === 'string' ? (() => {
      try { return JSON.parse(videos); } catch { return []; }
    })() : []);

  if (allImages.length === 0 && !videoPresentation && videosArray.length === 0) {
    return (
      <div className="w-full h-48 rounded-2xl bg-muted flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Aucun média</p>
      </div>
    );
  }

  // Layout principal : photo + galerie + vidéo
  return (
    <div className="space-y-4">
      {/* Photo principale */}
      {allImages.length > 0 && (
        <div className="space-y-2">
          <div className="relative aspect-video rounded-2xl overflow-hidden bg-gray-200 cursor-pointer group"
            onClick={() => { setSelectedImageIndex(0); setShowLightbox(true); }}>
            <img 
              src={allImages[0]} 
              alt="Photo principale" 
              className="w-full h-full object-cover group-hover:scale-105 transition-transform" 
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
          </div>

          {/* Galerie miniatures */}
          {allImages.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {allImages.slice(1).map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => { setSelectedImageIndex(idx + 1); setShowLightbox(true); }}
                  className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-gray-200 hover:ring-2 ring-primary transition-all"
                >
                  <img 
                    src={img} 
                    alt={`Photo ${idx + 2}`} 
                    className="w-full h-full object-cover hover:scale-105 transition-transform" 
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Vidéo présentation */}
      {videoPresentation && (
        <div className="rounded-2xl overflow-hidden bg-gray-900">
          <VideoPlayer videoUrl={videoPresentation} title="Vidéo de présentation" />
        </div>
      )}

      {/* Autres vidéos */}
      {videosArray.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">Autres vidéos</p>
          <div className="grid grid-cols-2 gap-2">
            {videosArray.map((videoUrl, idx) => (
              <div key={idx} className="relative aspect-video rounded-lg overflow-hidden bg-gray-900">
                <VideoPlayer videoUrl={videoUrl} title={`Vidéo ${idx + 1}`} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lightbox */}
      {showLightbox && (
        <ImageLightbox 
          images={allImages} 
          initialIndex={selectedImageIndex}
          onClose={() => setShowLightbox(false)} 
        />
      )}
    </div>
  );
}