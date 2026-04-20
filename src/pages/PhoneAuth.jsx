import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

export default function PhoneAuth() {
  const [checking, setChecking] = useState(false);

  const proto = typeof window !== 'undefined' ? window.location?.protocol : '';
  const isNative = proto === 'capacitor:' || proto === 'file:' || typeof window !== 'undefined' && typeof window.Capacitor !== 'undefined';

  // Vérifie si déjà connecté (token récupéré après retour du navigateur)
  const checkAndRedirect = async () => {
    setChecking(true);
    try {
      const authed = await base44.auth.isAuthenticated();
      if (authed) {
        // Connecté ! Recharger l'app
        window.location.href = '/';
        return;
      }
    } catch (_) {}
    setChecking(false);
    // Pas encore connecté → rediriger vers login
    base44.auth.redirectToLogin('https://cdl.base44.app');
  };

  useEffect(() => {
    if (!isNative) {
      // Web : rediriger directement
      base44.auth.redirectToLogin('https://cdl.base44.app');
      return;
    }

    // Lancer la redirection vers le login
    base44.auth.redirectToLogin('https://cdl.base44.app');
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
        Connexion en cours...<br/>
        <span className="text-white/60 text-xs">Revenez sur l'app après vous être connecté</span>
      </p>
      {isNative && (
        <button
          onClick={checkAndRedirect}
          disabled={checking}
          className="mt-4 px-6 py-3 bg-white text-primary rounded-xl font-semibold text-sm shadow-lg active:scale-95 transition-transform"
        >
          {checking ? "Vérification..." : "✅ Je me suis connecté, continuer"}
        </button>
      )}
    </div>
  );
}