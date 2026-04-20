/**
 * PhoneAuth — Login via @capacitor/browser + deep link de retour
 *
 * Flux :
 * 1. Ouvre app.base44.com/login dans une Custom Tab Android (compatible OAuth Google)
 * 2. Base44 redirige vers com.cdl.ouaga://login?access_token=xxx (deep link)
 * 3. @capacitor/app intercepte l'URL → on stocke le token → reload
 *
 * Le deep link com.cdl.ouaga:// doit être configuré dans AndroidManifest.xml
 * avec intent-filter pour scheme="com.cdl.ouaga"
 */
import { useEffect, useState } from "react";
import { appParams } from "@/lib/app-params";

const APP_ID = import.meta.env.VITE_BASE44_APP_ID || appParams.appId;
// Deep link de retour : Capacitor intercepte com.cdl.ouaga://
const NEXT_URL = 'com.cdl.ouaga://login';

function isNative() {
  return typeof window !== 'undefined' &&
    (window.location?.protocol === 'capacitor:' || typeof window.Capacitor !== 'undefined');
}

export default function PhoneAuth() {
  const [status, setStatus] = useState('opening');

  const loginUrl = `https://app.base44.com/login?app_id=${APP_ID}&next=${encodeURIComponent(NEXT_URL)}`;

  useEffect(() => {
    let appListener = null;
    let browserListener = null;

    const openLogin = async () => {
      if (isNative()) {
        try {
          const { Browser } = await import('@capacitor/browser');
          const { App } = await import('@capacitor/app');

          // Écouter le deep link de retour AVANT d'ouvrir le browser
          appListener = await App.addListener('appUrlOpen', (data) => {
            console.log('[PhoneAuth] appUrlOpen:', data.url);
            const url = new URL(data.url);
            const token = url.searchParams.get('access_token');
            if (token) {
              localStorage.setItem('base44_access_token', token);
              Browser.close().catch(() => {});
              window.location.reload();
            }
          });

          // Écouter aussi browserFinished (si l'utilisateur ferme manuellement)
          browserListener = await Browser.addListener('browserFinished', () => {
            // Vérifier si token déjà stocké
            if (localStorage.getItem('base44_access_token')) {
              window.location.reload();
            } else {
              setStatus('waiting');
            }
          });

          await Browser.open({ url: loginUrl });
          setStatus('waiting');
        } catch (err) {
          console.error('[PhoneAuth] error:', err);
          window.location.replace(loginUrl);
        }
      } else {
        window.location.replace(loginUrl);
      }
    };

    openLogin();

    return () => {
      appListener?.remove?.();
      browserListener?.remove?.();
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
      <p className="text-white/80 text-sm text-center px-8">
        {status === 'waiting'
          ? 'Connectez-vous dans la fenêtre qui vient de s\'ouvrir'
          : 'Ouverture de la connexion...'}
      </p>
      {status === 'waiting' && (
        <button
          onClick={() => window.location.reload()}
          className="mt-2 px-5 py-2 bg-white text-primary rounded-xl font-semibold text-sm"
        >
          ✅ J'ai terminé, recharger l'app
        </button>
      )}
    </div>
  );
}