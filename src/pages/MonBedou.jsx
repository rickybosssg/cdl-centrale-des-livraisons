import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Wallet, ArrowLeft, Plus, ArrowDownCircle, TrendingUp, Lock, Upload, CheckCircle2, XCircle, Clock } from "lucide-react";
import { fmt } from "@/lib/formatMoney";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import moment from "moment";
import BeDouHistory from "@/components/BeDouHistory";

const METHODES = [
  { value: "orange_money", label: "Orange Money" },
  { value: "moov_money", label: "Moov Money" },
  { value: "telecel_money", label: "Telecel Money" },
  { value: "cash", label: "Cash" },
];

const BONUS_RECHARGE = [
  { seuil: 5000, bonus: 500 },
  { seuil: 3000, bonus: 200 },
  { seuil: 1000, bonus: 50 },
];

function getBonus(montant) {
  const obj = BONUS_RECHARGE.find(b => montant >= b.seuil);
  return obj ? obj.bonus : 0;
}

const TYPE_COLORS = {
  recharge: "text-green-600 bg-green-50",
  gain: "text-green-600 bg-green-50",
  bonus: "text-blue-600 bg-blue-50",
  paiement: "text-red-600 bg-red-50",
  retrait: "text-orange-600 bg-orange-50",
  commission: "text-purple-600 bg-purple-50",
  ajustement: "text-gray-600 bg-gray-50",
};

const STATUT_BADGE = {
  valide: <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Validé</span>,
  paye: <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Payé</span>,
  en_attente: <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">En attente</span>,
  refuse: <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Refusé</span>,
};

export default function MonBedou() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [bedou, setBedou] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("solde"); // solde | recharge | retrait | historique
  const [form, setForm] = useState({ montant: "", methode: "orange_money", numero_transaction: "", preuve: null });
  const [retraitForm, setRetraitForm] = useState({ montant: "", methode: "orange_money", numero_reception: "", nom_compte: "" });
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatut, setFilterStatut] = useState('tous');

  const load = async () => {
    const me = await base44.auth.me();
    setUser(me);
    const res = await base44.functions.invoke('bedouEngine', { action: 'get_bedou' });
    setBedou(res.data.bedou);
    setTransactions(res.data.transactions || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleRecharge = async () => {
    const montant = parseInt(form.montant);
    if (!montant || montant < 100) return toast.error("Montant minimum 100 F CFA");
    if (!form.methode) return toast.error("Veuillez sélectionner une méthode");
    if (!form.preuve) return toast.error("Veuillez ajouter une preuve de paiement");
    // Vérifier taille max 5MB
    if (form.preuve.size > 5 * 1024 * 1024) return toast.error("Image trop grande (max 5 MB)");
    setSubmitting(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file: form.preuve });
    const preuve_url = file_url;
    const res = await base44.functions.invoke('bedouEngine', {
      action: 'demande_recharge',
      montant,
      methode: form.methode,
      numero_transaction: form.numero_transaction,
      preuve_paiement: preuve_url,
    });
    setSubmitting(false);
    if (res.data.success) {
      toast.success(`Demande de recharge envoyée ! ${res.data.bonus_applique > 0 ? `Bonus : +${res.data.bonus_applique} F CFA 🎁` : ''}`);
      setForm({ montant: "", methode: "orange_money", numero_transaction: "", preuve: null });
      setTab("historique");
    } else {
      toast.error(res.data.error || "Erreur");
    }
  };

  const handleRetrait = async () => {
    const montant = parseInt(retraitForm.montant);
    if (!montant || montant < 500) return toast.error("Montant minimum 500 F CFA");
    if (!retraitForm.numero_reception) return toast.error("Veuillez entrer votre numéro de réception");
    setSubmitting(true);
    const res = await base44.functions.invoke('bedouEngine', {
      action: 'demande_retrait',
      ...retraitForm,
      montant,
    });
    setSubmitting(false);
    if (res.data.success) {
      toast.success("Demande de retrait envoyée ! L'admin va la traiter.");
      setRetraitForm({ montant: "", methode: "orange_money", numero_reception: "", nom_compte: "" });
      load();
      setTab("historique");
    } else {
      toast.error(res.data.error || "Erreur");
    }
  };

  const canRetrait = user && ['livreur', 'partenaire', 'commercial'].includes(user.user_type);
  const bonus = parseInt(form.montant) >= 100 ? getBonus(parseInt(form.montant)) : 0;

  const transactionsFiltrees = transactions.filter(tx => {
    const search = searchQuery.toLowerCase();
    const matchesSearch = !search || 
      tx.description?.toLowerCase().includes(search) ||
      tx.montant?.toString().includes(search);
    const matchesStatut = filterStatut === 'tous' || tx.statut === filterStatut;
    return matchesSearch && matchesStatut;
  });

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-lg mx-auto p-4 pb-16 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <Wallet className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold">Mon Bedou</h1>
        </div>
      </div>

      {/* Carte solde */}
      <div className="rounded-2xl bg-gradient-to-br from-primary to-blue-700 p-6 text-white shadow-xl">
        <div className="flex items-center gap-2 mb-4 opacity-80">
          <Wallet className="h-5 w-5" />
          <span className="text-sm font-medium">Portefeuille CDL</span>
        </div>
        <p className="text-4xl font-extrabold">{fmt(bedou?.solde || 0)}</p>
        <div className="flex gap-5 mt-4">
          <div>
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-green-300" />
              <span className="text-xs text-white/70">Disponible</span>
            </div>
            <p className="font-bold text-white">{fmt(bedou?.solde_disponible || 0)}</p>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <Lock className="h-4 w-4 text-amber-300" />
              <span className="text-xs text-white/70">Bloqué</span>
            </div>
            <p className="font-bold text-white">{fmt(bedou?.solde_bloque || 0)}</p>
          </div>
          {(bedou?.bonus || 0) > 0 && (
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-amber-300 text-sm">🎁</span>
                <span className="text-xs text-white/70">Bonus</span>
              </div>
              <p className="font-bold text-white">{fmt(bedou?.bonus || 0)}</p>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { key: "solde", label: "Aperçu" },
          { key: "recharge", label: "Recharger" },
          ...(canRetrait ? [{ key: "retrait", label: "Retirer" }] : []),
          { key: "historique", label: "Historique" },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              tab === t.key ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Aperçu */}
      {tab === "solde" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Card className="bg-green-50 border-green-200">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-green-700 mb-1">Gains totaux</p>
                <p className="text-xl font-bold text-green-700">{fmt(bedou?.gains_totaux || 0)}</p>
              </CardContent>
            </Card>
            <Card className="bg-red-50 border-red-200">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-red-700 mb-1">Dépenses totales</p>
                <p className="text-xl font-bold text-red-700">{fmt(bedou?.depenses_totales || 0)}</p>
              </CardContent>
            </Card>
          </div>
          <div className="flex gap-3">
            <Button className="flex-1" onClick={() => setTab("recharge")}>
              <Plus className="h-4 w-4 mr-2" /> Recharger
            </Button>
            {canRetrait && (
              <Button variant="outline" className="flex-1" onClick={() => setTab("retrait")}>
                <ArrowDownCircle className="h-4 w-4 mr-2" /> Retirer
              </Button>
            )}
          </div>
          {/* Dernières transactions */}
          <div className="space-y-2">
            <p className="text-sm font-semibold">Dernières transactions</p>
            {transactions.slice(0, 5).map(tx => (
              <TransactionRow key={tx.id} tx={tx} />
            ))}
            {transactions.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-4">Aucune transaction</p>
            )}
          </div>
        </div>
      )}

      {/* Recharge */}
      {tab === "recharge" && (
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-800">
            💡 Après votre paiement, envoyez la preuve et l'admin validera sous 24h.
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Montant (F CFA) *</label>
              <input
                type="number"
                placeholder="Ex: 2000"
                value={form.montant}
                onChange={e => setForm({ ...form, montant: e.target.value })}
                className="w-full mt-1 h-11 rounded-xl border border-input px-3 py-2 text-sm font-medium text-foreground bg-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {bonus > 0 && (
                <p className="text-xs text-green-700 mt-1 font-semibold">🎁 Bonus automatique : +{fmt(bonus)} !</p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Méthode de paiement *</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {METHODES.map(m => (
                  <button
                    key={m.value}
                    onClick={() => setForm({ ...form, methode: m.value })}
                    className={`p-3 rounded-xl border-2 text-sm font-medium transition-colors ${
                      form.methode === m.value ? "border-primary bg-primary/10 text-primary" : "border-border"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Numéro de transaction (optionnel)</label>
              <input
                type="text"
                placeholder="Ex: TXN12345"
                value={form.numero_transaction}
                onChange={e => setForm({ ...form, numero_transaction: e.target.value })}
                className="w-full mt-1 h-11 rounded-xl border border-input px-3 py-2 text-sm text-foreground bg-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* Preuve de paiement obligatoire */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Preuve de paiement * <span className="text-red-500">(obligatoire)</span></label>
              {!form.preuve ? (
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <label className="cursor-pointer flex flex-col items-center justify-center gap-1.5 p-4 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 transition-colors">
                    <span className="text-2xl">📷</span>
                    <span className="text-xs font-medium text-primary">Prendre une photo</span>
                    <input
                      type="file" accept="image/jpg,image/jpeg,image/png" capture="environment"
                      className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) setForm(prev => ({ ...prev, preuve: f })); }}
                    />
                  </label>
                  <label className="cursor-pointer flex flex-col items-center justify-center gap-1.5 p-4 rounded-xl border-2 border-dashed border-border hover:bg-muted/50 transition-colors">
                    <span className="text-2xl">🖼️</span>
                    <span className="text-xs font-medium">Depuis la galerie</span>
                    <input
                      type="file" accept="image/jpg,image/jpeg,image/png"
                      className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) setForm(prev => ({ ...prev, preuve: f })); }}
                    />
                  </label>
                </div>
              ) : (
                <div className="mt-1 relative rounded-xl overflow-hidden border-2 border-green-300">
                  <img
                    src={URL.createObjectURL(form.preuve)}
                    alt="Preuve"
                    className="w-full h-40 object-cover"
                  />
                  <button
                    onClick={() => setForm(prev => ({ ...prev, preuve: null }))}
                    className="absolute top-2 right-2 bg-red-600 text-white rounded-full h-7 w-7 flex items-center justify-center text-sm font-bold shadow"
                  >
                    ×
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 bg-green-600/90 text-white text-xs py-1 text-center font-medium">
                    ✅ {form.preuve.name} ({(form.preuve.size / 1024).toFixed(0)} KB)
                  </div>
                </div>
              )}
            </div>

            <Button className="w-full h-12 font-semibold" onClick={handleRecharge} disabled={submitting || !form.montant || !form.preuve}>
              {submitting ? "Upload en cours..." : `Envoyer la demande${bonus > 0 ? ` (+${fmt(bonus)} bonus)` : ''}`}
            </Button>
          </div>
        </div>
      )}

      {/* Retrait */}
      {tab === "retrait" && canRetrait && (
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
            ⚠️ Solde disponible : <strong>{fmt(bedou?.solde_disponible || 0)}</strong>. Retrait minimum : 500 F CFA.
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Montant à retirer (F CFA) *</label>
              <input
                type="number"
                placeholder="Ex: 1000"
                value={retraitForm.montant}
                onChange={e => setRetraitForm({ ...retraitForm, montant: e.target.value })}
                className="w-full mt-1 h-11 rounded-xl border border-input px-3 py-2 text-sm font-medium text-foreground bg-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Numéro de réception *</label>
              <input
                type="text"
                placeholder="Ex: 0706070607"
                value={retraitForm.numero_reception}
                onChange={e => setRetraitForm({ ...retraitForm, numero_reception: e.target.value })}
                className="w-full mt-1 h-11 rounded-xl border border-input px-3 py-2 text-sm text-foreground bg-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              </div>
        </div>
      )}

      {/* Historique avec BeDouHistory */}
      {tab === "historique" && (
        <div className="space-y-4">
          <div className="space-y-3 p-3 rounded-xl bg-muted/40 border">
            <input
              type="text"
              placeholder="Rechercher par montant ou description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <select
              value={filterStatut}
              onChange={(e) => setFilterStatut(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border bg-white text-xs focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="tous">Tous les statuts</option>
              <option value="valide">Validées</option>
              <option value="paye">Payées</option>
              <option value="en_attente">En attente</option>
              <option value="refuse">Refusées</option>
            </select>
            {(searchQuery || filterStatut !== 'tous') && (
              <button
                onClick={() => { setSearchQuery(''); setFilterStatut('tous'); }}
                className="w-full text-xs font-medium text-primary hover:underline"
              >
                ↻ Réinitialiser
              </button>
            )}
          </div>
          <BeDouHistory userEmail={user?.email} userRole={user?.user_type} />
          <div className="space-y-2">
            {transactionsFiltrees.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-4">Aucune transaction</p>
            ) : (
              transactionsFiltrees.slice(0, 10).map(tx => <TransactionRow key={tx.id} tx={tx} />)
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TransactionRow({ tx }) {
  const isCredit = tx.sens === 'credit';
  const typeColors = {
    recharge: "bg-green-50", gain: "bg-green-50", bonus: "bg-blue-50",
    paiement: "bg-red-50", retrait: "bg-orange-50", commission: "bg-purple-50", ajustement: "bg-gray-50",
  };
  const typeLabels = {
    recharge: "Recharge", gain: "Gain", bonus: "Bonus", paiement: "Paiement",
    retrait: "Retrait", commission: "Commission", ajustement: "Ajustement",
  };
  const STATUT_BADGE = {
    valide: "bg-green-100 text-green-700",
    paye: "bg-green-100 text-green-700",
    en_attente: "bg-amber-100 text-amber-700",
    refuse: "bg-red-100 text-red-700",
  };
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border ${typeColors[tx.type] || 'bg-muted'}`}>
      <div className="h-9 w-9 rounded-full bg-white flex items-center justify-center flex-shrink-0 shadow-sm">
        <Wallet className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{tx.description || typeLabels[tx.type]}</p>
        <p className="text-xs text-muted-foreground">{moment(tx.created_date).format("DD/MM/YY HH:mm")}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className={`text-sm font-bold ${isCredit ? 'text-green-700' : 'text-red-700'}`}>
          {isCredit ? '+' : '-'}{fmt(tx.montant || 0)}
        </p>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUT_BADGE[tx.statut] || 'bg-gray-100 text-gray-600'}`}>
          {tx.statut}
        </span>
      </div>
    </div>
  );
}