import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, AlertTriangle, Phone, MessageCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import moment from "moment";

const ISSUE_LABELS = {
  livreur_en_retard: "⏰ Livreur en retard",
  livreur_introuvable: "🔍 Livreur introuvable",
  mauvais_comportement: "😡 Mauvais comportement",
  colis_non_recupere: "📦 Colis non récupéré",
  colis_non_livre: "🚫 Colis non livré",
  probleme_paiement: "💳 Problème paiement",
  mauvaise_destination: "📍 Mauvaise destination",
  erreur_montant: "💰 Erreur montant",
  annulation_injustifiee: "❌ Annulation injustifiée",
  autre: "❓ Autre",
};

const STATUS_CFG = {
  nouveau: { label: "Nouveau", color: "bg-red-100 text-red-700" },
  en_traitement: { label: "En traitement", color: "bg-amber-100 text-amber-700" },
  resolu: { label: "Résolu", color: "bg-green-100 text-green-700" },
  rejete: { label: "Rejeté", color: "bg-gray-100 text-gray-500" },
};

const URGENCY_CFG = {
  normal: { label: "Normal", color: "bg-gray-100 text-gray-600" },
  urgent: { label: "🔴 Urgent", color: "bg-orange-100 text-orange-700" },
  critique: { label: "🚨 Critique", color: "bg-red-100 text-red-700" },
};

export default function GestionSignalements() {
  const navigate = useNavigate();
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState("tous");
  const [selected, setSelected] = useState(null);
  const [adminNote, setAdminNote] = useState("");
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    const data = await base44.entities.CourseIssue.list("-created_date", 200);
    setIssues(data || []);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    const unsub = base44.entities.CourseIssue.subscribe(() => loadData());
    return unsub;
  }, []);

  const updateStatus = async (id, status) => {
    setSaving(true);
    const me = await base44.auth.me();
    const update = { status };
    if (status === "resolu") { update.resolved_at = new Date().toISOString(); update.resolved_by = me.email; }
    if (adminNote.trim()) update.admin_notes = adminNote.trim();
    await base44.entities.CourseIssue.update(id, update);

    // Notifier le client
    const issue = issues.find(i => i.id === id);
    if (issue) {
      const msg = status === "resolu"
        ? "Votre signalement a été résolu. Merci pour votre retour."
        : status === "en_traitement"
        ? "Votre signalement est en cours de traitement par notre équipe."
        : "Votre signalement a été examiné.";
      try {
        await base44.entities.Notification.create({
          destinataire_email: issue.client_email,
          destinataire_role: "client",
          titre: status === "resolu" ? "✅ Signalement résolu" : "📋 Signalement mis à jour",
          message: msg,
          type: status === "resolu" ? "success" : "info",
          lue: false,
        });
      } catch (_) {}
    }

    toast.success("Statut mis à jour");
    setSelected(null);
    setAdminNote("");
    setSaving(false);
    loadData();
  };

  const filtered = issues.filter(i => {
    if (filtre === "tous") return true;
    if (filtre === "urgent") return i.urgency === "urgent" || i.urgency === "critique";
    return i.status === filtre;
  }).sort((a, b) => {
    // Critique/urgent en premier
    const urg = { critique: 0, urgent: 1, normal: 2 };
    return (urg[a.urgency] ?? 2) - (urg[b.urgency] ?? 2);
  });

  const nouveaux = issues.filter(i => i.status === "nouveau").length;

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Signalements courses
          </h1>
          <p className="text-xs text-muted-foreground">{nouveaux} nouveau{nouveaux > 1 ? "x" : ""} à traiter</p>
        </div>
        <Button variant="outline" size="icon" onClick={loadData}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Filtres */}
      <div className="flex gap-2 overflow-x-auto pb-1 px-1">
        {[
          { val: "tous", label: `Tous (${issues.length})` },
          { val: "nouveau", label: `🆕 Nouveaux (${issues.filter(i => i.status === "nouveau").length})` },
          { val: "urgent", label: "🔴 Urgents" },
          { val: "en_traitement", label: "En traitement" },
          { val: "resolu", label: "✅ Résolus" },
          { val: "rejete", label: "Rejetés" },
        ].map(f => (
          <button key={f.val} onClick={() => setFiltre(f.val)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-all flex-shrink-0 ${filtre === f.val ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Aucun signalement</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(issue => {
            const urg = URGENCY_CFG[issue.urgency] || URGENCY_CFG.normal;
            const st = STATUS_CFG[issue.status] || STATUS_CFG.nouveau;
            const attachments = (() => { try { return JSON.parse(issue.attachments || "[]"); } catch { return []; } })();
            return (
              <Card key={issue.id} className={`${issue.urgency === "critique" ? "border-red-400" : issue.urgency === "urgent" ? "border-orange-300" : ""} cursor-pointer`}
                onClick={() => { setSelected(issue); setAdminNote(issue.admin_notes || ""); }}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{ISSUE_LABELS[issue.issue_type] || issue.issue_type}</p>
                      <p className="text-xs text-muted-foreground">
                        #{issue.course_id?.slice(0,8)} • {issue.course_quartier_depart} → {issue.course_quartier_arrivee}
                      </p>
                      <p className="text-xs text-muted-foreground">{issue.client_name} • {moment(issue.created_date).fromNow()}</p>
                    </div>
                    <div className="flex flex-col gap-1 items-end flex-shrink-0">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${st.color}`}>{st.label}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${urg.color}`}>{urg.label}</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{issue.description}</p>
                  {attachments.length > 0 && (
                    <div className="flex gap-1">
                      {attachments.slice(0, 3).map((url, i) => (
                        <img key={i} src={url} alt="" className="h-10 w-10 rounded object-cover border" />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog détail */}
      <Dialog open={!!selected} onOpenChange={() => { setSelected(null); setAdminNote(""); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Signalement #{selected?.id?.slice(0,8)}</DialogTitle>
          </DialogHeader>
          {selected && (() => {
            const attachments = (() => { try { return JSON.parse(selected.attachments || "[]"); } catch { return []; } })();
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded-lg bg-muted/40 space-y-0.5">
                    <p className="font-semibold">👤 Client</p>
                    <p>{selected.client_name}</p>
                    <p className="text-muted-foreground">{selected.client_email}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/40 space-y-0.5">
                    <p className="font-semibold">🛵 Livreur</p>
                    <p>{selected.livreur_name || "Non assigné"}</p>
                    <p className="text-muted-foreground">{selected.livreur_email || "—"}</p>
                  </div>
                </div>

                <div className="p-3 rounded-xl border space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span className="font-medium">{ISSUE_LABELS[selected.issue_type]}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Course</span><span className="font-medium">#{selected.course_id?.slice(0,8)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Trajet</span><span className="font-medium text-right text-xs">{selected.course_quartier_depart} → {selected.course_quartier_arrivee}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Prix course</span><span className="font-medium">{(selected.course_prix||0).toLocaleString()} F</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Statut course</span><span className="font-medium">{selected.course_statut_at_report}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Urgence</span><span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${(URGENCY_CFG[selected.urgency]||URGENCY_CFG.normal).color}`}>{(URGENCY_CFG[selected.urgency]||URGENCY_CFG.normal).label}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span className="font-medium">{moment(selected.created_date).format("DD/MM/YYYY HH:mm")}</span></div>
                </div>

                <div className="p-3 rounded-xl bg-muted/30 text-sm">
                  <p className="font-semibold mb-1">Description :</p>
                  <p className="text-muted-foreground">{selected.description}</p>
                </div>

                {attachments.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">Pièces jointes :</p>
                    <div className="flex gap-2 flex-wrap">
                      {attachments.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noreferrer">
                          <img src={url} alt="" className="h-20 w-20 rounded-lg object-cover border hover:opacity-80" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Contacts rapides */}
                <div className="flex gap-2">
                  {selected.client_email && (
                    <a href={`mailto:${selected.client_email}`} className="flex-1">
                      <Button variant="outline" className="w-full text-xs h-9 gap-1.5">
                        <MessageCircle className="h-3.5 w-3.5" /> Contact client
                      </Button>
                    </a>
                  )}
                  {selected.livreur_email && (
                    <a href={`mailto:${selected.livreur_email}`} className="flex-1">
                      <Button variant="outline" className="w-full text-xs h-9 gap-1.5">
                        <Phone className="h-3.5 w-3.5" /> Contact livreur
                      </Button>
                    </a>
                  )}
                </div>

                {/* Note admin */}
                <div className="space-y-1">
                  <p className="text-sm font-semibold">Note interne</p>
                  <textarea
                    className="w-full border rounded-xl px-3 py-2 text-sm min-h-[70px] resize-none focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                    placeholder="Note admin..."
                    value={adminNote}
                    onChange={e => setAdminNote(e.target.value)}
                  />
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2 gap-2">
                  {selected.status === "nouveau" && (
                    <Button variant="outline" className="border-amber-300 text-amber-700 text-xs h-9"
                      onClick={() => updateStatus(selected.id, "en_traitement")} disabled={saving}>
                      🔄 En traitement
                    </Button>
                  )}
                  {["nouveau", "en_traitement"].includes(selected.status) && (
                    <Button className="bg-green-600 hover:bg-green-700 text-xs h-9"
                      onClick={() => updateStatus(selected.id, "resolu")} disabled={saving}>
                      ✅ Résoudre
                    </Button>
                  )}
                  {["nouveau", "en_traitement"].includes(selected.status) && (
                    <Button variant="outline" className="border-gray-300 text-gray-600 text-xs h-9"
                      onClick={() => updateStatus(selected.id, "rejete")} disabled={saving}>
                      ❌ Rejeter
                    </Button>
                  )}
                  {selected.status === "resolu" && (
                    <div className="col-span-2 text-center text-sm text-green-600 font-medium py-2">
                      ✅ Résolu le {moment(selected.resolved_at).format("DD/MM/YYYY")}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}