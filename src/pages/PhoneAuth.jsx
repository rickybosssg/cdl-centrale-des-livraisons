import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

export default function PhoneAuth() {
  const [checking, setChecking] = useState(false);

  const proto = typeof window !== 'undefined' ? window.location?.protocol : '';
  const isNative = proto === 'capacitor:' || proto === 'file:' || typeof window !== 'undefined' && typeof window.Capacitor !== 'undefined';

  const [notConnected, setNotConnected] = useState(false);

  // Vérifie si déjà connecté (token récupéré après retour du navigateur)
  const checkAndRedirect = async () => {
    setChecking(true);
    setNotConnected(false);
    try {
      const authed = await base44.auth.isAuthenticated();
      if (authed) {
        window.location.href = '/';
        return;
      }
    } catch (_) {}
    setChecking(false);
    setNotConnected(true);
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
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={checkAndRedirect}
            disabled={checking}
            className="px-6 py-3 bg-white text-primary rounded-xl font-semibold text-sm shadow-lg active:scale-95 transition-transform"
          >
            {checking ? "Vérification..." : "✅ Je me suis connecté, continuer"}
          </button>
          {notConnected && (
            <div className="text-center space-y-2">
              <p className="text-white/90 text-sm font-semibold">⚠️ Session non détectée</p>
              <p className="text-white/70 text-xs px-4">Connectez-vous d'abord dans le navigateur, puis revenez sur l'app et appuyez à nouveau.</p>
              <button
                onClick={() => base44.auth.redirectToLogin('https://cdl.base44.app')}
                className="text-white/80 text-xs underline"
              >
                Ouvrir la page de connexion
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}