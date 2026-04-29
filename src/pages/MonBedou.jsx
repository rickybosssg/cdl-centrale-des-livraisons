import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Wallet, ArrowLeft, Plus, ArrowDownCircle, TrendingUp, Lock, CheckCircle2, Clock, XCircle } from "lucide-react";
import { fmt } from "@/lib/formatMoney";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import moment from "moment";
import BeDouHistory from "@/components/BeDouHistory";
import { triggerWhatsAppNotification, waMsgBedouTopupRequested, waMsgBedouWithdrawRequested } from "@/lib/whatsappNotifications";

const METHODES = [
  { value: "orange_money", label: "Orange Money", icon: "🟠" },
  { value: "moov_money",   label: "Moov Money",   icon: "🔵" },
  { value: "telecel_money",label: "Telecel Money", icon: "🟣" },
  { value: "cash",         label: "Cash",          icon: "💵" },
];

const BONUS_RECHARGE = [
  { seuil: 10000, bonus: 1500 },
  { seuil: 5000,  bonus: 500  },
];

function getBonus(montant) {
  const obj = BONUS_RECHARGE.find(b => montant >= b.seuil);
  return obj ? obj.bonus : 0;
}

const STATUT_BADGE = {
  valide:     { cls: "bg-emerald-100 text-emerald-700", label: "Validé",     icon: <CheckCircle2 className="h-3 w-3" /> },
  paye:       { cls: "bg-emerald-100 text-emerald-700", label: "Payé",       icon: <CheckCircle2 className="h-3 w-3" /> },
  en_attente: { cls: "bg-amber-100 text-amber-700",     label: "En attente", icon: <Clock className="h-3 w-3" /> },
  refuse:     { cls: "bg-red-100 text-red-700",         label: "Refusé",     icon: <XCircle className="h-3 w-3" /> },
};

const TX_TYPE_CFG = {
  recharge:    { bg: "bg-emerald-50",  amt: "text-emerald-700", icon: "💰" },
  gain:        { bg: "bg-emerald-50",  amt: "text-emerald-700", icon: "🏆" },
  bonus:       { bg: "bg-blue-50",     amt: "text-blue-700",    icon: "🎁" },
  paiement:    { bg: "bg-red-50",      amt: "text-red-700",     icon: "🛵" },
  retrait:     { bg: "bg-orange-50",   amt: "text-orange-700",  icon: "💸" },
  commission:  { bg: "bg-purple-50",   amt: "text-purple-700",  icon: "📊" },
  ajustement:  { bg: "bg-gray-50",     amt: "text-gray-700",    icon: "⚙️" },
  annulation:  { bg: "bg-red-50",      amt: "text-red-700",     icon: "❌" },
  compensation:{ bg: "bg-emerald-50",  amt: "text-emerald-700", icon: "🔄" },
};

export default function MonBedou() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [bedou, setBedou] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("solde");
  const [form, setForm] = useState({ montant: "", methode: "orange_money", preuve: null });
  const [submitted, setSubmitted] = useState(null); // null | { bonus, bonus_restants }
  const [retraitForm, setRetraitForm] = useState({ montant: "", methode: "orange_money", numero_reception: "", nom_compte: "" });
  const [submitting, setSubmitting] = useState(false);
  const [filterStatut, setFilterStatut] = useState("tous");

  const load = async () => {
    setLoading(true);
    // Timeout de sécurité 10s pour éviter boucle infinie
    const safetyTimeout = setTimeout(() => { setLoading(false); }, 10000);
    try {
      const me = await base44.auth.me();
      setUser(me);
      const res = await base44.functions.invoke("bedouEngine", { action: "get_bedou" });
      const d = res?.data ?? res;
      setBedou(d.bedou || { solde: 0, solde_disponible: 0, solde_bloque: 0, bonus: 0 });
      setTransactions(d.transactions || []);
    } catch (err) {
      console.error('[MonBedou] Erreur chargement:', err);
      setBedou({ solde: 0, solde_disponible: 0, solde_bloque: 0, bonus: 0 });
    } finally {
      clearTimeout(safetyTimeout);
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // Dépendances vides — ne se relance pas en boucle

  const handleRecharge = async () => {
    const montant = parseInt(form.montant);
    if (!montant || montant < 100) return toast.error("Montant minimum 100 F CFA");
    if (!form.methode) return toast.error("Veuillez sélectionner une méthode");
    if (!form.preuve) return toast.error("Veuillez ajouter une preuve de paiement");

    setSubmitting(true);

    // Timeout de sécurité : débloquer le bouton après 15s quoi qu'il arrive
    const safetyTimer = setTimeout(() => {
      setSubmitting(false);
      toast.error("La requête prend trop de temps. Vérifiez votre connexion et réessayez.");
    }, 15000);

    try {
      // 1. Upload de la preuve
      let file_url = "";
      try {
        const uploadRes = await base44.integrations.Core.UploadFile({ file: form.preuve });
        file_url = uploadRes.file_url;
      } catch (uploadErr) {
        clearTimeout(safetyTimer);
        setSubmitting(false);
        toast.error("Échec de l'envoi de la photo. Vérifiez votre connexion et réessayez.");
        return;
      }

      // 2. Créer la demande de recharge
      const res = await base44.functions.invoke("bedouEngine", {
        action: "demande_recharge",
        montant,
        methode: form.methode,
        preuve_paiement: file_url,
      });

      clearTimeout(safetyTimer);
      setSubmitting(false);

      // Le SDK base44 retourne directement les données (pas enveloppées dans .data)
      const data = res?.data ?? res;

      if (data?.success) {
        setSubmitted({
          bonus: data.bonus_applique || 0,
          bonus_restants: data.bonus_restants ?? null,
        });
        setForm({ montant: "", methode: "orange_money", preuve: null });
        try {
          triggerWhatsAppNotification({
            eventType: "bedou_topup_requested",
            recipientRole: "client",
            recipientName: user?.full_name || "",
            recipientPhone: user?.telephone || null,
            messageText: waMsgBedouTopupRequested(),
            entityId: user?.id,
            entityType: "bedou",
            priority: "high",
          });
        } catch (_) {}
      } else {
        toast.error(data?.error || "La demande a échoué. Réessayez.");
      }
    } catch (err) {
      clearTimeout(safetyTimer);
      setSubmitting(false);
      console.error("[MonBedou] handleRecharge error:", err);
      toast.error("Erreur inattendue : " + (err?.message || "réessayez."));
    }
  };

  const handleRetrait = async () => {
    const montant = parseInt(retraitForm.montant);
    if (!montant || montant < 500) return toast.error("Montant minimum 500 F CFA");
    if (!retraitForm.numero_reception) return toast.error("Veuillez entrer votre numéro de réception");
    setSubmitting(true);
    const res = await base44.functions.invoke("bedouEngine", { action: "demande_retrait", ...retraitForm, montant });
    setSubmitting(false);
    const rd = res?.data ?? res;
    if (rd?.success) {
      toast.success("Demande de retrait envoyée ! L'admin va la traiter.");
      try { triggerWhatsAppNotification({ eventType: "bedou_withdraw_requested", recipientRole: "driver", recipientName: user?.full_name || "", recipientPhone: user?.telephone || null, messageText: waMsgBedouWithdrawRequested(), entityId: user?.id, entityType: "bedou", priority: "high" }); } catch (_) {}
      setRetraitForm({ montant: "", methode: "orange_money", numero_reception: "", nom_compte: "" });
      load();
      setTab("historique");
    } else {
      toast.error(rd?.error || "Erreur");
    }
  };

  const canRetrait = user && ["livreur", "partenaire", "commercial"].includes(user.user_type);
  const bonus = parseInt(form.montant) >= 100 ? getBonus(parseInt(form.montant)) : 0;

  const txFiltrees = transactions.filter(tx => filterStatut === "tous" || tx.statut === filterStatut);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-lg mx-auto pb-16 space-y-0">
      {/* ── HEADER ── */}
      <div className="bg-gradient-to-br from-[#0F2A5C] to-[#1E6BFF] px-4 pt-5 pb-8 rounded-b-[2rem] text-white shadow-lg">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => navigate(-1)} className="h-9 w-9 rounded-full bg-white/15 flex items-center justify-center border border-white/20">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-lg font-extrabold">Mon Bedou</h1>
        </div>

        {/* Solde principal */}
        <div className="text-center mb-1">
          <p className="text-sm text-white/60 font-medium">Solde total</p>
          <p className="text-5xl font-extrabold tracking-tight mt-1">{fmt(bedou?.solde || 0)}</p>
        </div>

        {/* Détail solde */}
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

        {/* Boutons rapides */}
        <div className="flex gap-3 mt-4">
          <button onClick={() => setTab("recharge")} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-white text-primary font-bold text-sm shadow-sm active:scale-95 transition-all">
            <Plus className="h-4 w-4" /> Recharger
          </button>
          {canRetrait && (
            <button onClick={() => setTab("retrait")} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-white/20 text-white font-bold text-sm border border-white/30 active:scale-95 transition-all">
              <ArrowDownCircle className="h-4 w-4" /> Retirer
            </button>
          )}
        </div>
      </div>

      {/* ── STATS ── */}
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

      {/* ── TABS ── */}
      <div className="px-4 mt-4">
        <div className="flex gap-1 p-1 bg-muted/50 rounded-2xl border border-border">
          {[
            { key: "solde",     label: "Aperçu" },
            { key: "recharge",  label: "Recharger" },
            ...(canRetrait ? [{ key: "retrait", label: "Retirer" }] : []),
            { key: "historique", label: "Historique" },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 px-2 py-2 rounded-xl text-xs font-semibold transition-all ${
                tab === t.key ? "bg-white text-primary shadow-sm" : "text-muted-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Aperçu ── */}
      {tab === "solde" && (
        <div className="px-4 mt-4 space-y-3">
          <p className="text-sm font-bold text-foreground">Dernières transactions</p>
          {transactions.slice(0, 5).map(tx => <TxRow key={tx.id} tx={tx} />)}
          {transactions.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">Aucune transaction</div>
          )}
        </div>
      )}

      {/* ── Recharge ── */}
      {tab === "recharge" && (
        <div className="px-4 mt-4 space-y-4">

          {/* Succès */}
          {submitted ? (
            <div className="rounded-2xl bg-emerald-50 border-2 border-emerald-300 p-6 text-center space-y-3">
              <div className="text-5xl">✅</div>
              <p className="text-base font-extrabold text-emerald-800">Demande envoyée avec succès !</p>
              <p className="text-sm text-emerald-700">Votre demande de recharge a été envoyée. Validation sous 24h.</p>
              {submitted.bonus > 0 ? (
                <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm font-semibold text-amber-800">
                  🔥 Bonus +{fmt(submitted.bonus)} F ajouté !{submitted.bonus_restants > 0 ? ` Il vous reste ${submitted.bonus_restants} bonus disponible(s).` : " Vous avez utilisé tous vos bonus de bienvenue."}
                </div>
              ) : (
                <div className="px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-500">
                  Vous avez utilisé tous vos bonus de bienvenue.
                </div>
              )}
              <button
                onClick={() => { setSubmitted(null); setTab("historique"); }}
                className="w-full py-3 rounded-xl bg-emerald-600 text-white font-bold text-sm active:scale-95 transition-all"
              >
                Voir l'historique
              </button>
            </div>
          ) : (
            <>
              {/* Infos dépôt */}
              <div className="rounded-2xl bg-orange-50 border-2 border-orange-300 p-4 space-y-2">
                <p className="text-sm font-extrabold text-orange-800">📲 Effectuez le dépôt via Orange Money puis ajoutez la preuve de paiement.</p>
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
                <input type="number" placeholder="Ex: 2000" value={form.montant} onChange={e => setForm({ ...form, montant: e.target.value })}
                  className="w-full mt-1.5 h-12 rounded-xl border border-input px-4 text-base font-semibold text-foreground bg-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
                {bonus > 0 && <p className="text-xs text-emerald-700 mt-1.5 font-semibold">🎁 Bonus automatique : +{fmt(bonus)} F !</p>}
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

              {/* Preuve */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Preuve de paiement <span className="text-red-500">*</span></label>
                {!form.preuve ? (
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
                    <label className="cursor-pointer flex flex-col items-center justify-center gap-1.5 p-4 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 transition-colors">
                      <span className="text-2xl">📷</span>
                      <span className="text-xs font-semibold text-primary">Prendre une photo</span>
                      <input type="file" accept="image/jpg,image/jpeg,image/png" capture="environment" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setForm(prev => ({ ...prev, preuve: f })); }} />
                    </label>
                    <label className="cursor-pointer flex flex-col items-center justify-center gap-1.5 p-4 rounded-xl border-2 border-dashed border-border hover:bg-muted/50 transition-colors">
                      <span className="text-2xl">🖼️</span>
                      <span className="text-xs font-semibold text-muted-foreground">Galerie</span>
                      <input type="file" accept="image/jpg,image/jpeg,image/png" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setForm(prev => ({ ...prev, preuve: f })); }} />
                    </label>
                  </div>
                ) : (
                  <div className="mt-1.5 space-y-2">
                    <div className="relative rounded-xl overflow-hidden border-2 border-emerald-300">
                      <img src={URL.createObjectURL(form.preuve)} alt="Preuve" className="w-full h-40 object-cover" />
                      <button onClick={() => setForm(prev => ({ ...prev, preuve: null }))} className="absolute top-2 right-2 bg-red-600 text-white rounded-full h-7 w-7 flex items-center justify-center font-bold shadow">×</button>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                      <span className="text-sm font-semibold text-emerald-700">Preuve ajoutée ✅</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Bouton soumettre */}
              <div className="mt-5 mb-20 mx-auto w-[90%]">
                <Button
                  className="w-full h-14 text-base font-extrabold rounded-2xl shadow-md"
                  size="lg"
                  onClick={handleRecharge}
                  disabled={submitting || !form.montant || !form.methode || !form.preuve}
                >
                  {submitting
                    ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Envoi en cours…</span>
                    : <span className="flex items-center justify-center gap-1 flex-wrap">🎁 Soumettre la demande de recharge{bonus > 0 ? ` (+${fmt(bonus)} bonus)` : ""}</span>}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Retrait ── */}
      {tab === "retrait" && canRetrait && (
        <div className="px-4 mt-4 space-y-4">
          <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
            ⚠️ Disponible : <strong>{fmt(bedou?.solde_disponible || 0)}</strong> · Min. 500 F CFA
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Montant à retirer (F CFA) *</label>
            <input type="number" placeholder="Ex: 1000" value={retraitForm.montant} onChange={e => setRetraitForm({ ...retraitForm, montant: e.target.value })}
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
            <input type="text" placeholder="Ex: 0706070607" value={retraitForm.numero_reception} onChange={e => setRetraitForm({ ...retraitForm, numero_reception: e.target.value })}
              className="w-full mt-1.5 h-11 rounded-xl border border-input px-4 text-sm text-foreground bg-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <Button className="w-full h-13 font-bold rounded-2xl" size="lg" onClick={handleRetrait} disabled={submitting || !retraitForm.montant || !retraitForm.numero_reception}>
            {submitting ? "Envoi en cours…" : "Envoyer la demande de retrait"}
          </Button>
        </div>
      )}

      {/* ── Historique ── */}
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
          {txFiltrees.length === 0 && <div className="text-center py-8 text-muted-foreground text-sm">Aucune transaction</div>}
        </div>
      )}
    </div>
  );
}

function TxRow({ tx }) {
  const isCredit = tx.sens === "credit";
  const cfg = TX_TYPE_CFG[tx.type] || { bg: "bg-gray-50", amt: "text-gray-700", icon: "💳" };
  const badge = STATUT_BADGE[tx.statut];
  const typeLabels = { recharge: "Recharge", gain: "Gain course", bonus: "Bonus", paiement: "Paiement course", retrait: "Retrait", commission: "Commission", ajustement: "Ajustement", annulation: "Frais annulation", compensation: "Compensation" };
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border border-border bg-white shadow-sm`}>
      <div className={`h-10 w-10 rounded-xl ${cfg.bg} flex items-center justify-center flex-shrink-0 text-lg`}>
        {cfg.icon}
      </div>
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