import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, CheckCircle2, XCircle, FileText, Loader2, RefreshCw, Eye, AlertCircle, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import StaffStatCard from "@/components/StaffStatCard";
import { Truck } from "lucide-react";
import moment from "moment";

async function logAction(actor, action, target, details) {
  await base44.entities.AuditLog.create({ actorEmail: actor.email, actorName: actor.full_name, actorRoleLabel: "Validateur Livreurs", actionType: action, targetType: "driver", targetId: target.id, targetName: target.name, details }).catch(() => {});
}

export default function LivreurValidator() {
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [users, setUsers] = useState([]);
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
      if (!perms[0]?.canViewDriverRequests) { toast.error("Accès refusé"); navigate("/staff"); return; }
    }
    const profs = await base44.entities.UserProfile.filter({ profile_type: "livreur", deleted: false });
    setProfiles(profs);
    setLoading(false);
  };

  useEffect(() => { load().catch(() => setLoading(false)); }, []);

  const pending = profiles.filter(p => p.status === "en_attente");
  const incomplete = profiles.filter(p => p.status === "incomplet");
  const validated = profiles.filter(p => p.status === "actif");
  const suspended = profiles.filter(p => p.status === "suspendu");

  const handleValider = async (prof) => {
    if (!window.confirm("Confirmer cette action ?")) return;
    setProcessing(true);
    const now = new Date().toISOString();
    await base44.entities.UserProfile.update(prof.id, { status: "actif", validated_at: now, validated_by: me.email });
    const userList = await base44.entities.User.filter({ email: prof.user_email });
    if (userList.length > 0) await base44.entities.User.update(userList[0].id, { statut_validation_livreur: "valide", profil_valide: true, actif: true });
    await base44.entities.Notification.create({ destinataire_email: prof.user_email, destinataire_role: "livreur", titre: "✅ Profil livreur validé !", message: "Votre profil a été validé. Vous pouvez maintenant recevoir des courses.", type: "success", lue: false });
    await logAction(me, "DRIVER_VALIDATED", { id: prof.id, name: prof.user_email }, "Dossier validé");
    toast.success("Opération effectuée avec succès");
    setSelected(null); load();
    setProcessing(false);
  };

  const handleRefuser = async (prof) => {
    if (!motif.trim()) { toast.error("Veuillez préciser la raison du refus"); return; }
    setProcessing(true);
    await base44.entities.UserProfile.update(prof.id, { status: "refuse", refusal_reason: motif });
    await base44.entities.Notification.create({ destinataire_email: prof.user_email, destinataire_role: "livreur", titre: "❌ Profil livreur refusé", message: `Motif : ${motif}. Corrigez votre dossier et resoumettez.`, type: "danger", lue: false });
    await logAction(me, "DRIVER_REJECTED", { id: prof.id, name: prof.user_email }, motif);
    toast.success("Opération effectuée avec succès");
    setSelected(null); setMotif(""); load();
    setProcessing(false);
  };

  const handleSuspendre = async (prof) => {
    if (!window.confirm("Confirmer cette action ?")) return;
    await base44.entities.UserProfile.update(prof.id, { status: "suspendu", suspended_at: new Date().toISOString() });
    await logAction(me, "DRIVER_SUSPENDED", { id: prof.id, name: prof.user_email }, "Suspendu par validateur");
    toast.success("Opération effectuée avec succès"); load();
  };

  const handleDemanderDocs = async (prof) => {
    await base44.entities.Notification.create({ destinataire_email: prof.user_email, destinataire_role: "livreur", titre: "📋 Documents manquants", message: "L'équipe CDL vous demande de compléter vos documents de validation (pièce d'identité, photo moto…).", type: "warning", lue: false });
    toast.success("Notification envoyée au livreur");
  };

  const ProfileCard = ({ prof, actions = [] }) => {
    const docs = prof.documents_json ? (() => { try { return JSON.parse(prof.documents_json); } catch { return {}; } })() : {};
    const hasDocs = !!(docs.photo_identite_recto && docs.photo_profil);
    return (
      <Card className="shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-bold text-sm">{prof.user_email}</p>
              <p className="text-xs text-muted-foreground">{moment(prof.created_date).format("DD/MM/YYYY HH:mm")}</p>
            </div>
            <div className="flex gap-1">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${hasDocs ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                {hasDocs ? "Complet" : "Incomplet"}
              </span>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSelected({ prof, mode: "view" })}>
              <Eye className="h-3 w-3 mr-1" /> Voir dossier
            </Button>
            {actions.includes("validate") && (
              <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700" onClick={() => handleValider(prof)} disabled={processing}>
                <CheckCircle2 className="h-3 w-3 mr-1" /> Valider
              </Button>
            )}
            {actions.includes("reject") && (
              <Button size="sm" variant="outline" className="h-7 text-xs border-red-300 text-red-600" onClick={() => setSelected({ prof, mode: "reject" })}>
                <XCircle className="h-3 w-3 mr-1" /> Refuser
              </Button>
            )}
            {actions.includes("docs") && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleDemanderDocs(prof)}>
                <FileText className="h-3 w-3 mr-1" /> Demander docs
              </Button>
            )}
            {actions.includes("suspend") && (
              <Button size="sm" variant="outline" className="h-7 text-xs border-orange-300 text-orange-600" onClick={() => handleSuspendre(prof)}>
                Suspendre
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/staff")}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Validation des livreurs</h1>
          <p className="text-xs text-muted-foreground">Dossiers & approbations</p>
        </div>
        <Button variant="ghost" size="icon" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StaffStatCard label="En attente" value={pending.length} color="text-orange-600" icon={Truck} />
        <StaffStatCard label="Incomplets" value={incomplete.length} color="text-red-600" icon={AlertCircle} />
        <StaffStatCard label="Validés" value={validated.length} color="text-green-600" icon={CheckCircle2} />
        <StaffStatCard label="Suspendus" value={suspended.length} color="text-slate-600" icon={Truck} />
      </div>

      <Tabs defaultValue="pending">
        <TabsList className="w-full grid grid-cols-4 text-[10px]">
          <TabsTrigger value="pending">⏳ Attente ({pending.length})</TabsTrigger>
          <TabsTrigger value="incomplete">⚠️ Incomplet</TabsTrigger>
          <TabsTrigger value="validated">✅ Validés</TabsTrigger>
          <TabsTrigger value="suspended">🔒 Suspendus</TabsTrigger>
        </TabsList>
        <TabsContent value="pending" className="space-y-3 mt-4">
          {pending.length === 0 ? <p className="text-center text-sm text-muted-foreground py-8">Aucune donnée disponible</p> : pending.map(p => <ProfileCard key={p.id} prof={p} actions={["validate","reject","docs"]} />)}
        </TabsContent>
        <TabsContent value="incomplete" className="space-y-3 mt-4">
          {incomplete.length === 0 ? <p className="text-center text-sm text-muted-foreground py-8">Aucune donnée disponible</p> : incomplete.map(p => <ProfileCard key={p.id} prof={p} actions={["docs","reject"]} />)}
        </TabsContent>
        <TabsContent value="validated" className="space-y-3 mt-4">
          {validated.length === 0 ? <p className="text-center text-sm text-muted-foreground py-8">Aucune donnée disponible</p> : validated.map(p => <ProfileCard key={p.id} prof={p} actions={["suspend"]} />)}
        </TabsContent>
        <TabsContent value="suspended" className="space-y-3 mt-4">
          {suspended.length === 0 ? <p className="text-center text-sm text-muted-foreground py-8">Aucune donnée disponible</p> : suspended.map(p => <ProfileCard key={p.id} prof={p} actions={["validate"]} />)}
        </TabsContent>
      </Tabs>

      <Dialog open={!!selected} onOpenChange={v => { if (!v) { setSelected(null); setMotif(""); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selected?.mode === "view" ? "Dossier du livreur" : "Motif de refus"}</DialogTitle>
          </DialogHeader>
          {selected?.mode === "view" && (() => {
            const docs = selected.prof.documents_json ? (() => { try { return JSON.parse(selected.prof.documents_json); } catch { return {}; } })() : {};
            return (
              <div className="space-y-4">
                <div className="p-3 rounded-xl bg-muted/40">
                  <p className="text-sm font-semibold">Informations personnelles</p>
                  <p className="text-xs text-muted-foreground mt-1">{selected.prof.user_email}</p>
                  <p className="text-xs text-muted-foreground">Créé le {moment(selected.prof.created_date).format("DD/MM/YYYY")}</p>
                </div>
                <p className="text-sm font-semibold">Pièces jointes</p>
                <div className="grid grid-cols-2 gap-2">
                  {[["photo_profil","Photo profil"],["photo_identite_recto","CNI Recto"],["photo_identite_verso","CNI Verso"],["photo_moto","Photo moto"]].map(([key, label]) => (
                    <div key={key} className="rounded-xl border overflow-hidden">
                      {docs[key] ? (
                        <a href={docs[key]} target="_blank" rel="noreferrer">
                          <img src={docs[key]} alt={label} className="w-full h-20 object-cover hover:opacity-80" />
                        </a>
                      ) : (
                        <div className="h-20 bg-muted flex items-center justify-center"><p className="text-[10px] text-muted-foreground">Non fourni</p></div>
                      )}
                      <p className="text-[10px] text-center py-1 text-muted-foreground">{label}</p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => handleValider(selected.prof)} disabled={processing}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Valider
                  </Button>
                  <Button variant="outline" className="flex-1 border-red-300 text-red-600" onClick={() => setSelected({ ...selected, mode: "reject" })}>
                    <XCircle className="h-4 w-4 mr-1" /> Refuser
                  </Button>
                </div>
              </div>
            );
          })()}
          {selected?.mode === "reject" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Veuillez préciser la raison du refus</p>
              <textarea className="w-full border rounded-xl p-3 text-sm h-24 focus:outline-none focus:ring-2 focus:ring-primary" placeholder="Raison du refus..." value={motif} onChange={e => setMotif(e.target.value)} />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setSelected(null)}>Annuler</Button>
                <Button variant="destructive" className="flex-1" onClick={() => handleRefuser(selected.prof)} disabled={processing}>
                  {processing ? "En cours..." : "Confirmer le refus"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}