import { Camera, Image as ImageIcon, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useRef, useState } from "react";

/**
 * Composant réutilisable pour upload de document avec Caméra/Galerie
 * Gère les permissions et l'APK Android/navigateur
 */
export default function DocumentUploader({ docLabel, docKey, onUpload, disabled = false, preview = null }) {
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [localPreview, setLocalPreview] = useState(preview);
  const [error, setError] = useState(null);

  // Vérifier si on est dans une WebView mobile (APK)
  const isAndroidWebView = () => {
    const ua = navigator.userAgent;
    return /Android/i.test(ua) && /Webview|wv/.test(ua);
  };

  const isMobile = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  };

  // Ouvrir galerie
  const openGallery = () => {
    setError(null);
    try {
      if (!fileInputRef.current) {
        setError("Erreur composant");
        return;
      }
      fileInputRef.current.value = '';
      // Délai minimal pour APK
      setTimeout(() => {
        if (fileInputRef.current) {
          fileInputRef.current.click();
        }
      }, 50);
    } catch (err) {
      setError(`Galerie: ${err.message}`);
    }
  };

  // Ouvrir caméra (avec fallback galerie)
  const openCamera = () => {
    setError(null);
    try {
      if (!cameraInputRef.current) {
        setError("Erreur composant");
        return;
      }
      cameraInputRef.current.value = '';
      setTimeout(() => {
        if (cameraInputRef.current) {
          cameraInputRef.current.click();
        }
      }, 50);
    } catch (err) {
      setError(`Caméra: ${err.message}`);
    }
  };

  // Gérer le fichier sélectionné
  const handleFileSelect = async (e, isCamera = false) => {
    try {
      const file = e.target.files?.[0];
      
      if (!file) {
        console.log(`[DocumentUploader] Aucun fichier sélectionné pour ${docKey}`);
        return;
      }

      console.log(`[DocumentUploader] Fichier sélectionné pour ${docKey}:`, file.name, file.size, file.type);

      // Vérifier taille
      if (file.size > 5 * 1024 * 1024) {
        setError("Fichier trop volumineux (max 5MB)");
        toast.error("Fichier trop volumineux (max 5MB)");
        return;
      }

      // Vérifier format
      if (!file.type.startsWith('image/')) {
        setError("Format de fichier non autorisé");
        toast.error("Format de fichier non autorisé. Veuillez choisir une image.");
        return;
      }

      setError(null);
      setUploading(true);

      // Créer aperçu local AVANT upload
      const reader = new FileReader();
      reader.onload = (event) => {
        console.log(`[DocumentUploader] Aperçu généré pour ${docKey}`);
        setLocalPreview(event.target.result);
      };
      reader.readAsDataURL(file);

      // Appeler callback upload (avec attente)
      console.log(`[DocumentUploader] Démarrage upload pour ${docKey}`);
      await onUpload(docKey, docLabel, file);
      
      const source = isCamera ? "caméra" : "galerie";
      console.log(`[DocumentUploader] Upload réussi pour ${docKey}`);
      toast.success(`✅ ${docLabel} chargé(e) depuis la ${source}`);
    } catch (err) {
      console.error(`[DocumentUploader] Erreur pour ${docKey}:`, err);
      setError(`Erreur upload: ${err.message}`);
      toast.error(`Erreur upload ${docLabel}: ${err.message}`);
      setLocalPreview(null);
    } finally {
      setUploading(false);
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      {/* Boutons */}
      <div className="flex gap-2">
        <button
          onClick={openCamera}
          disabled={disabled || uploading}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 border-dashed border-blue-300 text-blue-700 hover:bg-blue-100 active:scale-95 transition-all text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          title={`Ouvrir la caméra pour ${docLabel}`}
        >
          <Camera className="h-4 w-4" />
          {uploading ? "Chargement..." : "Caméra"}
        </button>
        <button
          onClick={openGallery}
          disabled={disabled || uploading}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 border-dashed border-purple-300 text-purple-700 hover:bg-purple-100 active:scale-95 transition-all text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          title={`Ouvrir la galerie pour ${docLabel}`}
        >
          <ImageIcon className="h-4 w-4" />
          {uploading ? "Chargement..." : "Galerie"}
        </button>
      </div>

      {/* Message d'erreur */}
      {error && (
        <div className="flex gap-2 p-2 rounded-lg bg-red-50 border border-red-200 text-[10px] text-red-700">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {/* Aperçu */}
      {localPreview && (
        <div className="relative rounded-lg overflow-hidden border-2 border-green-300 bg-green-50">
          <img 
            src={localPreview} 
            alt={`Aperçu ${docLabel}`}
            className="w-full h-32 object-cover"
          />
          <div className="absolute top-2 right-2 bg-green-600 text-white px-2 py-1 rounded text-[10px] font-bold">
            ✅ Chargé
          </div>
        </div>
      )}

      {/* Info pour utilisateurs */}
      {!localPreview && isMobile() && (
        <div className="flex gap-2 p-2 rounded-lg bg-blue-50 border border-blue-200 text-[10px] text-blue-700">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <p>Appuyez sur <strong>Caméra</strong> ou <strong>Galerie</strong> pour ajouter {docLabel.toLowerCase()}</p>
        </div>
      )}

      {/* Inputs cachés - ESSENTIELS pour APK */}
      <input
       ref={fileInputRef}
       type="file"
       accept="image/*"
       capture="none"
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