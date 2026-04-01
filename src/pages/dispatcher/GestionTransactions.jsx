import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Wallet, CheckCircle2, XCircle, Clock, Filter, RefreshCw, TrendingUp, AlertCircle } from "lucide-react";
import { fmt } from "@/lib/formatMoney";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import moment from "moment";

const TABS = [
  { key: "toutes", label: "Toutes" },
  { key: "recharges", label: "Recharges" },
  { key: "retraits", label: "Retraits" },
  { key: "gains", label: "Gains" },
];

export default function GestionTransactions() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("toutes");
  const [recharges, setRecharges] = useState([]);
  const [retraits, setRetraits] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bedouCdl, setBedouCdl] = useState(null);
  const [processing, setProcessing] = useState(null);
  const [motifDialog, setMotifDialog] = useState(null); // { type, id }
  const [motif, setMotif] = useState("");
  const [ajustDialog, setAjustDialog] = useState(false);
  const [ajust, setAjust] = useState({ email: "", montant: "", sens: "credit", desc: "" });

  const load = async () => {
    const [r, w, tx, cdlBedouList] = await Promise.all([
      base44.entities.DemandeRecharge.list('-created_date', 100),
      base44.entities.DemandeRetrait.list('-created_date', 100),
      base44.entities.Transaction.list('-created_date', 200),
      base44.entities.Bedou.filter({ user_email: 'weezyh2@gmail.com' }),
    ]);
    setRecharges(r);
    setRetraits(w);
    setTransactions(tx);
    if (cdlBedouList.length > 0) setBedouCdl(cdlBedouList[0]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleValiderRecharge = async (id) => {
    setProcessing(id);
    const res = await base44.functions.invoke('bedouEngine', { action: 'valider_recharge', demande_id: id });
    if (res.data.success) { toast.success("Recharge validée !"); load(); }
    else toast.error(res.data.error);
    setProcessing(null);
  };

  const handleRefuserRecharge = async () => {
    setProcessing(motifDialog.id);
    await base44.functions.invoke('bedouEngine', { action: 'refuser_recharge', demande_id: motifDialog.id, motif });
    toast.success("Recharge refusée");
    setMotifDialog(null); setMotif(""); load();
    setProcessing(null);
  };

  const handleValiderRetrait = async (id) => {
    setProcessing(id);
    const res = await base44.functions.invoke('bedouEngine', { action: 'valider_retrait', demande_id: id });
    if (res.data.success) { toast.success("Retrait payé !"); load(); }
    else toast.error(res.data.error);
    setProcessing(null);
  };

  const handleRefuserRetrait = async () => {
    setProcessing(motifDialog.id);
    await base44.functions.invoke('bedouEngine', { action: 'refuser_retrait', demande_id: motifDialog.id, motif });
    toast.success("Retrait refusé, montant restitué");
    setMotifDialog(null); setMotif(""); load();
    setProcessing(null);
  };

  const handleAjustement = async () => {
    if (!ajust.email || !ajust.montant) return toast.error("Remplissez tous les champs");
    const res = await base44.functions.invoke('bedouEngine', {
      action: 'ajuster_solde', target_email: ajust.email,
      montant: parseInt(ajust.montant), sens: ajust.sens, description: ajust.desc,
    });
    if (res.data.success) { toast.success("Ajustement effectué"); setAjustDialog(false); load(); }
    else toast.error(res.data.error);
  };

  // Stats
  const totalRechargesValides = recharges.filter(r => r.statut === 'valide').reduce((s, r) => s + r.montant, 0);
  const totalRetraitsPayes = retraits.filter(r => r.statut === 'paye').reduce((s, r) => s + r.montant, 0);
  const enAttenteRecharges = recharges.filter(r => r.statut === 'en_attente').length;
  const enAttenteRetraits = retraits.filter(r => r.statut === 'en_attente').length;

  const STATUT_CFG = {
    en_attente: "bg-amber-100 text-amber-700",
    valide: "bg-green-100 text-green-700",
    refuse: "bg-red-100 text-red-700",
    paye: "bg-green-100 text-green-700",
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4 pb-16">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2 flex-1">
          <Wallet className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">Gestion des Transactions</h1>
        </div>
        <Button variant="outline" size="icon" onClick={load}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Bedou CDL */}
      {bedouCdl && (
        <Card className="bg-primary/5 border-primary/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-primary uppercase tracking-wide">💼 Bedou CDL (commissions)</p>
                <p className="text-2xl font-black text-primary mt-1">{fmt(bedouCdl.solde_disponible || 0)}</p>
                <p className="text-xs text-muted-foreground">Total encaissé : {fmt(bedouCdl.gains_totaux || 0)}</p>
              </div>
              <Wallet className="h-10 w-10 text-primary/30" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-3">
            <p className="text-xs text-green-700">Recharges validées</p>
            <p className="text-lg font-bold text-green-700">{fmt(totalRechargesValides)}</p>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-3">
            <p className="text-xs text-blue-700">Retraits payés</p>
            <p className="text-lg font-bold text-blue-700">{fmt(totalRetraitsPayes)}</p>
          </CardContent>
        </Card>
        {enAttenteRecharges > 0 && (
          <Card className="bg-amber-50 border-amber-200 col-span-2">
            <CardContent className="p-3 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <p className="text-sm text-amber-700 font-medium">
                {enAttenteRecharges} recharge(s) et {enAttenteRetraits} retrait(s) en attente de validation
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Bouton ajustement */}
      <Button variant="outline" className="w-full" onClick={() => setAjustDialog(true)}>
        Ajuster un solde Bedou
      </Button>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              tab === t.key ? "bg-primary text-white" : "bg-muted text-muted-foreground"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Recharges */}
      {(tab === "toutes" || tab === "recharges") && (
        <div className="space-y-3">
          {tab === "toutes" && <p className="text-sm font-semibold mt-2">📥 Recharges</p>}
          {recharges.map(r => (
            <Card key={r.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sm">{r.user_nom || r.user_email}</p>
                    <p className="text-xs text-muted-foreground">{r.methode} — {moment(r.created_date).format("DD/MM/YY HH:mm")}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-green-700">+{fmt(r.montant)}</p>
                    {r.bonus_applique > 0 && <p className="text-xs text-blue-700 font-medium">🎁 +{fmt(r.bonus_applique)} bonus</p>}
                  </div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUT_CFG[r.statut]}`}>{r.statut}</span>
                {r.numero_transaction && <p className="text-xs text-muted-foreground">Réf: {r.numero_transaction}</p>}
                {r.preuve_paiement && <a href={r.preuve_paiement} target="_blank" rel="noreferrer" className="text-xs text-primary underline">Voir la preuve</a>}
                {r.statut === 'en_attente' && (
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" className="flex-1 bg-green-600 hover:bg-green-700" disabled={processing === r.id}
                      onClick={() => handleValiderRecharge(r.id)}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                      {processing === r.id ? "..." : "Valider"}
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 border-red-300 text-red-600"
                      onClick={() => setMotifDialog({ type: 'recharge', id: r.id })}>
                      <XCircle className="h-3.5 w-3.5 mr-1" /> Refuser
                    </Button>
                  </div>
                )}
                {r.motif_refus && <p className="text-xs text-red-600">Motif : {r.motif_refus}</p>}
              </CardContent>
            </Card>
          ))}
          {recharges.length === 0 && tab === "recharges" && <p className="text-center text-sm text-muted-foreground py-6">Aucune recharge</p>}
        </div>
      )}

      {/* Retraits */}
      {(tab === "toutes" || tab === "retraits") && (
        <div className="space-y-3">
          {tab === "toutes" && <p className="text-sm font-semibold mt-2">📤 Retraits</p>}
          {retraits.map(r => (
            <Card key={r.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sm">{r.user_nom || r.user_email}</p>
                    <p className="text-xs text-muted-foreground">{r.role} — {r.methode} — {moment(r.created_date).format("DD/MM/YY HH:mm")}</p>
                    <p className="text-xs text-muted-foreground">→ {r.numero_reception} ({r.nom_compte})</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-red-700">-{fmt(r.montant)}</p>
                  </div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUT_CFG[r.statut]}`}>{r.statut}</span>
                {r.statut === 'en_attente' && (
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" className="flex-1 bg-green-600 hover:bg-green-700" disabled={processing === r.id}
                      onClick={() => handleValiderRetrait(r.id)}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                      {processing === r.id ? "..." : "Payer"}
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 border-red-300 text-red-600"
                      onClick={() => setMotifDialog({ type: 'retrait', id: r.id })}>
                      <XCircle className="h-3.5 w-3.5 mr-1" /> Refuser
                    </Button>
                  </div>
                )}
                {r.motif_refus && <p className="text-xs text-red-600">Motif : {r.motif_refus}</p>}
              </CardContent>
            </Card>
          ))}
          {retraits.length === 0 && tab === "retraits" && <p className="text-center text-sm text-muted-foreground py-6">Aucun retrait</p>}
        </div>
      )}

      {/* Toutes les transactions */}
      {(tab === "toutes" || tab === "gains") && (
        <div className="space-y-2">
          {tab === "toutes" && <p className="text-sm font-semibold mt-2">📊 Toutes les transactions</p>}
          {transactions.slice(0, tab === "toutes" ? 20 : 100).map(tx => (
            <div key={tx.id} className="flex items-center gap-3 p-3 rounded-xl border bg-card">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${tx.sens === 'credit' ? 'bg-green-100' : 'bg-red-100'}`}>
                {tx.sens === 'credit' ? '↑' : '↓'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{tx.user_nom || tx.user_email}</p>
                <p className="text-xs text-muted-foreground truncate">{tx.description || tx.type}</p>
                <p className="text-[10px] text-muted-foreground">{moment(tx.created_date).format("DD/MM HH:mm")}</p>
              </div>
              <div className="text-right">
                <p className={`text-sm font-bold ${tx.sens === 'credit' ? 'text-green-700' : 'text-red-700'}`}>
                  {tx.sens === 'credit' ? '+' : '-'}{fmt(tx.montant)}
                </p>
                <p className="text-[10px] text-muted-foreground">{tx.role}</p>
              </div>
            </div>
          ))}
          {transactions.length === 0 && <p className="text-center text-sm text-muted-foreground py-6">Aucune transaction</p>}
        </div>
      )}

      {/* Dialog motif refus */}
      <Dialog open={!!motifDialog} onOpenChange={() => setMotifDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Motif de refus</DialogTitle>
          </DialogHeader>
          <textarea
            className="w-full border rounded-lg p-3 text-sm h-24 resize-none"
            placeholder="Expliquez le motif du refus..."
            value={motif}
            onChange={e => setMotif(e.target.value)}
          />
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setMotifDialog(null)}>Annuler</Button>
            <Button variant="destructive" className="flex-1" onClick={motifDialog?.type === 'recharge' ? handleRefuserRecharge : handleRefuserRetrait}>
              Confirmer le refus
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog ajustement */}
      <Dialog open={ajustDialog} onOpenChange={setAjustDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajuster un solde Bedou</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <input className="w-full border rounded-lg px-3 h-10 text-sm" placeholder="Email utilisateur" value={ajust.email} onChange={e => setAjust({ ...ajust, email: e.target.value })} />
            <input className="w-full border rounded-lg px-3 h-10 text-sm" placeholder="Montant (F CFA)" type="number" value={ajust.montant} onChange={e => setAjust({ ...ajust, montant: e.target.value })} />
            <div className="flex gap-2">
              {["credit", "debit"].map(s => (
                <button key={s} onClick={() => setAjust({ ...ajust, sens: s })}
                  className={`flex-1 p-2 rounded-lg border-2 text-sm font-medium ${ajust.sens === s ? 'border-primary bg-primary/10' : 'border-border'}`}>
                  {s === 'credit' ? '+ Créditer' : '- Débiter'}
                </button>
              ))}
            </div>
            <input className="w-full border rounded-lg px-3 h-10 text-sm" placeholder="Description (obligatoire)" value={ajust.desc} onChange={e => setAjust({ ...ajust, desc: e.target.value })} />
            <Button className="w-full" onClick={handleAjustement}>Appliquer l'ajustement</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}