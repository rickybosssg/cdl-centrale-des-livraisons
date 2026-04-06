import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Check, X, Eye, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import StaffStatCard from "@/components/StaffStatCard";
import { Wallet } from "lucide-react";
import moment from "moment";

async function logAction(actor, actionType, target, details) {
  await base44.entities.AuditLog.create({
    actorEmail: actor.email, actorName: actor.full_name, actorRoleLabel: "Gestionnaire Bedou",
    actionType, targetType: target.type, targetId: target.id, targetName: target.name, details,
  }).catch(() => {});
}

export default function BedouManager() {
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [perm, setPerm] = useState(null);
  const [recharges, setRecharges] = useState([]);
  const [retraits, setRetraits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [motif, setMotif] = useState("");
  const [processing, setProcessing] = useState(false);

  const load = async () => {
    const actor = await base44.auth.me();
    setMe(actor);
    const isAdmin = actor?.role === "admin" || actor?.email === "weezyh2@gmail.com";
    if (!isAdmin) {
      const perms = await base44.entities.StaffPermission.filter({ userEmail: actor.email, isActive: true });
      const p = perms[0];
      if (!p?.canManageBedou) { toast.error("Accès refusé"); navigate("/staff"); return; }
      setPerm(p);
    }
    const [r, w] = await Promise.all([
      base44.entities.DemandeRecharge.list("-created_date", 200),
      base44.entities.DemandeRetrait.list("-created_date", 200),
    ]);
    setRecharges(r); setRetraits(w); setLoading(false);
  };

  useEffect(() => { load().catch(() => setLoading(false)); }, []);

  const rechargesAttente = recharges.filter(r => r.statut === "en_attente");
  const retraitsAttente = retraits.filter(r => r.statut === "en_attente");

  const handleValider = async (req, type) => {
    if (!me) return;
    setProcessing(true);
    const table = type === "recharge" ? "DemandeRecharge" : "DemandeRetrait";
    await base44.entities[table].update(req.id, { statut: "valide", date_validation: new Date().toISOString(), valide_par: me.email });
    const bedou = await base44.entities.Bedou.filter({ user_email: req.user_email });
    if (bedou.length > 0) {
      const b = bedou[0];
      const s = type === "recharge" ? (b.solde || 0) + req.montant : Math.max(0, (b.solde || 0) - req.montant);
      await base44.entities.Bedou.update(b.id, { solde: s, solde_disponible: s });
    }
    await base44.entities.Notification.create({ destinataire_email: req.user_email, destinataire_role: req.role, titre: `✅ ${type === "recharge" ? "Recharge" : "Retrait"} validé`, message: `${req.montant?.toLocaleString()} F CFA — validé par l'équipe CDL.`, type: "success", lue: false });
    await logAction(me, type === "recharge" ? "BEDOU_TOPUP_APPROVED" : "BEDOU_WITHDRAWAL_APPROVED", { type, id: req.id, name: req.user_nom }, `${req.montant} FCFA validé`);
    toast.success("Opération effectuée avec succès");
    setSelected(null); setMotif(""); load();
    setProcessing(false);
  };

  const handleRefuser = async (req, type) => {
    if (!motif.trim()) { toast.error("Veuillez préciser la raison du refus"); return; }
    setProcessing(true);
    const table = type === "recharge" ? "DemandeRecharge" : "DemandeRetrait";
    await base44.entities[table].update(req.id, { statut: "refuse", motif_refus: motif, date_validation: new Date().toISOString(), valide_par: me.email });
    await base44.entities.Notification.create({ destinataire_email: req.user_email, destinataire_role: req.role, titre: `❌ ${type === "recharge" ? "Recharge" : "Retrait"} refusé`, message: `Motif : ${motif}`, type: "danger", lue: false });
    await logAction(me, type === "recharge" ? "BEDOU_TOPUP_REJECTED" : "BEDOU_WITHDRAWAL_REJECTED", { type, id: req.id, name: req.user_nom }, motif);
    toast.success("Opération effectuée avec succès");
    setSelected(null); setMotif(""); load();
    setProcessing(false);
  };

  const RequestCard = ({ req, type }) => (
    <Card className="shadow-sm">
      <CardContent className="p-4 space-y-2">
        <div className="flex justify-between items-start">
          <div>
            <p className="font-bold text-sm">{req.user_nom}</p>
            <p className="text-xs text-muted-foreground">{req.methode} · {moment(req.created_date).format("DD/MM HH:mm")}</p>
          </div>
          <p className="text-lg font-extrabold text-primary">{req.montant?.toLocaleString()} F</p>
        </div>
        <div className="flex gap-2">
          {type === "recharge" && req.preuve_paiement && (
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => window.open(req.preuve_paiement, "_blank")}>
              <Eye className="h-3 w-3 mr-1" /> Voir preuve
            </Button>
          )}
          <Button size="sm" className="h-8 text-xs flex-1 bg-green-600 hover:bg-green-700" onClick={() => { if (window.confirm("Confirmer cette action ?")) handleValider(req, type); }}>
            <Check className="h-3 w-3 mr-1" /> Valider
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs flex-1 border-red-300 text-red-600" onClick={() => { setSelected({ ...req, type }); setMotif(""); }}>
            <X className="h-3 w-3 mr-1" /> Refuser
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/staff")}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Gestion du portefeuille Bedou</h1>
          <p className="text-xs text-muted-foreground">Recharges et retraits</p>
        </div>
        <Button variant="ghost" size="icon" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StaffStatCard label="Recharges" value={rechargesAttente.length} color="text-green-600" icon={Wallet} />
        <StaffStatCard label="Retraits" value={retraitsAttente.length} color="text-orange-600" icon={Wallet} />
        <StaffStatCard label="Total F" value={(rechargesAttente.reduce((s, r) => s + (r.montant || 0), 0) + retraitsAttente.reduce((s, r) => s + (r.montant || 0), 0)).toLocaleString()} color="text-primary" icon={Wallet} />
      </div>

      <Tabs defaultValue="recharges">
        <TabsList className="w-full">
          <TabsTrigger value="recharges" className="flex-1">Recharges ({rechargesAttente.length})</TabsTrigger>
          <TabsTrigger value="retraits" className="flex-1">Retraits ({retraitsAttente.length})</TabsTrigger>
          <TabsTrigger value="historique" className="flex-1">Historique</TabsTrigger>
        </TabsList>
        <TabsContent value="recharges" className="space-y-3 mt-4">
          {rechargesAttente.length === 0 ? <p className="text-center text-sm text-muted-foreground py-8">Aucune donnée disponible</p> : rechargesAttente.map(r => <RequestCard key={r.id} req={r} type="recharge" />)}
        </TabsContent>
        <TabsContent value="retraits" className="space-y-3 mt-4">
          {retraitsAttente.length === 0 ? <p className="text-center text-sm text-muted-foreground py-8">Aucune donnée disponible</p> : retraitsAttente.map(r => <RequestCard key={r.id} req={r} type="retrait" />)}
        </TabsContent>
        <TabsContent value="historique" className="space-y-3 mt-4">
          {[...recharges.filter(r => r.statut !== "en_attente"), ...retraits.filter(r => r.statut !== "en_attente")]
            .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
            .slice(0, 50)
            .map(r => (
              <Card key={r.id} className="shadow-sm">
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{r.user_nom}</p>
                    <p className="text-xs text-muted-foreground">{moment(r.created_date).format("DD/MM HH:mm")}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm">{r.montant?.toLocaleString()} F</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${r.statut === "valide" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{r.statut}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
        </TabsContent>
      </Tabs>

      <Dialog open={!!selected} onOpenChange={v => { if (!v) setSelected(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Motif de refus</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Veuillez préciser la raison du refus</p>
            <Textarea placeholder="Raison du refus..." value={motif} onChange={e => setMotif(e.target.value)} rows={3} />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setSelected(null)}>Annuler</Button>
              <Button variant="destructive" className="flex-1" onClick={() => handleRefuser(selected, selected.type)} disabled={processing}>
                {processing ? "En cours..." : "Confirmer le refus"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}