/**
 * FcmErrorBoundary — Capture les erreurs FCM sans jamais crasher l'app
 * 
 * Si FCM fail → affiche un banner visible mais laisse l'app fonctionner.
 */
import { useState, useEffect } from 'react';
import { AlertCircle, X } from 'lucide-react';

export default function FcmErrorBoundary() {
  const [error, setError] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Capturer les erreurs FCM globales
    const handleError = (event) => {
      const msg = event?.message || event?.toString();
      if (msg?.includes('[FCM]') || msg?.includes('firebase') || msg?.includes('notification')) {
        console.warn('[FCM] Error caught by boundary:', msg);
        // Ne montrer l'erreur que si elle est sévère
        if (msg.includes('❌') && !dismissed) {
          setError(msg);
          // Auto-hide après 8s
          const timer = setTimeout(() => setError(null), 8000);
          return () => clearTimeout(timer);
        }
      }
    };

    // Écouter les errors globales
    window.addEventListener('error', handleError, true);
    window.addEventListener('unhandledrejection', handleError, true);

    return () => {
      window.removeEventListener('error', handleError, true);
      window.removeEventListener('unhandledrejection', handleError, true);
    };
  }, [dismissed]);

  if (!error || dismissed) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 p-3 bg-red-50 border-b-2 border-red-300 shadow-md safe-top">
      <div className="max-w-lg mx-auto flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-red-700">Erreur notifications</p>
          <p className="text-[11px] text-red-600 mt-0.5 leading-tight break-words">{error.slice(0, 100)}</p>
          <p className="text-[10px] text-red-500 mt-1">L'app fonctionne normalement. Les notifications seront rétablies au prochain lancement.</p>
        </div>
        <button
          onClick={() => {
            setError(null);
            setDismissed(true);
          }}
          className="p-1 text-red-400 hover:text-red-600 flex-shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}