import { useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Shield } from "lucide-react";

/**
 * Route d'accès admin sécurisée : /admin-login-secure
 * Redirige vers le login plateforme Base44 (email / Google).
 * Jamais exposée aux utilisateurs normaux.
 */
export default function AdminLoginSecure() {
  useEffect(() => {
    // Rediriger vers la page login Base44 avec retour sur le dashboard admin
    setTimeout(() => {
      base44.auth.redirectToLogin("/admin-dashboard");
    }, 1500);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8 text-center">
        {/* Logo */}
        <div className="flex flex-col items-center gap-4">
          <div className="h-20 w-20 rounded-3xl bg-white/10 border border-white/20 flex items-center justify-center">
            <Shield className="h-10 w-10 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-white">Accès Administrateur</h1>
            <p className="text-sm text-white/60 mt-1">CDL — Portail sécurisé</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white/10 border border-white/20 rounded-2xl p-6 space-y-4">
          <p className="text-sm text-white/80 leading-relaxed">
            Cette route est réservée aux administrateurs CDL.
            Vous allez être redirigé vers la page de connexion sécurisée.
          </p>
          <div className="flex items-center justify-center gap-2 text-white/60 text-xs">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Redirection en cours...
          </div>
        </div>

        {/* Lien manuel si redirect lente */}
        <button
          onClick={() => base44.auth.redirectToLogin("/admin-dashboard")}
          className="text-xs text-white/50 underline hover:text-white/80 transition-colors"
        >
          Cliquer ici si la redirection ne démarre pas
        </button>
      </div>
    </div>
  );
}