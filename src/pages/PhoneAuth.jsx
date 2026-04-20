/**
 * PhoneAuth — Page de connexion
 *
 * PROBLÈME FONDAMENTAL APK :
 * base44.auth.redirectToLogin() utilise une Chrome Custom Tab (navigateur externe).
 * Le token revient dans Chrome, pas dans la WebView → session jamais partagée.
 *
 * SOLUTION :
 * Dans l'APK, on charge la page de login Base44 DIRECTEMENT dans la WebView
 * via window.location.href (pas de Chrome Custom Tab).
 * Base44 redirige ensuite vers nextUrl?access_token=xxx → même WebView → token lu par app-params.js.
 */
import { useEffect, useState } from "react";
import { appParams } from "@/lib/app-params";

const APP_ID = import.meta.env.VITE_BASE44_APP_ID || appParams.appId;

function getLoginUrl() {
  const nextUrl = 'https://cdl.base44.app';
  return `https://app.base44.com/login?app_id=${APP_ID}&next=${encodeURIComponent(nextUrl)}`;
}

function isNativeAPK() {
  if (typeof window === 'undefined') return false;
  const proto = window.location?.protocol;
  return proto === 'capacitor:' || proto === 'file:' || typeof window.Capacitor !== 'undefined';
}

export default function PhoneAuth() {
  const [loginUrl] = useState(getLoginUrl);
  const native = isNativeAPK();

  useEffect(() => {
    // Dans la WebView native : rediriger DANS la WebView (pas Chrome Custom Tab)
    // Dans le web : même chose, window.location.href reste dans le même onglet
    console.log('[PhoneAuth] Redirection login dans WebView → ', loginUrl);
    window.location.href = loginUrl;
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary to-blue-700 flex flex-col items-center justify-center gap-6 px-6">
      <img
        src="https://media.base44.com/images/public/69c3c74fc4b62396dca61751/1eb51398f_Screenshot_20260330_132434_WhatsApp.jpg"
        alt="CDL"
        className="h-20 w-20 rounded-2xl object-cover shadow-lg"
      />
      <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
      <p className="text-white/80 text-sm text-center">
        Chargement de la connexion...
      </p>
      {/* Fallback si la redirection automatique échoue */}
      <a
        href={loginUrl}
        className="mt-2 px-6 py-3 bg-white text-primary rounded-xl font-semibold text-sm shadow-lg"
      >
        Se connecter
      </a>
    </div>
  );
}