/**
 * PhoneAuth — Affiche la page login Base44 dans un iframe DANS la WebView
 *
 * On utilise un iframe plein écran pour éviter qu'Android ouvre un navigateur externe.
 * Un listener postMessage surveille le retour du token depuis app.base44.com.
 * Quand le token arrive, on le stocke et on recharge l'app.
 */
import { useEffect, useState } from "react";
import { appParams } from "@/lib/app-params";

const APP_ID = import.meta.env.VITE_BASE44_APP_ID || appParams.appId;
const NEXT_URL = 'https://cdl.base44.app';

export default function PhoneAuth() {
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const loginUrl = `https://app.base44.com/login?app_id=${APP_ID}&next=${encodeURIComponent(NEXT_URL)}&embed=1`;

  useEffect(() => {
    // Écouter le message postMessage envoyé par Base44 après login
    const onMessage = (event) => {
      if (!event.origin.includes('base44')) return;
      const data = event.data;
      if (data?.access_token) {
        console.log('[PhoneAuth] Token reçu via postMessage');
        localStorage.setItem('base44_access_token', data.access_token);
        window.location.reload();
      }
    };

    // Surveiller aussi les changements d'URL dans l'iframe (redirect avec token)
    const checkInterval = setInterval(() => {
      try {
        const params = new URLSearchParams(window.location.search);
        const token = params.get('access_token');
        if (token) {
          clearInterval(checkInterval);
          localStorage.setItem('base44_access_token', token);
          window.history.replaceState({}, '', '/');
          window.location.reload();
        }
      } catch (_) {}
    }, 500);

    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      clearInterval(checkInterval);
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-primary to-blue-700 flex flex-col">
      {/* Header CDL */}
      <div className="flex items-center justify-center gap-3 py-4 flex-shrink-0">
        <img
          src="https://media.base44.com/images/public/69c3c74fc4b62396dca61751/1eb51398f_Screenshot_20260330_132434_WhatsApp.jpg"
          alt="CDL"
          className="h-10 w-10 rounded-xl object-cover shadow-lg"
        />
        <span className="text-white font-bold text-lg">CDL Ouaga</span>
      </div>

      {/* Iframe plein écran — charge login Base44 dans la WebView */}
      <div className="flex-1 relative rounded-t-3xl overflow-hidden bg-white">
        {!iframeLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
            <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        )}
        <iframe
          src={loginUrl}
          className="w-full h-full border-0"
          onLoad={() => setIframeLoaded(true)}
          allow="*"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation"
          title="Connexion CDL"
        />
      </div>
    </div>
  );
}