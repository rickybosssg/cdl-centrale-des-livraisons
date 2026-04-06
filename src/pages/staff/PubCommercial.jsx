import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Megaphone, CheckCircle2, XCircle, BarChart3, Loader2, RefreshCw, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import StaffStatCard from "@/components/StaffStatCard";
import moment from "moment";

async function logAction(actor, action, target, details) {
  await base44.entities.AuditLog.create({ actorEmail: actor.email, actorName: actor.full_name, actorRoleLabel: "Superviseur Pubs & Commerciaux", actionType: action, targetType: "ad", targetId: target.id, targetName: target.name, details }).catch(() => {});
}

export default function PubCommercial() {
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [pubs, setPubs] = useState([]);
  const [codes, setCodes] = useState([]);
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
      if (!perms[0]?.canManageAds) { toast.error("Accès refusé"); navigate("/staff"); return; }
    }
    const [p, c] = await Promise.all([
      base44.entities.Publicite.filter({ deleted: false }),
      base44.entities.CodePromo.list("-created_date", 200),
    ]);
    setPubs(p.filter(x => !x.deleted)); setCodes(c); setLoading(false);
  };

  useEffect(() => { load().catch(() => setLoading(false)); }, []);

  const pending = pubs.filter(p => !p.active && !p.suspended);
  const active = pubs.filter(p => p.active && !p.suspended);
  const refused = pubs.filter(p => p.suspended);

  const handleValider = async (pub) => {
    if (!window.confirm("Confirmer cette action ?")) return;
    setProcessing(true);
    await base44.entities.Publicite.update(pub.id, { active: true, suspended: false });
    await logAction(me, "AD_APPROVED", { id: pub.id, name: pub.titre }, "Publicité validée");
    toast.success("Opération effectuée avec succès");
    setSelected(null); load();
    setProcessing(false);
  };

  const handleRefuser = async (pub) => {
    if (!motif.trim()) { toast.error("Veuillez préciser la raison du refus"); return; }
    setProcessing(true);
    await base44.entities.Publicite.update(pub.id, { active: false, suspended: true, suspended_at: new Date().toISOString() });
    await logAction(me, "AD_REJECTED", { id: pub.id, name: pub.titre }, motif);
    toast.success("Opération effectuée avec succès");
    setSelected(null); setMotif(""); load();
    setProcessing(false);
  };

  const PubCard = ({ pub, showActions }) => (
    <Card className="shadow-sm">
      <CardContent className="p-4 space-y-3">
        <div className="flex gap-3">
          {pub.image_url && <img src={pub.image_url} alt={pub.titre} className="h-16 w-20 rounded-xl object-cover flex-shrink-0" />}
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm">{pub.titre}</p>
            <p className="text-xs text-muted-foreground">{pub.nom_annonceur || "—"} · {pub.placement}</p>
            <p className="text-xs text-muted-foreground">{moment(pub.created_date).format("DD/MM/YYYY")}</p>
            <div className="flex gap-2 mt-1">
              <span className="text-[10px] text-muted-foreground">👁 {pub.impressions || 0} vues</span>
              <span className="text-[10px] text-muted-foreground">🖱 {pub.clics || 0} clics</span>
            </div>
          </div>
        </div>
        {showActions && (
          <div className="flex gap-2">
            <Button size="sm" className="flex-1 h-8 text-xs bg-green-600 hover:bg-green-700" onClick={() => handleValider(pub)} disabled={processing}>
              <CheckCircle2 className="h-3 w-3 mr-1" /> Valider
            </Button>
            <Button size="sm" variant="outline" className="flex-1 h-8 text-xs border-red-300 text-red-600" onClick={() => { setSelected({ pub, mode: "reject" }); setMotif(""); }}>
              <XCircle className="h-3 w-3 mr-1" /> Refuser
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const totalCodesUsed = codes.reduce((s, c) => s + (c.nombre_utilisations || 0), 0);
  const totalGains = codes.reduce((s, c) => s + (c.commission_due || 0), 0);

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/staff")}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Publicités & Commerciaux</h1>
          <p className="text-xs text-muted-foreground">Pubs & codes promo</p>
        </div>
        <Button variant="ghost" size="icon" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StaffStatCard label="Pubs en attente" value={pending.length} color="text-yellow-600" icon={Megaphone} />
        <StaffStatCard label="Pubs actives" value={active.length} color="text-green-600" icon={Megaphone} />
        <StaffStatCard label="Codes utilisés" value={totalCodesUsed} color="text-blue-600" icon={BarChart3} />
        <StaffStatCard label="Gains générés" value={`${totalGains.toLocaleString()} F`} color="text-purple-600" icon={BarChart3} />
      </div>

      <Tabs defaultValue="pending">
        <TabsList className="w-full grid grid-cols-3 text-[10px]">
          <TabsTrigger value="pending">⏳ Attente ({pending.length})</TabsTrigger>
          <TabsTrigger value="active">✅ Actives ({active.length})</TabsTrigger>
          <TabsTrigger value="commerciaux">📣 Commerciaux ({codes.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="pending" className="space-y-3 mt-4">
          {pending.length === 0 ? <p className="text-center text-sm text-muted-foreground py-8">Aucune donnée disponible</p> : pending.map(p => <PubCard key={p.id} pub={p} showActions />)}
        </TabsContent>
        <TabsContent value="active" className="space-y-3 mt-4">
          {active.length === 0 ? <p className="text-center text-sm text-muted-foreground py-8">Aucune donnée disponible</p> : active.map(p => <PubCard key={p.id} pub={p} />)}
        </TabsContent>
        <TabsContent value="commerciaux" className="space-y-3 mt-4">
          {codes.map(c => (
            <Card key={c.id} className="shadow-sm">
              <CardContent className="p-3 flex items-center justify-between">
                <div>
                  <p className="font-bold text-sm">{c.commercial_name || c.commercial_email}</p>
                  <p className="text-xs text-muted-foreground">Code : <strong>{c.code}</strong></p>
                  <p className="text-xs text-muted-foreground">{c.nombre_utilisations || 0} utilisations · {(c.commission_due || 0).toLocaleString()} F gains</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${c.actif ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>{c.actif ? "Actif" : "Inactif"}</span>
              </CardContent>
            </Card>
          ))}
          {codes.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Aucune donnée disponible</p>}
        </TabsContent>
      </Tabs>

      <Dialog open={!!(selected?.mode === "reject")} onOpenChange={v => { if (!v) { setSelected(null); setMotif(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Motif de refus</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Veuillez préciser la raison du refus</p>
            <textarea className="w-full border rounded-xl p-3 text-sm h-24 focus:outline-none focus:ring-2 focus:ring-primary" placeholder="Raison du refus…" value={motif} onChange={e => setMotif(e.target.value)} />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setSelected(null)}>Annuler</Button>
              <Button variant="destructive" className="flex-1" onClick={() => handleRefuser(selected.pub)} disabled={processing}>
                {processing ? "En cours…" : "Confirmer le refus"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}