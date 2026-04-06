import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";

const ISSUE_TYPES = [
  { value: "livreur_en_retard", label: "⏰ Livreur en retard" },
  { value: "livreur_introuvable", label: "🔍 Livreur introuvable" },
  { value: "mauvais_comportement", label: "😡 Mauvais comportement" },
  { value: "colis_non_recupere", label: "📦 Colis non récupéré" },
  { value: "colis_non_livre", label: "🚫 Colis non livré" },
  { value: "probleme_paiement", label: "💳 Problème de paiement" },
  { value: "mauvaise_destination", label: "📍 Mauvaise destination" },
  { value: "erreur_montant", label: "💰 Erreur de montant" },
  { value: "annulation_injustifiee", label: "❌ Annulation injustifiée" },
  { value: "autre", label: "❓ Autre" },
];

const URGENCY_LEVELS = [
  { value: "normal", label: "Normal", color: "border-gray-300 text-gray-700" },
  { value: "urgent", label: "🔴 Urgent", color: "border-orange-400 text-orange-700" },
  { value: "critique", label: "🚨 Critique", color: "border-red-500 text-red-700" },
];

export default function ReportIssueModal({ open, onOpenChange, course, user }) {
  const [issueType, setIssueType] = useState("");
  const [description, setDescription] = useState("");
  const [urgency, setUrgency] = useState("normal");
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    const urls = [];
    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) { toast.error("Fichier trop grand (max 5MB)"); continue; }
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      urls.push(file_url);
    }
    setAttachments(prev => [...prev, ...urls]);
    setUploading(false);
  };

  const handleSubmit = async () => {
    if (!issueType) { toast.error("Sélectionnez un type de problème"); return; }
    if (!description.trim()) { toast.error("La description est obligatoire"); return; }
    setSending(true);

    const issue = await base44.entities.CourseIssue.create({
      course_id: course.id,
      client_email: user?.email || course.client_email,
      client_name: user?.full_name || course.client_name,
      livreur_email: course.livreur_email || null,
      livreur_name: course.livreur_name || null,
      issue_type: issueType,
      description: description.trim(),
      urgency,
      attachments: attachments.length ? JSON.stringify(attachments) : null,
      status: "nouveau",
      course_statut_at_report: course.statut,
      course_prix: course.prix || 0,
      course_quartier_depart: course.quartier_depart,
      course_quartier_arrivee: course.quartier_arrivee,
    });

    // Notification admin
    const urgencyLabel = { normal: "", urgent: "🔴 URGENT : ", critique: "🚨 CRITIQUE : " }[urgency];
    const issueLabel = ISSUE_TYPES.find(t => t.value === issueType)?.label || issueType;
    try {
      await base44.entities.Notification.create({
        destinataire_email: "admin",
        destinataire_role: "admin",
        titre: `${urgencyLabel}Problème signalé sur course #${course.id?.slice(0,8)}`,
        message: `Client : ${user?.full_name || course.client_name} • Problème : ${issueLabel} • Urgence : ${urgency}\n${description.slice(0, 120)}`,
        type: urgency === "critique" ? "danger" : urgency === "urgent" ? "warning" : "info",
        course_id: course.id,
        target_entity_id: issue.id,
        target_entity_type: "course_issue",
        lue: false,
      });
    } catch (_) {}

    // Notification client
    try {
      await base44.entities.Notification.create({
        destinataire_email: user?.email || course.client_email,
        destinataire_role: "client",
        titre: "✅ Votre signalement a été transmis",
        message: "Votre problème a bien été enregistré. L'administration CDL vous répondra rapidement.",
        type: "success",
        lue: false,
      });
    } catch (_) {}

    setSending(false);
    setSent(true);
  };

  const handleClose = () => {
    setIssueType(""); setDescription(""); setUrgency("normal");
    setAttachments([]); setSent(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Signaler un problème
          </DialogTitle>
        </DialogHeader>

        {sent ? (
          <div className="text-center py-8 space-y-4">
            <div className="text-5xl">✅</div>
            <p className="font-bold text-lg">Signalement envoyé !</p>
            <p className="text-sm text-muted-foreground">L'administration CDL a été notifiée et vous répondra rapidement.</p>
            <Button className="w-full" onClick={handleClose}>Fermer</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-muted/40 text-xs text-muted-foreground">
              Course #{course?.id?.slice(0, 8)} • {course?.quartier_depart} → {course?.quartier_arrivee}
            </div>

            {/* Type */}
            <div className="space-y-2">
              <p className="text-sm font-semibold">Type de problème *</p>
              <div className="grid grid-cols-1 gap-1.5">
                {ISSUE_TYPES.map(t => (
                  <button key={t.value} onClick={() => setIssueType(t.value)}
                    className={`text-left px-3 py-2.5 rounded-lg border text-sm transition-all ${issueType === t.value ? "border-primary bg-primary/10 font-semibold" : "border-border hover:border-primary/50"}`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1">
              <p className="text-sm font-semibold">Description *</p>
              <textarea
                className="w-full border rounded-xl px-3 py-2 text-sm min-h-[90px] resize-none focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                placeholder="Décrivez le problème en détail..."
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>

            {/* Urgence */}
            <div className="space-y-2">
              <p className="text-sm font-semibold">Niveau d'urgence</p>
              <div className="flex gap-2">
                {URGENCY_LEVELS.map(u => (
                  <button key={u.value} onClick={() => setUrgency(u.value)}
                    className={`flex-1 py-2 rounded-lg border-2 text-xs font-semibold transition-all ${urgency === u.value ? u.color + " bg-current/5" : "border-border text-muted-foreground"}`}>
                    {u.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Pièces jointes */}
            <div className="space-y-2">
              <p className="text-sm font-semibold">Pièces jointes (optionnel)</p>
              <div className="flex gap-2">
                <label className="flex-1 cursor-pointer">
                  <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={handleFileChange} disabled={uploading} />
                  <div className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border-2 border-dashed border-primary/40 text-primary text-xs font-medium hover:bg-primary/5">
                    {uploading ? "⏳ Upload..." : "📷 Photo/Caméra"}
                  </div>
                </label>
                <label className="flex-1 cursor-pointer">
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} disabled={uploading} />
                  <div className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border-2 border-dashed border-gray-300 text-gray-600 text-xs font-medium hover:bg-gray-50">
                    🖼️ Galerie
                  </div>
                </label>
              </div>
              {attachments.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {attachments.map((url, i) => (
                    <div key={i} className="relative">
                      <img src={url} alt="" className="h-16 w-16 rounded-lg object-cover border" />
                      <button onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                        className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button className="w-full h-12 font-bold" onClick={handleSubmit} disabled={sending || uploading}>
              {sending ? "Envoi en cours..." : "📤 Envoyer le signalement"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}