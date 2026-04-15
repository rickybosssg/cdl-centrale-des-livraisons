import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { CheckCircle2, Upload, Loader2, ShieldCheck, Camera, Phone, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { isNativeApp, openNativeCamera, openNativeGallery, compressImage } from "@/lib/nativeCamera";

const DOCS = [
  { key: "photo_profil",            label: "Photo de profil",      desc: "Selfie clair, visage visible",              emoji: "🤳" },
  { key: "photo_identite_recto",    label: "CNI – Recto",          desc: "Face avant de votre carte d'identité",      emoji: "🪪" },
  { key: "photo_identite_verso",    label: "CNI – Verso",          desc: "Face arrière de votre carte d'identité",    emoji: "🪪" },
  { key: "photo_moyen_deplacement", label: "Moyen de déplacement", desc: "Photo de votre moto ou véhicule",           emoji: "🛵" },
];

// ── Composant document individuel ─────────────────────────────────────────────
function DocItem({ doc, file, preview, onFile, onRemove }) {
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const [actionLoading, setActionLoading] = useState(null); // 'camera' | 'gallery'
  const [permError, setPermError] = useState(null);
  const native = isNativeApp();

  const handleNativeCamera = async () => {
    setPermError(null);
    setActionLoading('camera');
    try {
      const f = await openNativeCamera();
      if (f) onFile(doc.key, f);
    } catch (err) {
      setPermError(err.message || "Erreur caméra");
      toast.error(err.message || "Erreur caméra");
    } finally {
      setActionLoading(null);
    }
  };

  const handleNativeGallery = async () => {
    setPermError(null);
    setActionLoading('gallery');
    try {
      const f = await openNativeGallery();
      if (f) onFile(doc.key, f);
    } catch (err) {
      setPermError(err.message || "Erreur galerie");
      toast.error(err.message || "Erreur galerie");
    } finally {
      setActionLoading(null);
    }
  };

  const handleWebFile = async (e, source) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) { toast.error("Veuillez choisir une image"); return; }
    if (f.size > 8 * 1024 * 1024) { toast.error("Fichier trop volumineux (max 8MB)"); return; }
    setActionLoading(source);
    try {
      const compressed = await compressImage(f);
      onFile(doc.key, compressed);
    } catch (_) {
      onFile(doc.key, f);
    } finally {
      setActionLoading(null);
      e.target.value = '';
    }
  };

  return (
    <div className={`rounded-xl border-2 bg-white overflow-hidden ${file ? 'border-primary' : 'border-border'}`}>
      {/* En-tête */}
      <div className="flex items-center gap-3 p-3">
        <span className="text-2xl flex-shrink-0">{doc.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{doc.label}</p>
          <p className="text-xs text-muted-foreground">{doc.desc}</p>
        </div>
        {file && <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />}
      </div>

      {/* Aperçu */}
      {preview && (
        <div className="relative">
          <img src={preview} alt="aperçu" className="w-full h-40 object-contain bg-gray-100" />
          <button
            onClick={() => onRemove(doc.key)}
            className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1"
          >
            <X className="h-3 w-3" />
          </button>
          <div className="absolute bottom-2 left-2 bg-green-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
            ✅ Prêt
          </div>
        </div>
      )}

      {/* Boutons — APK natif */}
      {native ? (
        <div className="flex gap-2 p-3">
          <button
            onClick={handleNativeCamera}
            disabled={!!actionLoading}
            className="flex-1 flex flex-col items-center gap-1 py-3 rounded-xl bg-blue-50 border border-blue-300 active:scale-95 transition-all disabled:opacity-60"
          >
            {actionLoading === 'camera'
              ? <Loader2 className="h-6 w-6 text-blue-600 animate-spin" />
              : <span className="text-2xl">📷</span>}
            <span className="text-xs font-bold text-blue-700">Caméra</span>
          </button>
          <button
            onClick={handleNativeGallery}
            disabled={!!actionLoading}
            className="flex-1 flex flex-col items-center gap-1 py-3 rounded-xl bg-gray-50 border border-gray-300 active:scale-95 transition-all disabled:opacity-60"
          >
            {actionLoading === 'gallery'
              ? <Loader2 className="h-6 w-6 text-gray-600 animate-spin" />
              : <span className="text-2xl">🖼️</span>}
            <span className="text-xs font-bold text-gray-700">Galerie</span>
          </button>
        </div>
      ) : (
        /* Navigateur web — inputs HTML natifs (opacity:0 sur div stylisé) */
        <div className="flex gap-2 p-3">
          {/* Caméra */}
          <div className="flex-1 relative">
            <div className="flex flex-col items-center gap-1 py-3 rounded-xl bg-blue-50 border border-blue-300 pointer-events-none select-none">
              {actionLoading === 'camera'
                ? <Loader2 className="h-6 w-6 text-blue-600 animate-spin" />
                : <span className="text-2xl">📷</span>}
              <span className="text-xs font-bold text-blue-700">Caméra</span>
            </div>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => handleWebFile(e, 'camera')}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
          </div>
          {/* Galerie */}
          <div className="flex-1 relative">
            <div className="flex flex-col items-center gap-1 py-3 rounded-xl bg-gray-50 border border-gray-300 pointer-events-none select-none">
              {actionLoading === 'gallery'
                ? <Loader2 className="h-6 w-6 text-gray-600 animate-spin" />
                : <span className="text-2xl">🖼️</span>}
              <span className="text-xs font-bold text-gray-700">Galerie</span>
            </div>
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => handleWebFile(e, 'gallery')}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
          </div>
        </div>
      )}

      {/* Erreur permission */}
      {permError && (
        <div className="mx-3 mb-3 flex items-start gap-2 p-2 rounded-lg bg-red-50 border border-red-200 text-[11px] text-red-700">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <div>
            <p>{permError}</p>
            {permError.includes('refusée') && (
              <button
                onClick={() => {
                  try { window.open('app-settings:'); } catch (_) {}
                  toast.info("Ouvrez les paramètres → Autorisations → Caméra/Photos");
                }}
                className="underline font-bold mt-0.5"
              >
                Ouvrir les paramètres
              </button>
            )}
          </div>
        </div>
      )}

      {/* Nom du fichier */}
      {file && (
        <p className="text-[10px] text-primary text-center font-semibold pb-3 px-3 truncate">
          ✅ {file.name}
        </p>
      )}
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────
export default function LivreurDocuments({ onComplete }) {
  const [files, setFiles]         = useState({});
  const [previews, setPreviews]   = useState({});
  const [uploading, setUploading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [user, setUser]           = useState(null);
  const [telephone, setTelephone] = useState("");
  const [savingTel, setSavingTel] = useState(false);
  const [telSaved, setTelSaved]   = useState(false);

  useEffect(() => {
    base44.auth.me().then(me => {
      setUser(me);
      if (me.telephone) { setTelephone(me.telephone); setTelSaved(true); }
    });
  }, []);

  const validateTel = (t) => {
    const cleaned = t.replace(/[\s\-\.\(\)]/g, "");
    return /^(\+226|00226|0)?[0-9]{8,10}$/.test(cleaned);
  };

  const saveTelephone = async () => {
    if (!telephone.trim()) { toast.error("Le numéro est obligatoire"); return; }
    if (!validateTel(telephone)) { toast.error("Numéro invalide (ex: +22670000000)"); return; }
    setSavingTel(true);
    await base44.auth.updateMe({ telephone });
    const me = await base44.auth.me();
    const profiles = await base44.entities.UserProfile.filter({ user_email: me.email, profile_type: 'livreur', deleted: false });
    if (profiles.length > 0) {
      const data = (() => { try { return JSON.parse(profiles[0].data_json || '{}'); } catch(_) { return {}; } })();
      await base44.entities.UserProfile.update(profiles[0].id, { data_json: JSON.stringify({ ...data, telephone }) });
    }
    setTelSaved(true);
    setSavingTel(false);
    toast.success("✅ Numéro enregistré");
  };

  const handleFile = (key, file) => {
    setFiles(prev => ({ ...prev, [key]: file }));
    const url = URL.createObjectURL(file);
    setPreviews(prev => ({ ...prev, [key]: url }));
  };

  const handleRemove = (key) => {
    setFiles(prev => { const n = { ...prev }; delete n[key]; return n; });
    setPreviews(prev => {
      if (prev[key]) URL.revokeObjectURL(prev[key]);
      const n = { ...prev }; delete n[key]; return n;
    });
  };

  const completed = DOCS.filter(d => files[d.key]).length;
  const allDone   = completed === DOCS.length;
  const canSubmit = allDone && termsAccepted && telSaved;

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

      const livreurProfiles = await base44.entities.UserProfile.filter({
        user_email: me.email,
        profile_type: 'livreur',
        deleted: false,
      });

      if (livreurProfiles.length > 0) {
        await base44.entities.UserProfile.update(livreurProfiles[0].id, {
          documents_json: JSON.stringify(docUrls),
          status: 'en_attente',
          missing_documents: JSON.stringify([]),
          completion_percentage: 100,
        });
      } else {
        await base44.functions.invoke('addProfileToUser', {
          profile_type: 'livreur',
          data: { telephone: me.telephone || '', quartier: me.quartier || '', ...docUrls },
        });
      }

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
          {isNativeApp() && (
            <p className="text-[10px] text-primary font-medium bg-primary/10 px-3 py-1 rounded-full inline-block">
              📱 Mode APK — Caméra & Galerie natives activées
            </p>
          )}
        </div>

        {/* Bloc téléphone */}
        <div className={`p-4 rounded-xl border-2 space-y-3 ${telSaved ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
          <div className="flex items-center gap-2">
            <Phone className={`h-5 w-5 ${telSaved ? 'text-green-600' : 'text-red-600'}`} />
            <p className={`text-sm font-bold ${telSaved ? 'text-green-800' : 'text-red-800'}`}>
              Numéro de téléphone *
            </p>
            {!telSaved && <span className="text-[10px] bg-red-500 text-white rounded-full px-1.5 py-0.5 font-bold">OBLIGATOIRE</span>}
          </div>
          {!telSaved ? (
            <>
              <p className="text-xs text-red-700">Le numéro est utilisé pour les courses et le contact client.</p>
              <div className="flex gap-2">
                <Input
                  placeholder="+226 XX XX XX XX"
                  value={telephone}
                  onChange={e => setTelephone(e.target.value)}
                  className="flex-1 bg-white"
                  type="tel"
                />
                <Button size="sm" onClick={saveTelephone} disabled={savingTel}>
                  {savingTel ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Valider'}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-green-700">✅ {telephone}</p>
              <button onClick={() => setTelSaved(false)} className="text-xs text-muted-foreground underline">Modifier</button>
            </div>
          )}
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

        {/* Cartes documents */}
        <div className="space-y-3">
          {DOCS.map(doc => (
            <DocItem
              key={doc.key}
              doc={doc}
              file={files[doc.key]}
              preview={previews[doc.key]}
              onFile={handleFile}
              onRemove={handleRemove}
            />
          ))}
        </div>

        {!telSaved && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-300 text-sm text-red-700 text-center font-medium">
            ⚠️ Renseignez votre numéro de téléphone avant de continuer
          </div>
        )}

        <Button
          className="w-full h-12 text-base font-semibold"
          disabled={!canSubmit || uploading}
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