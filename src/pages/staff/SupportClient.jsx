import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Headphones, MessageCircle, CheckCircle2, ArrowUpCircle, Loader2, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import StaffStatCard from "@/components/StaffStatCard";
import moment from "moment";

const URGENCY_COLORS = { normal: "bg-gray-100 text-gray-700", urgent: "bg-orange-100 text-orange-700", critique: "bg-red-100 text-red-700" };
const STATUS_COLORS = { nouveau: "bg-blue-100 text-blue-700", en_traitement: "bg-amber-100 text-amber-700", resolu: "bg-green-100 text-green-700", rejete: "bg-gray-100 text-gray-600" };
const ISSUE_LABELS = { livreur_en_retard: "Livreur en retard", livreur_introuvable: "Livreur introuvable", mauvais_comportement: "Mauvais comportement", colis_non_recupere: "Colis non récupéré", colis_non_livre: "Colis non livré", probleme_paiement: "Problème paiement", autre: "Autre" };

async function logAction(actor, action, target, details) {
  await base44.entities.AuditLog.create({ actorEmail: actor.email, actorName: actor.full_name, actorRoleLabel: "Support Client", actionType: action, targetType: "complaint", targetId: target.id, targetName: target.name, details }).catch(() => {});
}

export default function SupportClient() {
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [processing, setProcessing] = useState(false);
  const [search, setSearch] = useState("");

  const load = async () => {
    const actor = await base44.auth.me();
    setMe(actor);
    const isAdmin = actor?.role === "admin" || actor?.email === "weezyh2@gmail.com";
    if (!isAdmin) {
      const perms = await base44.entities.StaffPermission.filter({ userEmail: actor.email, isActive: true });
      if (!perms[0]?.canViewComplaints) { toast.error("Accès refusé"); navigate("/staff"); return; }
    }
    const data = await base44.entities.CourseIssue.list("-created_date", 200);
    setIssues(data); setLoading(false);
  };

  useEffect(() => { load().catch(() => setLoading(false)); }, []);

  const handleUpdateStatus = async (issue, status, actionType) => {
    if (!window.confirm("Confirmer cette action ?")) return;
    await base44.entities.CourseIssue.update(issue.id, { status, resolved_at: status === "resolu" ? new Date().toISOString() : undefined, resolved_by: status === "resolu" ? me.email : undefined });
    await logAction(me, actionType, { id: issue.id, name: issue.client_name || issue.client_email }, `Statut → ${status}`);
    toast.success("Opération effectuée avec succès");
    load(); setSelected(null);
  };

  const handleReply = async (issue) => {
    if (!replyText.trim()) { toast.error("Veuillez saisir une réponse"); return; }
    setProcessing(true);
    await base44.entities.CourseIssue.update(issue.id, { status: "en_traitement", admin_notes: (issue.admin_notes ? issue.admin_notes + "\n" : "") + `[${me.full_name} - ${new Date().toLocaleTimeString()}] ${replyText}` });
    await base44.entities.Notification.create({ destinataire_email: issue.client_email, destinataire_role: "client", titre: "📩 Réponse à votre signalement", message: replyText, type: "info", lue: false, course_id: issue.course_id });
    await logAction(me, "COMPLAINT_RESPONDED", { id: issue.id, name: issue.client_name || issue.client_email }, replyText);
    toast.success("Réponse envoyée avec succès");
    setReplyText(""); load(); setSelected({ ...issue, status: "en_traitement" });
    setProcessing(false);
  };

  const filtered = issues.filter(i => {
    if (!search) return true;
    const q = search.toLowerCase();
    return i.client_name?.toLowerCase().includes(q) || i.client_email?.toLowerCase().includes(q) || i.course_id?.includes(q);
  });

  const open = filtered.filter(i => ["nouveau", "en_traitement"].includes(i.status));
  const closed = filtered.filter(i => ["resolu", "rejete"].includes(i.status));

  const IssueCard = ({ issue }) => (
    <Card className={`shadow-sm cursor-pointer hover:shadow-md transition-shadow ${issue.urgency === "critique" ? "border-red-300" : ""}`} onClick={() => setSelected(issue)}>
      <CardContent className="p-4 space-y-2">
        <div className="flex justify-between items-start">
          <div>
            <p className="font-bold text-sm">{issue.client_name || issue.client_email}</p>
            <p className="text-xs text-muted-foreground">{ISSUE_LABELS[issue.issue_type] || issue.issue_type}</p>
            <p className="text-xs text-muted-foreground">{moment(issue.created_date).format("DD/MM HH:mm")}</p>
          </div>
          <div className="flex flex-col gap-1 items-end">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[issue.status] || "bg-muted text-muted-foreground"}`}>{issue.status}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${URGENCY_COLORS[issue.urgency || "normal"]}`}>{issue.urgency || "normal"}</span>
          </div>
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
          <h1 className="text-xl font-bold">Support client</h1>
          <p className="text-xs text-muted-foreground">Réclamations & incidents</p>
        </div>
        <Button variant="ghost" size="icon" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StaffStatCard label="Réclamations ouvertes" value={open.length} color="text-red-600" icon={Headphones} />
        <StaffStatCard label="Résolues" value={closed.filter(i => i.status === "resolu").length} color="text-green-600" icon={CheckCircle2} />
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input type="text" placeholder="Rechercher client, course…" value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 border rounded-xl py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white" />
      </div>

      <Tabs defaultValue="open">
        <TabsList className="w-full">
          <TabsTrigger value="open" className="flex-1">Ouvertes ({open.length})</TabsTrigger>
          <TabsTrigger value="closed" className="flex-1">Traitées ({closed.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="open" className="space-y-3 mt-4">
          {open.length === 0 ? <p className="text-center text-sm text-muted-foreground py-8">Aucune donnée disponible</p> : open.map(i => <IssueCard key={i.id} issue={i} />)}
        </TabsContent>
        <TabsContent value="closed" className="space-y-3 mt-4">
          {closed.length === 0 ? <p className="text-center text-sm text-muted-foreground py-8">Aucune donnée disponible</p> : closed.map(i => <IssueCard key={i.id} issue={i} />)}
        </TabsContent>
      </Tabs>

      <Dialog open={!!selected} onOpenChange={v => { if (!v) { setSelected(null); setReplyText(""); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Détail de la réclamation</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="space-y-2 p-3 rounded-xl bg-muted/40 text-sm">
                <p><strong>Client :</strong> {selected.client_name || selected.client_email}</p>
                <p><strong>Type :</strong> {ISSUE_LABELS[selected.issue_type] || selected.issue_type}</p>
                <p><strong>Urgence :</strong> {selected.urgency || "normal"}</p>
                <p><strong>Course :</strong> #{selected.course_id?.slice(0, 8)}</p>
                <p className="text-muted-foreground">{selected.description}</p>
              </div>
              {selected.admin_notes && (
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs">
                  <p className="font-semibold mb-1">Notes / réponses :</p>
                  <pre className="whitespace-pre-wrap">{selected.admin_notes}</pre>
                </div>
              )}
              <textarea className="w-full border rounded-xl p-3 text-sm h-24 focus:outline-none focus:ring-2 focus:ring-primary" placeholder="Votre réponse au client…" value={replyText} onChange={e => setReplyText(e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <Button className="bg-blue-600 hover:bg-blue-700 text-xs" onClick={() => handleReply(selected)} disabled={processing}>
                  <MessageCircle className="h-3 w-3 mr-1" /> Répondre
                </Button>
                <Button variant="outline" className="border-orange-300 text-orange-700 text-xs" onClick={() => handleUpdateStatus(selected, "en_traitement", "COMPLAINT_ESCALATED")}>
                  <ArrowUpCircle className="h-3 w-3 mr-1" /> Escalader
                </Button>
                <Button className="bg-green-600 hover:bg-green-700 text-xs col-span-2" onClick={() => handleUpdateStatus(selected, "resolu", "COMPLAINT_CLOSED")}>
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Clôturer — Réclamation traitée
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}