import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Camera, CheckCircle2, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";

const DOCS = [
  { key: "photo_profil", label: "Photo de profil", desc: "Selfie clair, visage visible", emoji: "🤳" },
  { key: "photo_identite_recto", label: "CNI – Recto", desc: "Face avant de votre carte d'identité", emoji: "🪪" },
  { key: "photo_identite_verso", label: "CNI – Verso", desc: "Face arrière de votre carte d'identité", emoji: "🪪" },
  { key: "photo_moyen_deplacement", label: "Moyen de déplacement", desc: "Photo de votre moto ou véhicule", emoji: "🛵" },
];

export default function LivreurDocuments({ onComplete }) {
  const [files, setFiles] = useState({});
  const [previews, setPreviews] = useState({});
  const [uploading, setUploading] = useState(false);

  const handleFile = (key, file) => {
    if (!file) return;
    setFiles(prev => ({ ...prev, [key]: file }));
    const url = URL.createObjectURL(file);
    setPreviews(prev => ({ ...prev, [key]: url }));
  };

  const completed = DOCS.filter(d => files[d.key]).length;
  const allDone = completed === DOCS.length;

  const handleSubmit = async () => {
    if (!allDone) {
      toast.error("Veuillez fournir tous les documents");
      return;
    }
    setUploading(true);
    try {
      const uploads = await Promise.all(
        DOCS.map(d => base44.integrations.Core.UploadFile({ file: files[d.key] }))
      );
      const docUrls = {};
      DOCS.forEach((d, i) => { docUrls[d.key] = uploads[i].file_url; });
      await base44.auth.updateMe({ ...docUrls, docs_envoyes: true });
      // Notifier les admins
      try {
        const me = await base44.auth.me();
        await base44.functions.invoke('notifyAdminNewSignup', {
          entity_name: 'Livreur',
          entity_data: { nom_complet: me.full_name, telephone: me.telephone, quartier: me.quartier },
        });
      } catch (_) {}
      toast.success("Documents envoyés ! Votre dossier est en cours d'examen.");
      onComplete();
    } catch (err) {
      toast.error("Erreur lors de l'upload : " + err.message);
    }
    setUploading(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col p-4">
      <div className="max-w-sm mx-auto w-full space-y-5 py-6">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="h-16 w-16 rounded-2xl bg-primary flex items-center justify-center mx-auto">
            <Camera className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-xl font-bold">Complétez votre dossier</h1>
          <p className="text-sm text-muted-foreground">
            Envoyez vos documents pour activer votre compte livreur
          </p>
        </div>

        {/* Barre de progression */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Progression</span>
            <span className="font-semibold text-primary">{completed}/{DOCS.length} documents</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${(completed / DOCS.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Documents */}
        <div className="space-y-3">
          {DOCS.map(doc => {
            const hasFile = !!files[doc.key];
            const preview = previews[doc.key];
            return (
              <div key={doc.key} className={`rounded-xl border-2 overflow-hidden transition-all ${
                hasFile ? "border-primary" : "border-border"
              }`}>
                <div className="p-3 flex items-center gap-3">
                  <span className="text-2xl flex-shrink-0">{doc.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{doc.label}</p>
                    <p className="text-xs text-muted-foreground">{doc.desc}</p>
                  </div>
                  {hasFile && <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />}
                </div>

                {/* Aperçu */}
                {preview && (
                  <div className="relative">
                    <img src={preview} alt={doc.label} className="w-full h-32 object-cover" />
                    <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                      <span className="text-white text-xs font-medium bg-black/50 px-2 py-1 rounded">Remplacer</span>
                    </div>
                  </div>
                )}

                {/* Bouton upload */}
                <div className="px-3 pb-3">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    id={`doc_${doc.key}`}
                    onChange={e => handleFile(doc.key, e.target.files[0])}
                  />
                  <label
                    htmlFor={`doc_${doc.key}`}
                    className={`flex items-center justify-center gap-2 w-full py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${
                      hasFile
                        ? "bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20"
                        : "bg-muted text-foreground border border-border hover:bg-muted/80"
                    }`}
                  >
                    <Camera className="h-4 w-4" />
                    {hasFile ? "📷 Remplacer la photo" : "📷 Prendre ou choisir une photo"}
                  </label>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bouton envoi */}
        <Button
          className="w-full h-12 text-base font-semibold"
          disabled={!allDone || uploading}
          onClick={handleSubmit}
        >
          {uploading ? (
            <><Loader2 className="h-5 w-5 animate-spin mr-2" />Upload en cours…</>
          ) : (
            <>
              <Upload className="h-5 w-5 mr-2" />
              Envoyer mon dossier ({completed}/{DOCS.length})
            </>
          )}
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          🔒 Vos documents sont sécurisés et utilisés uniquement pour la vérification de votre identité
        </p>

        <button
          className="w-full text-xs text-muted-foreground underline text-center"
          onClick={() => base44.auth.logout()}
        >
          Se déconnecter
        </button>
      </div>
    </div>
  );
}