import { useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { appParams } from "@/lib/app-params";

export default function PhoneAuth() {
  useEffect(() => {
    // En APK natif, window.location.origin = "null" ou "capacitor://localhost"
    // On utilise appBaseUrl (l'URL publique de l'app) comme nextUrl
    const proto = window.location?.protocol;
    const isNative = proto === 'capacitor:' || proto === 'file:' || typeof window.Capacitor !== 'undefined';
    const nextUrl = isNative
      ? (appParams.appBaseUrl || 'https://app.base44.com')
      : window.location.origin + '/';
    base44.auth.redirectToLogin(nextUrl);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary to-blue-700 flex flex-col items-center justify-center">
      <img
        src="https://media.base44.com/images/public/69c3c74fc4b62396dca61751/1eb51398f_Screenshot_20260330_132434_WhatsApp.jpg"
        alt="CDL"
        className="h-20 w-20 rounded-2xl object-cover shadow-lg mb-6"
      />
      <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
      <p className="text-white/80 text-sm mt-4">Redirection vers la connexion...</p>
    </div>
  );
}