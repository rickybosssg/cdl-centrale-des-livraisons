import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Gift, ArrowRight } from "lucide-react";
import { toast } from "sonner";

/**
 * PromoCodeStep — Étape intermédiaire code promo pour les nouveaux utilisateurs
 * Affiché après inscription email/mdp, avant le choix de profil (RoleSetup)
 */
export default function PromoCodeStep({ onContinue }) {
  const [code, setCode] = useState(() => {
    // Auto-fill depuis URL param ou localStorage
    const params = new URLSearchParams(window.location.search);
    const urlCode = (params.get('ref') || params.get('promo') || '').toUpperCase().trim();
    return urlCode || (localStorage.getItem('cdl_promo_code') || '').toUpperCase();
  });
  const [checking, setChecking] = useState(false);
  const [applied, setApplied] = useState(null);

  const handleVerify = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setChecking(true);
    try {
      const codes = await base44.entities.CodePromo.filter({ code: trimmed, statut: "valide", actif: true });
      if (codes.length === 0) {
        toast.error("Code promo invalide ou non activé");
      } else {
        setApplied(codes[0]);
        localStorage.setItem('cdl_promo_code', trimmed);
        toast.success(`✅ Code ${trimmed} appliqué ! -15% sur votre 1ère course 🎉`);
      }
    } catch (_) {
      toast.error("Erreur lors de la vérification — réessayez");
    } finally {
      setChecking(false);
    }
  };

  const handleContinue = () => {
    if (applied) {
      localStorage.setItem('cdl_promo_code', applied.code);
    } else {
      localStorage.removeItem('cdl_promo_code');
    }
    onContinue();
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary to-blue-700">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8 space-y-6">

        {/* Icon + titre */}
        <div className="text-center space-y-2">
          <div className="h-16 w-16 rounded-2xl bg-green-100 flex items-center justify-center mx-auto">
            <Gift className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Avez-vous un code promo ?</h2>
          <p className="text-sm text-gray-500">Entrez un code parrainage ou commercial pour bénéficier d'une réduction sur votre 1ère course.</p>
        </div>

        {/* Champ code */}
        {applied ? (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 border-2 border-green-300">
            <span className="text-2xl">🎁</span>
            <div className="flex-1">
              <p className="font-bold text-green-700">{applied.code}</p>
              <p className="text-xs text-green-600">-15% sur votre 1ère course activé !</p>
            </div>
            <button
              onClick={() => { setApplied(null); setCode(""); localStorage.removeItem('cdl_promo_code'); }}
              className="text-xs text-red-500 underline"
            >
              Retirer
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Ex: ERIC2024"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && handleVerify()}
                className="flex-1 h-12 text-base font-mono uppercase"
              />
              <Button
                onClick={handleVerify}
                disabled={checking || !code.trim()}
                className="h-12 px-5"
              >
                {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : "OK"}
              </Button>
            </div>
            <p className="text-xs text-gray-400 text-center">Laissez vide si vous n'avez pas de code</p>
          </div>
        )}

        {/* Boutons */}
        <div className="space-y-3 pt-2">
          <Button
            className="w-full h-12 text-base font-semibold"
            onClick={handleContinue}
          >
            Continuer <ArrowRight className="h-4 w-4 ml-1" />
          </Button>

          {!applied && (
            <button
              onClick={handleContinue}
              className="w-full text-sm text-gray-400 py-2 hover:text-gray-600 transition-colors"
            >
              Continuer sans code →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}