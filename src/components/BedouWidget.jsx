import { useState, useEffect } from "react";
import { Wallet, TrendingUp, Lock, Plus, ArrowDownCircle, RefreshCw } from "lucide-react";
import { fmt } from "@/lib/formatMoney";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";

export default function BedouWidget({ user, compact = false }) {
  const [bedou, setBedou] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadBedou = async () => {
    if (!user?.email) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    const timeout = setTimeout(() => { setLoading(false); setError('timeout'); }, 8000);
    try {
      // Lire directement l'entité Bedou — bypass bedouEngine pour éviter le cache
      const list = await base44.entities.Bedou.filter({ user_email: user.email });
      clearTimeout(timeout);
      const b = list?.[0] || null;
      console.log('[BEDOU_DISPLAY_FINAL]', {
        client_email: user.email,
        bedou_id: b?.id || 'INTROUVABLE',
        solde_bdd: b?.solde ?? 'N/A',
        solde_disponible_bdd: b?.solde_disponible ?? 'N/A',
        solde_bonus_bdd: b?.solde_bonus ?? 'N/A',
        solde_affiche_dashboard: b?.solde ?? 0,
      });
      setBedou(b || { solde: 0, solde_disponible: 0, solde_bloque: 0, bonus: 0 });
    } catch (err) {
      clearTimeout(timeout);
      console.warn('[BedouWidget] Erreur:', err);
      setError(err?.message || 'error');
      setBedou({ solde: 0, solde_disponible: 0, solde_bloque: 0, bonus: 0 });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBedou();
    if (!user?.email) return;
    // Temps réel : recharger dès que le wallet change (validation admin)
    const unsub = base44.entities.Bedou.subscribe(ev => {
      if (ev.data?.user_email === user.email) {
        console.log('[BedouWidget] Bedou mis à jour en temps réel — rechargement');
        loadBedou();
      }
    });
    return unsub;
  }, [user?.email]);

  if (loading) {
    if (compact) return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 animate-pulse">
        <Wallet className="h-4 w-4 text-white/50" />
        <span className="text-sm text-white/50">Chargement…</span>
      </div>
    );
    return <div className="rounded-2xl bg-primary/10 animate-pulse h-24" />;
  }

  if (!user?.email) return null;

  const safeBedou = bedou || { solde: 0, solde_disponible: 0, solde_bonus: 0, solde_bloque: 0 };
  // Même calcul que MonBedou : total = disponible + bonus
  const soldeTotal = (safeBedou.solde_disponible || 0) + (safeBedou.solde_bonus || 0);
  const role = user?.active_profile_type || user?.current_role || user?.user_type;
  const canRetrait = ['livreur', 'partenaire', 'commercial'].includes(role);

  if (compact) {
    return (
      <Link to="/mon-bedou">
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white/15 border border-white/20">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-white" />
            <div>
              <p className="text-[10px] text-white/60">Solde Bedou</p>
              <p className="text-sm font-extrabold text-white">{fmt(soldeTotal)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-center">
              <p className="text-[10px] text-white/60">Disponible</p>
              <p className="text-xs font-bold text-emerald-300">{fmt(safeBedou.solde_disponible || 0)}</p>
            </div>
            {error && (
              <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); loadBedou(); }} className="opacity-60 hover:opacity-100">
                <RefreshCw className="h-3 w-3 text-white" />
              </button>
            )}
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link to="/mon-bedou">
      <div className="rounded-2xl bg-gradient-to-br from-[#0F2A5C] to-[#1E6BFF] p-5 text-white shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-white/20 flex items-center justify-center">
              <Wallet className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-white/70 font-medium">Mon Bedou</p>
              <p className="text-xs text-white/60">Portefeuille CDL</p>
            </div>
          </div>
          <span className="text-xs bg-white/20 px-2 py-1 rounded-full font-medium">Voir tout →</span>
        </div>

        <p className="text-3xl font-extrabold tracking-tight text-white">
          {fmt(soldeTotal)}
        </p>

        {error && (
          <p className="text-[10px] text-amber-300 mt-1">⚠️ Données estimées — appuyez pour rafraîchir</p>
        )}

        <div className="flex gap-4 mt-3">
          <div className="flex items-center gap-1">
            <TrendingUp className="h-3.5 w-3.5 text-green-300" />
            <span className="text-xs text-white/90 font-medium">Dispo : {fmt(safeBedou.solde_disponible || 0)}</span>
          </div>
          {(safeBedou.solde_bonus || 0) > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-amber-300 text-xs">🎁</span>
              <span className="text-xs text-white/90 font-medium">Bonus : {fmt(safeBedou.solde_bonus || 0)}</span>
            </div>
          )}
          {(safeBedou.solde_bloque || 0) > 0 && (
            <div className="flex items-center gap-1">
              <Lock className="h-3.5 w-3.5 text-amber-300" />
              <span className="text-xs text-white/90 font-medium">Bloqué : {fmt(safeBedou.solde_bloque || 0)}</span>
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-4">
          <div className="flex-1 flex items-center justify-center gap-1.5 bg-white text-primary rounded-xl py-2 font-bold text-sm shadow-sm">
            <Plus className="h-4 w-4" />
            <span>Recharger</span>
          </div>
          {canRetrait && (
            <div className="flex-1 flex items-center justify-center gap-1.5 bg-white/20 rounded-xl py-2 text-sm font-semibold">
              <ArrowDownCircle className="h-4 w-4" />
              <span>Retirer</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}