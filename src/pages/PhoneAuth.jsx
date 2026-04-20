/**
 * PhoneAuth — Ouvre le login Base44 via @capacitor/browser (InAppBrowser natif)
 *
 * Sur Android natif : ouvre une Custom Tab compatible OAuth Google.
 * Après login, Base44 redirige vers cdl.base44.app?access_token=xxx
 * → on écoute l'événement browserFinished + on poll le token en localStorage.
 * Sur web : fallback window.location.replace classique.
 */
import { useEffect, useState } from "react";
import { appParams } from "@/lib/app-params";

const APP_ID = import.meta.env.VITE_BASE44_APP_ID || appParams.appId;
const NEXT_URL = 'https://cdl.base44.app';

function isNative() {
  return typeof window !== 'undefined' &&
    (window.location?.protocol === 'capacitor:' || typeof window.Capacitor !== 'undefined');
}

export default function PhoneAuth() {
  const [status, setStatus] = useState('opening'); // opening | waiting | error

  const loginUrl = `https://app.base44.com/login?app_id=${APP_ID}&next=${encodeURIComponent(NEXT_URL)}`;

  useEffect(() => {
    let pollInterval = null;

    const openLogin = async () => {
      if (isNative()) {
        try {
          const { Browser } = await import('@capacitor/browser');

          // Ouvrir le login dans une Custom Tab Android (compatible OAuth)
          await Browser.open({ url: loginUrl, windowName: '_self' });
          setStatus('waiting');

          // Écouter la fermeture du browser (retour app)
          Browser.addListener('browserFinished', () => {
            // Vérifier si le token est arrivé dans l'URL ou localStorage
            checkForToken();
          });

          // Poll toutes les 500ms pour détecter le token après redirection
          pollInterval = setInterval(checkForToken, 500);
        } catch (err) {
          console.error('[PhoneAuth] Browser error:', err);
          // Fallback : window.location
          window.location.replace(loginUrl);
        }
      } else {
        // Web : redirection classique
        window.location.replace(loginUrl);
      }
    };

    const checkForToken = () => {
      // Vérifier le token dans l'URL courante
      const params = new URLSearchParams(window.location.search);
      const token = params.get('access_token');
      if (token) {
        if (pollInterval) clearInterval(pollInterval);
        localStorage.setItem('base44_access_token', token);
        window.history.replaceState({}, '', '/');
        window.location.reload();
        return;
      }
      // Vérifier aussi le localStorage (cas où Base44 l'a déjà stocké)
      const stored = localStorage.getItem('base44_access_token');
      if (stored) {
        if (pollInterval) clearInterval(pollInterval);
        window.location.reload();
      }
    };

    openLogin();

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-6 bg-gradient-to-b from-primary to-blue-700">
      <img
        src="https://media.base44.com/images/public/69c3c74fc4b62396dca61751/1eb51398f_Screenshot_20260330_132434_WhatsApp.jpg"
        alt="CDL"
        className="h-20 w-20 rounded-2xl object-cover shadow-lg"
      />
      <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
      <p className="text-white/80 text-sm">
        {status === 'waiting' ? 'Retournez dans l\'app après connexion...' : 'Ouverture de la connexion...'}
      </p>
      {status === 'waiting' && (
        <button
          onClick={() => window.location.reload()}
          className="mt-2 px-5 py-2 bg-white text-primary rounded-xl font-semibold text-sm"
        >
          ✅ J'ai terminé ma connexion
        </button>
      )}
    </div>
  );
}