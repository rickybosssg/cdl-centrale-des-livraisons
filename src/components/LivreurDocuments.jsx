import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { CheckCircle2, Upload, Loader2, ShieldCheck, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const DOCS = [
  { key: "photo_profil",            label: "Photo de profil",      desc: "Selfie clair, visage visible",              emoji: "🤳" },
  { key: "photo_identite_recto",    label: "CNI – Recto",          desc: "Face avant de votre carte d'identité",      emoji: "🪪" },
  { key: "photo_identite_verso",    label: "CNI – Verso",          desc: "Face arrière de votre carte d'identité",    emoji: "🪪" },
  { key: "photo_moyen_deplacement", label: "Moyen de déplacement", desc: "Photo de votre moto ou véhicule",           emoji: "🛵" },
];

export default function LivreurDocuments({ onComplete }) {
  const [files, setFiles]         = useState({});
  const [previews, setPreviews]   = useState({});
  const [uploading, setUploading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  const handleFile = (key, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
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

      const me = await base44.auth.me();

      // Trouver le UserProfile livreur existant et le mettre à jour avec les docs
      const livreurProfiles = await base44.entities.UserProfile.filter({
        user_email: me.email,
        profile_type: 'livreur',
        deleted: false,
      });

      if (livreurProfiles.length > 0) {
        // Mettre à jour le UserProfile avec les documents et passer en en_attente
        await base44.entities.UserProfile.update(livreurProfiles[0].id, {
          documents_json: JSON.stringify(docUrls),
          status: 'en_attente',
          missing_documents: JSON.stringify([]),
          completion_percentage: 100,
        });
      } else {
        // Fallback : créer le profil livreur avec les docs si inexistant
        await base44.functions.invoke('addProfileToUser', {
          profile_type: 'livreur',
          data: { telephone: me.telephone || '', quartier: me.quartier || '', ...docUrls },
        });
      }

      // Marquer docs_envoyes sur User pour compatibilité
      await base44.auth.updateMe({ docs_envoyes: true, terms_accepted: true, terms_accepted_at: new Date().toISOString() });

      try {
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

        <div className="text-center space-y-2">
          <div className="h-16 w-16 rounded-2xl bg-primary flex items-center justify-center mx-auto">
            <Camera className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-xl font-bold">Complétez votre dossier</h1>
          <p className="text-sm text-muted-foreground">Envoyez vos documents pour activer votre compte livreur</p>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Progression</span>
            <span className="font-semibold text-primary">{completed}/{DOCS.length} documents</span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${(completed / DOCS.length) * 100}%` }} />
          </div>
        </div>

        <div className="space-y-3">
          {DOCS.map(doc => {
            const hasFile = !!files[doc.key];
            return (
              <div key={doc.key} className={`rounded-xl border-2 bg-white ${hasFile ? 'border-primary' : 'border-border'}`}>

                {/* En-tête */}
                <div className="flex items-center gap-3 p-3">
                  <span className="text-2xl flex-shrink-0">{doc.emoji}</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{doc.label}</p>
                    <p className="text-xs text-muted-foreground">{doc.desc}</p>
                  </div>
                  {hasFile && <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />}
                </div>

                {/* Aperçu */}
                {previews[doc.key] && (
                  <img src={previews[doc.key]} alt="aperçu" className="w-full h-28 object-cover" />
                )}

                {/* ── UPLOAD ZONE ──────────────────────────────────────────
                    Les inputs sont VISIBLES et stylisés directement.
                    Aucun overlay, aucun label wrapper, aucun JS .click().
                    L'utilisateur tape directement sur l'input natif.
                    C'est la méthode la plus compatible Android/WebView.
                ─────────────────────────────────────────────────────────── */}
                <div className="flex gap-2 p-3">

                  {/* Caméra — input visible stylisé */}
                  <div className="flex-1 relative">
                    <div className="flex flex-col items-center gap-1 py-2.5 rounded-lg bg-blue-50 border border-blue-300 pointer-events-none select-none">
                      <span className="text-xl">📷</span>
                      <span className="text-xs font-bold text-blue-700">Caméra</span>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => handleFile(doc.key, e)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                  </div>

                  {/* Galerie — input visible stylisé */}
                  <div className="flex-1 relative">
                    <div className="flex flex-col items-center gap-1 py-2.5 rounded-lg bg-gray-50 border border-gray-300 pointer-events-none select-none">
                      <span className="text-xl">🖼️</span>
                      <span className="text-xs font-bold text-gray-700">Galerie</span>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFile(doc.key, e)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                  </div>

                </div>

                {/* Nom du fichier */}
                {files[doc.key] && (
                  <p className="text-[10px] text-primary text-center font-semibold pb-3">
                    ✅ {files[doc.key].name}
                  </p>
                )}

              </div>
            );
          })}
        </div>

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
          <button type="button" className="w-full flex items-center justify-between p-4 text-left" onClick={() => setShowTerms(!showTerms)}>
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-amber-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-900">Engagement et responsabilité</p>
                <p className="text-xs text-amber-700">Lecture obligatoire avant validation</p>
              </div>
            </div>
            <span className="text-amber-600">{showTerms ? '▲' : '▼'}</span>
          </button>

          {showTerms && (
            <div className="px-4 pb-4 text-xs text-amber-900 border-t border-amber-200 pt-3">
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

        <button type="button" className="w-full text-xs text-muted-foreground underline text-center" onClick={() => base44.auth.logout()}>
          Se déconnecter
        </button>
      </div>
    </div>
  );
}