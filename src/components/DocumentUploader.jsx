import { Camera, Image as ImageIcon, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useRef, useState, useEffect } from "react";
import { isNativeApp, openNativeCamera, openNativeGallery } from "@/lib/nativeCamera";

function isLikelyImageFile(file) {
  if (!file) return false;
  if (file.type && file.type.startsWith("image/")) return true;
  const name = file.name || "";
  return /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(name);
}

/**
 * Upload document photo — Web : input file / APK : plugin Capacitor (@/lib/nativeCamera)
 */
export default function DocumentUploader({ docLabel, docKey, onUpload, disabled = false, preview = null }) {
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [localPreview, setLocalPreview] = useState(preview);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLocalPreview(preview);
  }, [preview]);

  const runUpload = async (file, isCamera) => {
    if (!file) return;

    if (!isLikelyImageFile(file)) {
      setError("Format non reconnu — utilisez une photo (JPG, PNG…)");
      toast.error("Veuillez choisir une image.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("Fichier trop volumineux (max 5 Mo)");
      toast.error("Fichier trop volumineux (max 5 Mo)");
      return;
    }

    setError(null);
    setUploading(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      setLocalPreview(event.target?.result);
    };
    reader.readAsDataURL(file);

    try {
      await onUpload(docKey, docLabel, file);
      // Toast de succès géré par la page parente (ex. CompleteProfile)
    } catch (err) {
      console.error(`[DocumentUploader] Erreur pour ${docKey}:`, err);
      setError(`Erreur upload: ${err.message}`);
      toast.error(`${docLabel}: ${err.message}`);
      setLocalPreview(null);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  };

  const openGallery = async () => {
    setError(null);
    if (isNativeApp()) {
      try {
        setUploading(true);
        const file = await openNativeGallery();
        if (file) await runUpload(file, false);
      } catch (err) {
        const msg = err?.message || "Impossible d'ouvrir la galerie";
        setError(msg);
        toast.error(msg);
      } finally {
        setUploading(false);
      }
      return;
    }
    try {
      if (!fileInputRef.current) {
        setError("Erreur composant");
        return;
      }
      fileInputRef.current.value = "";
      setTimeout(() => fileInputRef.current?.click(), 50);
    } catch (err) {
      setError(`Galerie: ${err.message}`);
    }
  };

  const openCamera = async () => {
    setError(null);
    if (isNativeApp()) {
      try {
        setUploading(true);
        const file = await openNativeCamera();
        if (file) await runUpload(file, true);
      } catch (err) {
        const msg = err?.message || "Impossible d'ouvrir la caméra";
        setError(msg);
        toast.error(msg);
      } finally {
        setUploading(false);
      }
      return;
    }
    try {
      if (!cameraInputRef.current) {
        setError("Erreur composant");
        return;
      }
      cameraInputRef.current.value = "";
      setTimeout(() => cameraInputRef.current?.click(), 50);
    } catch (err) {
      setError(`Caméra: ${err.message}`);
    }
  };

  const handleFileSelect = async (e, isCamera) => {
    const file = e.target.files?.[0];
    if (!file) {
      console.log(`[DocumentUploader] Aucun fichier pour ${docKey}`);
      return;
    }
    await runUpload(file, isCamera);
  };

  const isMobile = () =>
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={openCamera}
          disabled={disabled || uploading}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 border-dashed border-blue-300 text-blue-700 hover:bg-blue-100 active:scale-95 transition-all text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          title={`Photo pour ${docLabel}`}
        >
          <Camera className="h-4 w-4" />
          {uploading ? "Chargement..." : "Caméra"}
        </button>
        <button
          type="button"
          onClick={openGallery}
          disabled={disabled || uploading}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 border-dashed border-purple-300 text-purple-700 hover:bg-purple-100 active:scale-95 transition-all text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          title={`Galerie pour ${docLabel}`}
        >
          <ImageIcon className="h-4 w-4" />
          {uploading ? "Chargement..." : "Galerie"}
        </button>
      </div>

      {error && (
        <div className="flex gap-2 p-2 rounded-lg bg-red-50 border border-red-200 text-[10px] text-red-700">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {localPreview && (
        <div className="relative rounded-lg overflow-hidden border-2 border-green-300 bg-green-50">
          <img src={localPreview} alt={`Aperçu ${docLabel}`} className="w-full h-32 object-cover" />
          <div className="absolute top-2 right-2 bg-green-600 text-white px-2 py-1 rounded text-[10px] font-bold">
            ✅ Chargé
          </div>
        </div>
      )}

      {!localPreview && isMobile() && (
        <div className="flex gap-2 p-2 rounded-lg bg-blue-50 border border-blue-200 text-[10px] text-blue-700">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <p>
            {isNativeApp() ? (
              <>Utilisez <strong>Caméra</strong> ou <strong>Galerie</strong> (application installée).</>
            ) : (
              <>Appuyez sur <strong>Caméra</strong> ou <strong>Galerie</strong> pour ajouter {docLabel.toLowerCase()}</>
            )}
          </p>
        </div>
      )}

      {/* File inputs — navigateur et secours WebView */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture={undefined}
        className="hidden"
        onChange={(e) => handleFileSelect(e, false)}
        aria-label={`Galerie pour ${docLabel}`}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFileSelect(e, true)}
        aria-label={`Caméra pour ${docLabel}`}
      />
    </div>
  );
}
