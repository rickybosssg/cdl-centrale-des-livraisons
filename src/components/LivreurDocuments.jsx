import { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { CheckCircle2, Upload, Loader2, ShieldCheck, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const DOCS = [
  { key: "photo_profil",            label: "Photo de profil",        desc: "Selfie clair, visage visible",              emoji: "🤳" },
  { key: "photo_identite_recto",    label: "CNI – Recto",            desc: "Face avant de votre carte d'identité",      emoji: "🪪" },
  { key: "photo_identite_verso",    label: "CNI – Verso",            desc: "Face arrière de votre carte d'identité",    emoji: "🪪" },
  { key: "photo_moyen_deplacement", label: "Moyen de déplacement",   desc: "Photo de votre moto ou véhicule",           emoji: "🛵" },
];

function DocUpload({ docKey, hasFile, preview, fileName, onFile }) {
  const camRef = useRef(null);
  const galRef = useRef(null);
  const [debug, setDebug] = useState("");

  const handleChange = (e, source) => {
    const file = e.target.files?.[0];
    if (!file) { setDebug(`❌ Aucun fichier (${source})`); return; }
    setDebug(`✅ ${source}: ${file.name}`);
    onFile(file);
    e.target.value = "";
  };

  const openCamera = () => {
    setDebug("🔄 Ouverture caméra...");
    camRef.current.click();
  };

  const openGallery = () => {
    setDebug("🔄 Ouverture galerie...");
    galRef.current.click();
  };

  return (
    <div style={{ padding: "8px 12px 12px" }}>
      {/* Aperçu */}
      {preview && (
        <img
          src={preview}
          alt="aperçu"
          style={{ width: "100%", height: 100, objectFit: "cover", borderRadius: 8, marginBottom: 8 }}
        />
      )}

      {/* Inputs cachés */}
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => handleChange(e, "caméra")}
      />
      <input
        ref={galRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => handleChange(e, "galerie")}
      />

      {/* Boutons */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={openCamera}
          style={{
            flex: 1, padding: "10px 0", borderRadius: 8,
            border: "1.5px solid #3b82f6", background: "#eff6ff",
            color: "#1d4ed8", fontSize: 13, fontWeight: 700,
            cursor: "pointer", display: "flex", flexDirection: "column",
            alignItems: "center", gap: 4,
            WebkitTapHighlightColor: "rgba(59,130,246,0.2)",
          }}
        >
          <span style={{ fontSize: 22 }}>📷</span>
          Caméra
        </button>

        <button
          type="button"
          onClick={openGallery}
          style={{
            flex: 1, padding: "10px 0", borderRadius: 8,
            border: "1.5px solid #6b7280", background: "#f9fafb",
            color: "#374151", fontSize: 13, fontWeight: 700,
            cursor: "pointer", display: "flex", flexDirection: "column",
            alignItems: "center", gap: 4,
            WebkitTapHighlightColor: "rgba(107,114,128,0.2)",
          }}
        >
          <span style={{ fontSize: 22 }}>🖼️</span>
          Galerie
        </button>
      </div>

      {/* Debug visible */}
      {debug && (
        <p style={{ fontSize: 11, marginTop: 6, color: debug.startsWith("✅") ? "#15803d" : debug.startsWith("❌") ? "#dc2626" : "#b45309", fontWeight: 600, textAlign: "center" }}>
          {debug}
        </p>
      )}
    </div>
  );
}

export default function LivreurDocuments({ onComplete }) {
  const [files, setFiles]         = useState({});
  const [previews, setPreviews]   = useState({});
  const [uploading, setUploading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  const handleFile = (key, file) => {
    setFiles(prev    => ({ ...prev, [key]: file }));
    setPreviews(prev => ({ ...prev, [key]: URL.createObjectURL(file) }));
  };

  const completed = DOCS.filter(d => files[d.key]).length;
  const allDone   = completed === DOCS.length;

  const handleSubmit = async () => {
    if (!termsAccepted) { toast.error("Veuillez accepter les conditions d'engagement"); return; }
    if (!allDone)       { toast.error("Veuillez fournir tous les documents"); return; }
    setUploading(true);
    try {
      const uploads = await Promise.all(
        DOCS.map(d => base44.integrations.Core.UploadFile({ file: files[d.key] }))
      );
      const docUrls = {};
      DOCS.forEach((d, i) => { docUrls[d.key] = uploads[i].file_url; });
      await base44.auth.updateMe({
        ...docUrls,
        docs_envoyes: true,
        terms_accepted: true,
        terms_accepted_at: new Date().toISOString(),
      });
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
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-sm mx-auto w-full space-y-5 py-6">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="h-16 w-16 rounded-2xl bg-primary flex items-center justify-center mx-auto">
            <Camera className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-xl font-bold">Complétez votre dossier</h1>
          <p className="text-sm text-muted-foreground">Envoyez vos documents pour activer votre compte livreur</p>
        </div>

        {/* Progression */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Progression</span>
            <span className="font-semibold text-primary">{completed}/{DOCS.length} documents</span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${(completed / DOCS.length) * 100}%` }} />
          </div>
        </div>

        {/* Docs */}
        <div className="space-y-3">
          {DOCS.map(doc => {
            const hasFile = !!files[doc.key];
            return (
              <div
                key={doc.key}
                style={{
                  border: `2px solid ${hasFile ? '#3b82f6' : '#e5e7eb'}`,
                  borderRadius: 12,
                  background: 'white',
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 12px 4px" }}>
                  <span style={{ fontSize: 24, flexShrink: 0 }}>{doc.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{doc.label}</p>
                    <p style={{ fontSize: 11, color: "#6b7280", margin: 0 }}>{doc.desc}</p>
                  </div>
                  {hasFile && <CheckCircle2 style={{ width: 20, height: 20, color: "#3b82f6", flexShrink: 0 }} />}
                </div>
                <DocUpload
                  docKey={doc.key}
                  hasFile={hasFile}
                  preview={previews[doc.key]}
                  fileName={files[doc.key]?.name}
                  onFile={(file) => handleFile(doc.key, file)}
                />
              </div>
            );
          })}
        </div>

        {/* Submit */}
        <Button
          className="w-full h-12 text-base font-semibold"
          disabled={!allDone || !termsAccepted || uploading}
          onClick={handleSubmit}
        >
          {uploading
            ? <><Loader2 className="h-5 w-5 animate-spin mr-2" />Upload en cours…</>
            : <><Upload className="h-5 w-5 mr-2" />Envoyer mon dossier ({completed}/{DOCS.length})</>
          }
        </Button>

        {/* Conditions */}
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50">
          <button
            type="button"
            className="w-full flex items-center justify-between p-4 text-left"
            onClick={() => setShowTerms(!showTerms)}
          >
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-amber-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-900">Engagement et responsabilité</p>
                <p className="text-xs text-amber-700">Lecture obligatoire avant validation</p>
              </div>
            </div>
            <span className="text-amber-600 text-lg">{showTerms ? '▲' : '▼'}</span>
          </button>

          {showTerms && (
            <div className="px-4 pb-4 text-xs text-amber-900 border-t border-amber-200 pt-3 space-y-2">
              <ol className="space-y-1.5 list-decimal list-inside">
                <li>Je m'engage à assurer la livraison des colis avec sérieux et professionnalisme.</li>
                <li>Je suis entièrement responsable de tout dommage, perte ou vol survenant lors du transport.</li>
                <li>CDL agit uniquement comme intermédiaire de mise en relation.</li>
                <li>J'accepte que CDL ne puisse être tenue responsable en cas d'incident.</li>
                <li>Je certifie que les informations et documents fournis sont exacts et authentiques.</li>
              </ol>
            </div>
          )}

          <label className="flex items-start gap-3 px-4 pb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={e => setTermsAccepted(e.target.checked)}
              className="mt-0.5 h-5 w-5 accent-amber-600 cursor-pointer flex-shrink-0"
            />
            <span className="text-xs text-amber-900 font-medium leading-relaxed">
              ☑️ Je reconnais avoir lu et accepté les conditions ci-dessus.
            </span>
          </label>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          🔒 Vos documents sont sécurisés et utilisés uniquement pour la vérification de votre identité
        </p>

        <button
          type="button"
          className="w-full text-xs text-muted-foreground underline text-center"
          onClick={() => base44.auth.logout()}
        >
          Se déconnecter
        </button>
      </div>
    </div>
  );
}