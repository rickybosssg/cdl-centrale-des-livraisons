/**
 * PhoneAuth — Redirige vers la page login Base44 DANS la WebView
 *
 * Grâce à capacitor.config.json → server.allowNavigation,
 * Capacitor laisse la WebView naviguer vers app.base44.com au lieu d'ouvrir Chrome.
 * Après login, Base44 redirige vers cdl.base44.app?access_token=xxx
 * → app-params.js lit le token → AuthContext détecte la session → app normale.
 */
import { useEffect } from "react";
import { appParams } from "@/lib/app-params";

const APP_ID = import.meta.env.VITE_BASE44_APP_ID || appParams.appId;
const NEXT_URL = 'https://cdl.base44.app';

export default function PhoneAuth() {
  useEffect(() => {
    const loginUrl = `https://app.base44.com/login?app_id=${APP_ID}&next=${encodeURIComponent(NEXT_URL)}`;
    console.log('[PhoneAuth] Navigation login dans WebView:', loginUrl);
    // window.location.replace reste dans la WebView (grâce à allowNavigation dans capacitor.config.json)
    window.location.replace(loginUrl);
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-6 bg-gradient-to-b from-primary to-blue-700">
      <img
        src="https://media.base44.com/images/public/69c3c74fc4b62396dca61751/1eb51398f_Screenshot_20260330_132434_WhatsApp.jpg"
        alt="CDL"
        className="h-20 w-20 rounded-2xl object-cover shadow-lg"
      />
      <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
      <p className="text-white/80 text-sm">Chargement de la connexion...</p>
    </div>
  );
}