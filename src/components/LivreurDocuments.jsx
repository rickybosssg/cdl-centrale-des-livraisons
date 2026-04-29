/**
 * LivreurDocuments — Vérification progressive en 4 étapes (Phase 2)
 * Étape 1: Photo de profil | Étape 2: CNIB recto/verso | Étape 3: Véhicule | Étape 4: Consentement
 */
import { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { CheckCircle2, Loader2, Camera, X, AlertCircle, ChevronRight, Shield } from "lucide-react";
import { toast } from "sonner";
import { isNativeApp, openNativeCamera, openNativeGallery, compressImage } from "@/lib/nativeCamera";

// ── Composant upload photo (caméra + galerie) ─────────────────────────────────
function PhotoUpload({ label, desc, emoji, docKey, file, preview, onFile, onRemove }) {
  const galleryRef = useRef(null);
  const cameraRef = useRef(null);
  const [loading, setLoading] = useState(null);
  const [permError, setPermError] = useState(null);
  const native = isNativeApp();

  const handleNative = async (mode) => {
    setPermError(null);
    setLoading(mode);
    try {
      const f = mode === 'camera' ? await openNativeCamera() : await openNativeGallery();
      if (f) onFile(docKey, f);
    } catch (err) {
      setPermError(err.message || "Erreur");
    } finally {
      setLoading(null);
    }
  };

  const handleWeb = async (e, mode) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) { toast.error("Choisissez une image"); return; }
    setLoading(mode);
    try {
      const compressed = await compressImage(f);
      onFile(docKey, compressed);
    } catch (_) {
      onFile(docKey, f);
    } finally {
      setLoading(null);
      e.target.value = '';
    }
  };

  return (
    <div className={`rounded-2xl border-2 bg-white overflow-hidden transition-all ${file ? 'border-green-400' : 'border-gray-200'}`}>
      <div className="flex items-center gap-3 p-4">
        <span className="text-3xl">{emoji}</span>
        <div className="flex-1">
          <p className="font-bold text-gray-900">{label}</p>
          <p className="text-xs text-gray-400">{desc}</p>
        </div>
        {file && <CheckCircle2 className="h-6 w-6 text-green-500 flex-shrink-0" />}
      </div>

      {preview ? (
        <div className="relative">
          <img src={preview} alt="aperçu" className="w-full h-48 object-contain bg-gray-50" />
          <button onClick={() => onRemove(docKey)} className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1.5 active:scale-90">
            <X className="h-3 w-3" />
          </button>
          <div className="absolute bottom-2 left-2 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">✅ Prêt</div>
        </div>
      ) : (
        native ? (
          <div className="flex gap-2 p-3">
            <button onClick={() => handleNative('camera')} disabled={!!loading}
              className="flex-1 flex flex-col items-center gap-1.5 py-4 rounded-xl bg-blue-50 border border-blue-200 active:scale-95 disabled:opacity-50">
              {loading === 'camera' ? <Loader2 className="h-6 w-6 text-blue-600 animate-spin" /> : <span className="text-2xl">📷</span>}
              <span className="text-xs font-bold text-blue-700">Caméra</span>
            </button>
            <button onClick={() => handleNative('gallery')} disabled={!!loading}
              className="flex-1 flex flex-col items-center gap-1.5 py-4 rounded-xl bg-gray-50 border border-gray-200 active:scale-95 disabled:opacity-50">
              {loading === 'gallery' ? <Loader2 className="h-6 w-6 text-gray-600 animate-spin" /> : <span className="text-2xl">🖼️</span>}
              <span className="text-xs font-bold text-gray-600">Galerie</span>
            </button>
          </div>
        ) : (
          <div className="flex gap-2 p-3">
            <div className="flex-1 relative">
              <div className="flex flex-col items-center gap-1.5 py-4 rounded-xl bg-blue-50 border border-blue-200 pointer-events-none">
                {loading === 'camera' ? <Loader2 className="h-6 w-6 text-blue-600 animate-spin" /> : <span className="text-2xl">📷</span>}
                <span className="text-xs font-bold text-blue-700">Caméra</span>
              </div>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment"
                onChange={(e) => handleWeb(e, 'camera')}
                className="absolute inset-0 opacity-0 cursor-pointer z-10 w-full h-full" />
            </div>
            <div className="flex-1 relative">
              <div className="flex flex-col items-center gap-1.5 py-4 rounded-xl bg-gray-50 border border-gray-200 pointer-events-none">
                {loading === 'gallery' ? <Loader2 className="h-6 w-6 text-gray-600 animate-spin" /> : <span className="text-2xl">🖼️</span>}
                <span className="text-xs font-bold text-gray-600">Galerie</span>
              </div>
              <input ref={galleryRef} type="file" accept="image/*"
                onChange={(e) => handleWeb(e, 'gallery')}
                className="absolute inset-0 opacity-0 cursor-pointer z-10 w-full h-full" />
            </div>
          </div>
        )
      )}

      {permError && (
        <div className="mx-3 mb-3 p-2 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2 text-xs text-red-700">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <span>{permError}</span>
        </div>
      )}
    </div>
  );
}

// ── Barre de progression ──────────────────────────────────────────────────────
function ProgressBar({ current, total }) {
  const pct = Math.round((current / total) * 100);
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs text-gray-400 font-medium">Étape {current} / {total}</span>
        <span className="text-xs font-bold text-primary">{pct}%</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between">
        {['Selfie', 'CNIB', 'Véhicule', 'Accord'].map((label, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className={`h-2 w-2 rounded-full transition-all ${i < current ? 'bg-primary' : i === current - 1 ? 'bg-primary ring-2 ring-primary/30 scale-125' : 'bg-gray-200'}`} />
            <span className={`text-[9px] font-medium ${i < current ? 'text-primary' : 'text-gray-300'}`}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────
export default function LivreurDocuments({ onComplete }) {
  const [step, setStep] = useState(1); // 1-4
  const [files, setFiles] = useState({});
  const [previews, setPreviews] = useState({});
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [uploading, setUploading] = useState(false);

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

  // Valider chaque étape
  const step1Ok = !!files.photo_profil;
  const step2Ok = !!files.photo_identite_recto && !!files.photo_identite_verso;
  const step3Ok = !!files.photo_moyen_deplacement;
  const step4Ok = termsAccepted;

  const canNext = step === 1 ? step1Ok : step === 2 ? step2Ok : step === 3 ? step3Ok : false;

  const handleSubmit = async () => {
    if (!termsAccepted) { toast.error("Acceptez les conditions pour continuer"); return; }
    setUploading(true);
    try {
      const DOCS_KEYS = ['photo_profil', 'photo_identite_recto', 'photo_identite_verso', 'photo_moyen_deplacement'];
      const uploads = await Promise.all(DOCS_KEYS.map(k => base44.integrations.Core.UploadFile({ file: files[k] })));
      const docUrls = {};
      DOCS_KEYS.forEach((k, i) => { docUrls[k] = uploads[i].file_url; });

      const me = await base44.auth.me();
      const livreurProfiles = await base44.entities.UserProfile.filter({ user_email: me.email, profile_type: 'livreur', deleted: false });

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

      toast.success("🎉 Dossier envoyé ! Vous serez notifié après validation.");
      onComplete();
    } catch (err) {
      toast.error("Erreur : " + err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="sticky top-0 bg-white z-10 border-b border-gray-100 px-5 pt-5 pb-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
            <Camera className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-gray-900">Complétez votre dossier</h1>
            <p className="text-xs text-gray-400">Vérification progressive — une étape à la fois</p>
          </div>
        </div>
        <ProgressBar current={step} total={4} />
      </div>

      {/* Contenu par étape */}
      <div className="flex-1 px-5 py-5 space-y-5 pb-36">

        {/* ÉTAPE 1 — Selfie */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="text-center space-y-1">
              <p className="text-3xl">🤳</p>
              <h2 className="text-xl font-extrabold text-gray-900">Votre photo de profil</h2>
              <p className="text-sm text-gray-400">Un selfie clair avec votre visage bien visible</p>
            </div>
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-700 space-y-1">
              <p className="font-semibold">📋 Conseils :</p>
              <p>• Bonne luminosité — évitez la contre-jour</p>
              <p>• Visage entier, sans lunettes de soleil</p>
              <p>• Fond neutre si possible</p>
            </div>
            <PhotoUpload
              label="Photo de profil" desc="Selfie clair, visage visible" emoji="🤳"
              docKey="photo_profil" file={files.photo_profil} preview={previews.photo_profil}
              onFile={handleFile} onRemove={handleRemove}
            />
          </div>
        )}

        {/* ÉTAPE 2 — CNIB recto/verso */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="text-center space-y-1">
              <p className="text-3xl">🪪</p>
              <h2 className="text-xl font-extrabold text-gray-900">Carte d'identité (CNIB)</h2>
              <p className="text-sm text-gray-400">Recto et verso de votre CNIB</p>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-700 space-y-1">
              <p className="font-semibold">📋 Conseils :</p>
              <p>• Carte posée à plat sur une surface sombre</p>
              <p>• Toutes les informations lisibles</p>
              <p>• Pas de reflet ni de flou</p>
            </div>
            <PhotoUpload
              label="CNIB — Recto" desc="Face avant de votre carte d'identité" emoji="🪪"
              docKey="photo_identite_recto" file={files.photo_identite_recto} preview={previews.photo_identite_recto}
              onFile={handleFile} onRemove={handleRemove}
            />
            <PhotoUpload
              label="CNIB — Verso" desc="Face arrière de votre carte d'identité" emoji="🪪"
              docKey="photo_identite_verso" file={files.photo_identite_verso} preview={previews.photo_identite_verso}
              onFile={handleFile} onRemove={handleRemove}
            />
          </div>
        )}

        {/* ÉTAPE 3 — Véhicule */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="text-center space-y-1">
              <p className="text-3xl">🛵</p>
              <h2 className="text-xl font-extrabold text-gray-900">Photo de votre véhicule</h2>
              <p className="text-sm text-gray-400">Moto ou voiture utilisée pour les livraisons</p>
            </div>
            <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-xs text-green-700 space-y-1">
              <p className="font-semibold">📋 Conseils :</p>
              <p>• Photo de face ou de côté — véhicule entier visible</p>
              <p>• Plaque d'immatriculation lisible si possible</p>
              <p>• En plein jour pour une bonne qualité</p>
            </div>
            <PhotoUpload
              label="Moto ou véhicule" desc="Photo de votre moyen de déplacement" emoji="🛵"
              docKey="photo_moyen_deplacement" file={files.photo_moyen_deplacement} preview={previews.photo_moyen_deplacement}
              onFile={handleFile} onRemove={handleRemove}
            />
          </div>
        )}

        {/* ÉTAPE 4 — Consentement */}
        {step === 4 && (
          <div className="space-y-5">
            <div className="text-center space-y-1">
              <p className="text-3xl">📋</p>
              <h2 className="text-xl font-extrabold text-gray-900">Engagement et responsabilité</h2>
              <p className="text-sm text-gray-400">Lisez et acceptez les conditions avant de soumettre</p>
            </div>

            <div className="rounded-2xl border-2 border-gray-200 bg-gray-50 p-4 space-y-3 text-sm text-gray-700">
              <div className="flex items-center gap-2 mb-1">
                <Shield className="h-5 w-5 text-primary flex-shrink-0" />
                <p className="font-bold text-gray-900">Conditions d'engagement CDL</p>
              </div>
              <ol className="space-y-3 list-decimal list-inside text-sm">
                <li>Je m'engage à assurer la livraison des colis avec sérieux et professionnalisme.</li>
                <li>Je suis entièrement responsable de tout dommage, perte ou vol survenant lors du transport.</li>
                <li>CDL agit uniquement comme intermédiaire de mise en relation.</li>
                <li>J'accepte que CDL ne puisse être tenue responsable en cas d'incident.</li>
                <li>Je certifie que les informations et documents fournis sont exacts et authentiques.</li>
                <li>Je m'engage à respecter le code de conduite CDL et à traiter les clients avec respect.</li>
              </ol>
            </div>

            {/* Récap documents */}
            <div className="rounded-xl border border-gray-200 p-4 space-y-2">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Documents fournis</p>
              {[
                { key: 'photo_profil', label: 'Photo de profil' },
                { key: 'photo_identite_recto', label: 'CNIB Recto' },
                { key: 'photo_identite_verso', label: 'CNIB Verso' },
                { key: 'photo_moyen_deplacement', label: 'Photo véhicule' },
              ].map(d => (
                <div key={d.key} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                  <span className="text-sm text-gray-700">{d.label}</span>
                </div>
              ))}
            </div>

            {/* Checkbox consentement */}
            <label className={`flex items-start gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${termsAccepted ? 'border-green-400 bg-green-50' : 'border-gray-300 bg-white'}`}>
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={e => setTermsAccepted(e.target.checked)}
                className="mt-0.5 h-5 w-5 accent-green-600 cursor-pointer flex-shrink-0"
              />
              <span className="text-sm text-gray-800 font-medium leading-relaxed">
                Je reconnais avoir lu et j'accepte les conditions d'engagement CDL. Je certifie que mes informations sont exactes.
              </span>
            </label>

            <p className="text-[10px] text-gray-400 text-center">
              🔒 Vos documents sont sécurisés et utilisés uniquement pour la vérification de votre identité.
            </p>

            {/* Bouton soumettre */}
            <button
              onClick={handleSubmit}
              disabled={!termsAccepted || uploading}
              className="w-full py-5 rounded-2xl bg-green-500 hover:bg-green-600 text-white text-base font-extrabold active:scale-95 transition-all disabled:opacity-40 shadow-md shadow-green-200"
            >
              {uploading
                ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-5 w-5 animate-spin" />Envoi en cours...</span>
                : "✅ Soumettre mon dossier"}
            </button>

            <button onClick={() => base44.auth.logout()} className="w-full text-xs text-gray-400 underline text-center">
              Se déconnecter
            </button>
          </div>
        )}
      </div>

      {/* Bouton Suivant fixe en bas */}
      {step < 4 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-5 py-4 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
          <button
            onClick={() => setStep(s => s + 1)}
            disabled={!canNext}
            className="w-full py-4 rounded-2xl bg-primary text-white font-extrabold text-base flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-40 shadow-md shadow-primary/30"
          >
            {step === 3 ? "Passer au consentement" : "Étape suivante"}
            <ChevronRight className="h-5 w-5" />
          </button>
          {!canNext && (
            <p className="text-xs text-center text-gray-400 mt-2">
              {step === 1 ? "Ajoutez votre selfie pour continuer" :
               step === 2 ? "Ajoutez les 2 faces de votre CNIB pour continuer" :
               "Ajoutez la photo de votre véhicule pour continuer"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}