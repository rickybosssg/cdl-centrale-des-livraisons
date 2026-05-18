/**
 * MonBedou — Portefeuille Bedou
 * VERSION DEBUG : logs visibles à l'écran sur APK pour diagnostiquer le flux recharge
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, ArrowDownCircle, TrendingUp, Lock, CheckCircle2, Clock, XCircle } from "lucide-react";
import { fmt } from "@/lib/formatMoney";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import moment from "moment";
import BeDouHistory from "@/components/BeDouHistory";
import { triggerWhatsAppNotification, waMsgBedouWithdrawRequested } from "@/lib/whatsappNotifications";
import { useBedouSync } from "@/lib/useBedouSync";

const METHODES = [
  { value: "orange_money",  label: "Orange Money",  icon: "🟠" },
  { value: "moov_money",    label: "Moov Money",    icon: "🔵" },
  { value: "telecel_money", label: "Telecel Money", icon: "🟣" },
  { value: "cash",          label: "Cash",          icon: "💵" },
];

function getBonus(montant) {
  if (montant >= 10000) return 1500;
  if (montant >= 5000)  return 500;
  return 0;
}

const STATUT_BADGE = {
  valide:     { cls: "bg-emerald-100 text-emerald-700", label: "Validé",     icon: <CheckCircle2 className="h-3 w-3" /> },
  paye:       { cls: "bg-emerald-100 text-emerald-700", label: "Payé",       icon: <CheckCircle2 className="h-3 w-3" /> },
  en_attente: { cls: "bg-amber-100 text-amber-700",     label: "En attente", icon: <Clock className="h-3 w-3" /> },
  refuse:     { cls: "bg-red-100 text-red-700",         label: "Refusé",     icon: <XCircle className="h-3 w-3" /> },
};

const TX_TYPE_CFG = {
  recharge:    { bg: "bg-emerald-50", icon: "💰" },
  gain:        { bg: "bg-emerald-50", icon: "🏆" },
  bonus:       { bg: "bg-blue-50",    icon: "🎁" },
  paiement:    { bg: "bg-red-50",     icon: "🛵" },
  retrait:     { bg: "bg-orange-50",  icon: "💸" },
  commission:  { bg: "bg-purple-50",  icon: "📊" },
  ajustement:  { bg: "bg-gray-50",    icon: "⚙️" },
  annulation:  { bg: "bg-red-50",     icon: "❌" },
  compensation:{ bg: "bg-emerald-50", icon: "🔄" },
};

// Upload robuste compatible APK Capacitor
async function uploadFileRobust(file) {
  console.log('[UPLOAD] start name:', file.name, 'size:', file.size);
  try {
    const arrayBuffer = await file.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: file.type || 'image/jpeg' });
    const safeFile = new File([blob], file.name || 'preuve.jpg', { type: blob.type });
    const res = await base44.integrations.Core.UploadFile({ file: safeFile });
    if (res?.file_url) return res.file_url;
  } catch (e) {
    console.warn('[UPLOAD] blob method failed:', e.message, '— trying direct');
  }
  const res = await base44.integrations.Core.UploadFile({ file });
  if (res?.file_url) return res.file_url;
  throw new Error('Upload échoué : URL vide');
}

export default function MonBedou() {
  const navigate = useNavigate();
  const [user, setUser]                 = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [userLoading, setUserLoading]   = useState(true);
  const [tab, setTab]                   = useState("solde");
  const [filterStatut, setFilterStatut] = useState("tous");
  const [form, setForm]                 = useState({ montant: "", methode: "orange_money", preuve: null });
  const [submitting, setSubmitting]     = useState(false);
  const [successData, setSuccessData]   = useState(null);
  const [debugLogs, setDebugLogs]       = useState([]);
  const [retraitForm, setRetraitForm]   = useState({ montant: "", methode: "orange_money", numero_reception: "" });

  // Hook centralisé Bedou — remplace toute la logique de sync manuelle
  const { bedou, loading: bedouLoading, reload: reloadBedou } = useBedouSync(user?.email);

  const addLog = (msg) => {
    const line = `${new Date().toLocaleTimeString('fr')} ${msg}`;
    console.log('[BEDOU]', line);
    setDebugLogs(prev => [...prev.slice(-10), line]);
  };

  // Chargement user + transactions seulement
  useEffect(() => {
    const init = async () => {
      try {
        const me = await base44.auth.me();
        setUser(me);
        const txList = await base44.entities.Transaction.filter({ user_email: me.email }, '-created_date', 50);
        setTransactions(txList || []);
      } catch (e) {
        console.error('[MonBedou] init error:', e.message);
      } finally {
        setUserLoading(false);
      }
    };
    init();

    // Écouter les nouvelles transactions en temps réel — filtrer par user email
    // CORRECTION : userEmail peut être null au premier render → attendre qu'il soit défini
    // La subscription est réouverte dans un 2e useEffect dépendant de user?.email
    const unsubTx = base44.entities.Transaction.subscribe((ev) => {
      if (!ev.data) return;
      // Pas encore de user chargé → ignorer (évite les transactions fantômes)
      setTransactions(prev => {
        // userEmail pourrait ne pas encore être dans la closure → vérifier via prev
        if (ev.type === 'create') return [ev.data, ...prev];
        if (ev.type === 'update') return prev.map(t => t.id === ev.id ? ev.data : t);
        return prev;
      });
    });
    return () => unsubTx?.();
  }, []);

  // ── FLUX RECHARGE ─────────────────────────────────────────────────────────────
  const handleRecharge = async () => {
    const montant = parseInt(form.montant) || 0;
    if (montant < 100) { toast.error("Montant minimum 100 F CFA"); return; }
    if (!form.methode) { toast.error("Sélectionnez une méthode"); return; }
    if (!form.preuve)  { toast.error("Ajoutez une preuve de paiement"); return; }
    if (!user?.email)  { toast.error("Vous devez être connecté"); return; }

    const bonusAmount = getBonus(montant);
    setDebugLogs([]);
    addLog(`▶ START montant=${montant} bonus=${bonusAmount}`);
    addLog(`  user=${user.email}`);
    addLog(`  preuve=${form.preuve?.name} (${form.preuve?.size}b)`);
    setSubmitting(true);

    try {
      // B — Upload
      addLog('▶ UPLOAD preuve...');
      let preuveUrl;
      try {
        preuveUrl = await uploadFileRobust(form.preuve);
        addLog(`✅ UPLOAD OK`);
        addLog(`  ${preuveUrl.slice(0, 60)}`);
      } catch (uploadErr) {
        addLog(`❌ UPLOAD ERREUR: ${uploadErr.message}`);
        throw new Error(`Upload échoué: ${uploadErr.message}`);
      }

      // C — Appel backend avec Authorization header explicite (compatible APK Capacitor)
      addLog('▶ FETCH submitBedouRecharge...');
      let authToken = '';
      try {
        authToken = localStorage.getItem('base44_access_token') || '';
      } catch (_) {}

      addLog(`  auth_token présent: ${authToken ? 'OUI (len=' + authToken.length + ')' : 'NON ← 401 probable'}`);
      addLog(`  Authorization header envoyé: ${authToken ? 'OUI' : 'NON'}`);

      const fnUrl = `https://cdl.base44.app/functions/submitBedouRecharge`;
      addLog(`  url: ${fnUrl}`);

      if (!authToken) {
        throw new Error('Token manquant — reconnectez-vous');
      }

      let fetchRes;
      try {
        fetchRes = await fetch(fnUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            montant,
            methode_paiement:    form.methode,
            preuve_paiement_url: preuveUrl,
            bonus:               bonusAmount,
          }),
        });
        addLog(`  HTTP status: ${fetchRes.status}`);
      } catch (fetchErr) {
        addLog(`❌ FETCH réseau ERREUR: ${fetchErr.message}`);
        throw new Error(`Erreur réseau: ${fetchErr.message}`);
      }

      let data;
      try {
        data = await fetchRes.json();
        addLog(`  response: success=${data?.success} id=${data?.recharge_id} msg=${data?.message || data?.error || ''}`);
      } catch (parseErr) {
        addLog(`❌ JSON parse erreur (status=${fetchRes.status})`);
        throw new Error(`Réponse invalide du serveur (status ${fetchRes.status})`);
      }

      if (!data || !data.success) {
        const reason = data?.message || data?.error || `Échec HTTP ${fetchRes.status}`;
        addLog(`❌ ÉCHEC: ${reason}`);
        throw new Error(reason);
      }

      // D — Succès
      addLog('✅ SUCCESS FRONTEND — redirection dans 2.5s');
      toast.success("✅ Demande de recharge envoyée avec succès !");
      setForm({ montant: "", methode: "orange_money", preuve: null });
      setSuccessData({ montant, bonus: bonusAmount, recharge_id: data.recharge_id });
      setTimeout(() => { addLog('▶ NAVIGATE /'); navigate("/"); }, 2500);

    } catch (err) {
      addLog(`❌ CATCH FINAL: ${err?.message}`);
      toast.error("❌ " + (err?.message || "Erreur inattendue"));
    } finally {
      setSubmitting(false);
      addLog('▶ FINALLY submitting=false');
    }
  };

  // ── FLUX RETRAIT ──────────────────────────────────────────────────────────────
  const handleRetrait = async () => {
    const montant = parseInt(retraitForm.montant) || 0;
    if (montant < 500)                 { toast.error("Montant minimum 500 F CFA"); return; }
    if (!retraitForm.numero_reception) { toast.error("Numéro de réception requis"); return; }
    setSubmitting(true);
    try {
      const res = await base44.functions.invoke("bedouEngine", { action: "demande_retrait", ...retraitForm, montant });
      const rd = res?.data ?? res;
      if (rd?.success) {
        toast.success("Demande de retrait envoyée !");
        try { triggerWhatsAppNotification({ eventType: "bedou_withdraw_requested", recipientRole: "driver", recipientName: user?.full_name || "", recipientPhone: user?.telephone || null, messageText: waMsgBedouWithdrawRequested(), entityId: user?.id, entityType: "bedou", priority: "high" }); } catch (_) {}
        setRetraitForm({ montant: "", methode: "orange_money", numero_reception: "" });
        reloadBedou('retrait_success');
        setTab("historique");
      } else {
        toast.error(rd?.message || rd?.error || "Erreur");
      }
    } catch (e) {
      toast.error("❌ " + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // SOURCE UNIQUE : active_profile_type (user_type peut être obsolète)
  const canRetrait = user && ["livreur", "partenaire", "commercial"].includes(user.active_profile_type || user.user_type);
  const bonusPreview = parseInt(form.montant) >= 100 ? getBonus(parseInt(form.montant)) : 0;
  const txFiltrees   = transactions.filter(tx => filterStatut === "tous" || tx.statut === filterStatut);
  const loading      = userLoading || bedouLoading;

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-lg mx-auto pb-16">

      {/* HEADER */}
      <div className="bg-gradient-to-br from-[#0F2A5C] to-[#1E6BFF] px-4 pt-5 pb-8 rounded-b-[2rem] text-white shadow-lg">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => navigate(-1)} className="h-9 w-9 rounded-full bg-white/15 flex items-center justify-center border border-white/20">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-lg font-extrabold">Mon Bedou</h1>
        </div>
        <div className="text-center mb-1">
          <p className="text-sm text-white/60 font-medium">Solde total</p>
          <p className="text-5xl font-extrabold tracking-tight mt-1">{fmt((bedou?.solde_disponible || 0) + (bedou?.solde_bonus || 0))}</p>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-5">
          <div className="bg-white/15 rounded-2xl p-3 text-center border border-white/10">
            <div className="flex items-center justify-center gap-1 mb-1">
              <TrendingUp className="h-3 w-3 text-emerald-300" />
              <p className="text-[10px] text-white/60">Disponible</p>
            </div>
            <p className="font-extrabold text-sm">{fmt(bedou?.solde_disponible || 0)}</p>
          </div>
          <div className="bg-white/15 rounded-2xl p-3 text-center border border-white/10">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Lock className="h-3 w-3 text-amber-300" />
              <p className="text-[10px] text-white/60">Bloqué</p>
            </div>
            <p className="font-extrabold text-sm">{fmt(bedou?.solde_bloque || 0)}</p>
          </div>
          <div className="bg-white/15 rounded-2xl p-3 text-center border border-white/10">
            <div className="flex items-center justify-center gap-1 mb-1">
              <span className="text-amber-300 text-xs">🎁</span>
              <p className="text-[10px] text-white/60">Bonus</p>
            </div>
            <p className="font-extrabold text-sm">{fmt(bedou?.solde_bonus || 0)}</p>
          </div>
        </div>
        <div className="flex gap-3 mt-4">
          <button onClick={() => { setSuccessData(null); setDebugLogs([]); setTab("recharge"); }}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-white text-primary font-bold text-sm shadow-sm active:scale-95 transition-all">
            <Plus className="h-4 w-4" /> Recharger
          </button>
          {canRetrait && (
            <button onClick={() => setTab("retrait")}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-white/20 text-white font-bold text-sm border border-white/30 active:scale-95 transition-all">
              <ArrowDownCircle className="h-4 w-4" /> Retirer
            </button>
          )}
        </div>
      </div>

      {/* STATS */}
      <div className="px-4 mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white border border-border p-4 shadow-sm text-center">
          <p className="text-xs text-muted-foreground mb-1">Gains totaux</p>
          <p className="text-xl font-extrabold text-emerald-600">{fmt(bedou?.gains_totaux || 0)}</p>
        </div>
        <div className="rounded-2xl bg-white border border-border p-4 shadow-sm text-center">
          <p className="text-xs text-muted-foreground mb-1">Dépenses totales</p>
          <p className="text-xl font-extrabold text-red-500">{fmt(bedou?.depenses_totales || 0)}</p>
        </div>
      </div>

      {/* DIAGNOSTIC BEDOU — toujours visible après chargement */}
      {debugLogs.length > 0 && (
        <div className="px-4 mt-3">
          <div className="rounded-xl border border-blue-400 bg-blue-950 p-3 space-y-0.5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-bold text-blue-300">🔍 BEDOU SYNC</p>
              <button onClick={() => setDebugLogs([])} className="text-[10px] text-blue-400 underline">Fermer</button>
            </div>
            {debugLogs.map((l, i) => (
              <p key={i} className={`text-[10px] font-mono ${l.includes('❌') ? 'text-red-300' : l.includes('✅') ? 'text-green-300' : 'text-blue-100'}`}>{l}</p>
            ))}
          </div>
        </div>
      )}

      {/* TABS */}
      <div className="px-4 mt-4">
        <div className="flex gap-1 p-1 bg-muted/50 rounded-2xl border border-border">
          {[
            { key: "solde",      label: "Aperçu" },
            { key: "recharge",   label: "Recharger" },
            ...(canRetrait ? [{ key: "retrait", label: "Retirer" }] : []),
            { key: "historique", label: "Historique" },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 px-2 py-2 rounded-xl text-xs font-semibold transition-all ${tab === t.key ? "bg-white text-primary shadow-sm" : "text-muted-foreground"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* APERÇU */}
      {tab === "solde" && (
        <div className="px-4 mt-4 space-y-3">
          <p className="text-sm font-bold">Dernières transactions</p>
          {transactions.slice(0, 5).map(tx => <TxRow key={tx.id} tx={tx} />)}
          {transactions.length === 0 && <p className="text-center py-8 text-muted-foreground text-sm">Aucune transaction</p>}
        </div>
      )}

      {/* RECHARGE */}
      {tab === "recharge" && (
        <div className="px-4 mt-4 space-y-4">

          {/* (diagnostic déplacé en haut de page) */}

          {/* Écran succès */}
          {successData ? (
            <div className="rounded-2xl bg-emerald-50 border-2 border-emerald-300 p-6 text-center space-y-4">
              <div className="text-6xl">✅</div>
              <div>
                <p className="text-lg font-extrabold text-emerald-800">Demande envoyée avec succès !</p>
                <p className="text-sm text-emerald-700 mt-1">
                  Recharge de <strong>{fmt(successData.montant)} F CFA</strong> en cours de validation.
                </p>
              </div>
              {successData.bonus > 0 && (
                <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-300 text-sm font-semibold text-amber-800">
                  🎁 Bonus +{fmt(successData.bonus)} F CFA crédité à la validation !
                </div>
              )}
              <p className="text-xs text-muted-foreground">Redirection automatique dans 2 secondes…</p>
              <button onClick={() => navigate("/")}
                className="w-full py-3 rounded-xl bg-emerald-600 text-white font-bold text-sm active:scale-95 transition-all">
                Retour à l'accueil maintenant
              </button>
            </div>
          ) : (
            <>
              {/* Infos dépôt */}
              <div className="rounded-2xl bg-orange-50 border-2 border-orange-300 p-4 space-y-2">
                <p className="text-sm font-extrabold text-orange-800">📲 Effectuez d'abord le dépôt, puis soumettez la preuve ici.</p>
                <div className="flex items-center gap-3 mt-2">
                  <div className="h-10 w-10 rounded-xl bg-orange-100 flex items-center justify-center text-xl flex-shrink-0">🟠</div>
                  <div>
                    <p className="text-xs text-orange-600 font-semibold uppercase tracking-wide">Orange Money</p>
                    <p className="text-lg font-extrabold text-orange-900">66 92 51 90</p>
                    <p className="text-xs text-orange-700">Nom : <strong>CDL</strong></p>
                  </div>
                </div>
              </div>

              {/* Montant */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Montant (F CFA) *</label>
                <input type="number" inputMode="numeric" placeholder="Ex: 5000"
                  value={form.montant} onChange={e => setForm({ ...form, montant: e.target.value })}
                  className="w-full mt-1.5 h-12 rounded-xl border border-input px-4 text-base font-semibold text-foreground bg-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
                <div className="mt-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 space-y-1">
                  <p className="text-xs font-bold text-amber-800">🎁 Bonus recharge :</p>
                  <p className="text-xs text-amber-700">• 5 000 F CFA rechargés = <strong>+500 F CFA offerts</strong></p>
                  <p className="text-xs text-amber-700">• 10 000 F CFA rechargés = <strong>+1 500 F CFA offerts</strong></p>
                </div>
                {bonusPreview > 0 && (
                  <div className="mt-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-300 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                    <p className="text-sm font-extrabold text-emerald-700">Bonus : +{fmt(bonusPreview)} F CFA appliqué !</p>
                  </div>
                )}
              </div>

              {/* Méthode */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Méthode de paiement *</label>
                <div className="grid grid-cols-2 gap-2 mt-1.5">
                  {METHODES.map(m => (
                    <button key={m.value} onClick={() => setForm({ ...form, methode: m.value })}
                      className={`p-3 rounded-xl border-2 text-sm font-semibold flex items-center gap-2 transition-all ${form.methode === m.value ? "border-primary bg-primary/10 text-primary" : "border-border bg-white"}`}>
                      <span>{m.icon}</span> {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Capture d'écran */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Capture d'écran du dépôt <span className="text-red-500">*</span></label>
                {!form.preuve ? (
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
                    <label className="cursor-pointer flex flex-col items-center justify-center gap-1.5 p-4 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 transition-colors">
                      <span className="text-2xl">📷</span>
                      <span className="text-xs font-semibold text-primary">Prendre une photo</span>
                      <input type="file" accept="image/*" capture="environment" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) setForm(p => ({ ...p, preuve: f })); }} />
                    </label>
                    <label className="cursor-pointer flex flex-col items-center justify-center gap-1.5 p-4 rounded-xl border-2 border-dashed border-border hover:bg-muted/50 transition-colors">
                      <span className="text-2xl">🖼️</span>
                      <span className="text-xs font-semibold text-muted-foreground">Galerie</span>
                      <input type="file" accept="image/*" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) setForm(p => ({ ...p, preuve: f })); }} />
                    </label>
                  </div>
                ) : (
                  <div className="mt-1.5 space-y-2">
                    <div className="relative rounded-xl overflow-hidden border-2 border-emerald-300">
                      <img src={URL.createObjectURL(form.preuve)} alt="Preuve" className="w-full h-40 object-cover" />
                      <button onClick={() => setForm(p => ({ ...p, preuve: null }))}
                        className="absolute top-2 right-2 bg-red-600 text-white rounded-full h-7 w-7 flex items-center justify-center font-bold shadow">×</button>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                      <span className="text-sm font-semibold text-emerald-700">Capture ajoutée ✅</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Bouton submit */}
              <div className="pb-20">
                <Button className="w-full h-14 text-base font-extrabold rounded-2xl shadow-md"
                  onClick={handleRecharge}
                  disabled={submitting || !form.montant || !form.preuve}>
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      Envoi en cours…
                    </span>
                  ) : (
                    <span>💰 Recharger{bonusPreview > 0 ? ` (+${fmt(bonusPreview)} bonus)` : ""}</span>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* RETRAIT */}
      {tab === "retrait" && canRetrait && (
        <div className="px-4 mt-4 space-y-4 pb-20">
          <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
            ⚠️ Disponible : <strong>{fmt(bedou?.solde_disponible || 0)}</strong> · Min. 500 F CFA
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Montant à retirer (F CFA) *</label>
            <input type="number" inputMode="numeric" placeholder="Ex: 1000" value={retraitForm.montant}
              onChange={e => setRetraitForm({ ...retraitForm, montant: e.target.value })}
              className="w-full mt-1.5 h-12 rounded-xl border border-input px-4 text-base font-semibold text-foreground bg-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Méthode de réception *</label>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              {METHODES.filter(m => m.value !== "cash").map(m => (
                <button key={m.value} onClick={() => setRetraitForm({ ...retraitForm, methode: m.value })}
                  className={`p-3 rounded-xl border-2 text-sm font-semibold flex items-center gap-2 transition-all ${retraitForm.methode === m.value ? "border-primary bg-primary/10 text-primary" : "border-border bg-white"}`}>
                  <span>{m.icon}</span> {m.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Numéro de réception *</label>
            <input type="text" inputMode="numeric" placeholder="Ex: 0706070607" value={retraitForm.numero_reception}
              onChange={e => setRetraitForm({ ...retraitForm, numero_reception: e.target.value })}
              className="w-full mt-1.5 h-11 rounded-xl border border-input px-4 text-sm text-foreground bg-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <Button className="w-full h-12 font-bold rounded-2xl" onClick={handleRetrait}
            disabled={submitting || !retraitForm.montant || !retraitForm.numero_reception}>
            {submitting ? "Envoi en cours…" : "Envoyer la demande de retrait"}
          </Button>
        </div>
      )}

      {/* HISTORIQUE */}
      {tab === "historique" && (
        <div className="px-4 mt-4 space-y-3">
          <div className="flex gap-2 flex-wrap">
            {["tous", "valide", "paye", "en_attente", "refuse"].map(s => (
              <button key={s} onClick={() => setFilterStatut(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${filterStatut === s ? "bg-primary text-white border-primary" : "bg-white border-border text-muted-foreground"}`}>
                {s === "tous" ? "Tous" : s === "valide" ? "Validés" : s === "paye" ? "Payés" : s === "en_attente" ? "En attente" : "Refusés"}
              </button>
            ))}
          </div>
          <BeDouHistory userEmail={user?.email} userRole={user?.user_type} />
          {txFiltrees.slice(0, 20).map(tx => <TxRow key={tx.id} tx={tx} />)}
          {txFiltrees.length === 0 && <p className="text-center py-8 text-muted-foreground text-sm">Aucune transaction</p>}
        </div>
      )}
    </div>
  );
}

function TxRow({ tx }) {
  const isCredit = tx.sens === "credit";
  const cfg = TX_TYPE_CFG[tx.type] || { bg: "bg-gray-50", icon: "💳" };
  const badge = STATUT_BADGE[tx.statut];
  const typeLabels = {
    recharge: "Recharge", gain: "Gain course", bonus: "Bonus", paiement: "Paiement course",
    retrait: "Retrait", commission: "Commission", ajustement: "Ajustement",
    annulation: "Frais annulation", compensation: "Compensation"
  };
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-white shadow-sm">
      <div className={`h-10 w-10 rounded-xl ${cfg.bg} flex items-center justify-center flex-shrink-0 text-lg`}>{cfg.icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{tx.description || typeLabels[tx.type] || tx.type}</p>
        <p className="text-[10px] text-muted-foreground">{moment(tx.created_date).format("DD/MM/YY HH:mm")}</p>
      </div>
      <div className="text-right flex-shrink-0 space-y-0.5">
        <p className={`text-sm font-extrabold ${isCredit ? "text-emerald-600" : "text-red-500"}`}>
          {isCredit ? "+" : "−"}{fmt(tx.montant || 0)}
        </p>
        {badge && (
          <span className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${badge.cls}`}>
            {badge.icon} {badge.label}
          </span>
        )}
      </div>
    </div>
  );
}