import { useState } from 'react';
import { Play, AlertCircle, Loader } from 'lucide-react';

export default function VideoPlayer({ videoUrl, title, thumbnail }) {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  if (!videoUrl) return null;

  const isValidUrl = videoUrl && (videoUrl.startsWith('http') || videoUrl.startsWith('blob:'));
  
  if (!isValidUrl) {
    return (
      <div className="relative w-full aspect-video bg-gray-900 rounded-xl overflow-hidden flex items-center justify-center">
        <div className="text-center text-white space-y-2">
          <AlertCircle className="h-8 w-8 mx-auto text-red-500" />
          <p className="text-sm">Vidéo indisponible</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden group">
      {playing ? (
        // Lecteur vidéo
        <>
          <video
            src={videoUrl}
            className="w-full h-full"
            controls
            autoPlay
            onLoadStart={() => setLoading(true)}
            onCanPlay={() => { setLoading(false); setError(null); }}
            onError={() => { setLoading(false); setError('Erreur chargement vidéo'); }}
          />
          {loading && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <Loader className="h-8 w-8 text-white animate-spin" />
            </div>
          )}
          {error && (
            <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
              <div className="text-center text-white space-y-2">
                <AlertCircle className="h-8 w-8 mx-auto" />
                <p className="text-sm">{error}</p>
              </div>
            </div>
          )}
        </>
      ) : (
        // Miniature + bouton play
        <div
          className="w-full h-full cursor-pointer relative"
          onClick={() => setPlaying(true)}
        >
          {thumbnail ? (
            <img src={thumbnail} alt={title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-slate-700 to-slate-900" />
          )}
          
          {/* Overlay sombre au hover */}
          <div className="absolute inset-0 bg-black/40 group-hover:bg-black/50 transition-colors" />
          
          {/* Bouton play */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-white/30 group-hover:bg-white/50 backdrop-blur flex items-center justify-center transition-all">
              <Play className="h-8 w-8 text-white fill-white" />
            </div>
          </div>

          {/* Durée / Label */}
          {title && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
              <p className="text-white text-sm font-semibold line-clamp-2">{title}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}