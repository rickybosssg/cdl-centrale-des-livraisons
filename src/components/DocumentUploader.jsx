import { Camera, Image as ImageIcon, Upload, AlertCircle } from "lucide-react";
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

  // Vérifier si on est dans une WebView mobile (APK)
  const isWebView = /Android/i.test(navigator.userAgent) && 
    (!window.chrome && !window.safari) ||
    /Webview|wv|Version\/[\d.]+.*Safari/.test(navigator.userAgent);

  // Demander permission caméra (iOS spécifiquement)
  const requestCameraPermission = async () => {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && 
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        // iOS 13+
        await DeviceOrientationEvent.requestPermission();
      }
      return true;
    } catch (err) {
      console.log('Camera permission:', err);
      return false;
    }
  };

  // Ouvrir galerie
  const openGallery = () => {
    if (!fileInputRef.current) return;
    fileInputRef.current.type = "file";
    fileInputRef.current.accept = "image/*";
    fileInputRef.current.capture = undefined;
    fileInputRef.current.click();
  };

  // Ouvrir caméra
  const openCamera = async () => {
    // Demander permission sur iOS
    if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
      const hasPermission = await requestCameraPermission();
      if (!hasPermission) {
        toast.error("Permission caméra refusée. Veuillez l'accepter dans les réglages.");
        return;
      }
    }

    if (!cameraInputRef.current) return;
    
    // Pour Android APK/WebView et navigateurs
    cameraInputRef.current.type = "file";
    cameraInputRef.current.accept = "image/*";
    // Utiliser 'capture' pour forcer la caméra
    cameraInputRef.current.capture = "environment";
    cameraInputRef.current.click();
  };

  // Gérer le fichier sélectionné
  const handleFileSelect = async (e, isCamera = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Vérifier taille
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Fichier trop volumineux (max 5MB)");
      return;
    }

    // Vérifier format
    if (!file.type.startsWith('image/')) {
      toast.error("Format de fichier non autorisé. Veuillez choisir une image.");
      return;
    }

    setUploading(true);
    try {
      // Créer aperçu local
      const reader = new FileReader();
      reader.onload = (event) => {
        setLocalPreview(event.target.result);
      };
      reader.readAsDataURL(file);

      // Appeler callback upload
      await onUpload(docKey, docLabel, file);
      
      const source = isCamera ? "caméra" : "galerie";
      toast.success(`✅ ${docLabel} chargé(e) depuis la ${source}`);
    } catch (err) {
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
      <div className="flex gap-2">
        <button
          onClick={openCamera}
          disabled={disabled || uploading}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 border-dashed border-blue-300 text-blue-700 hover:bg-blue-100 transition-colors text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Camera className="h-4 w-4" />
          {uploading ? "Chargement..." : "Caméra"}
        </button>
        <button
          onClick={openGallery}
          disabled={disabled || uploading}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 border-dashed border-purple-300 text-purple-700 hover:bg-purple-100 transition-colors text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ImageIcon className="h-4 w-4" />
          {uploading ? "Chargement..." : "Galerie"}
        </button>
      </div>

      {/* Aperçu */}
      {localPreview && (
        <div className="relative rounded-lg overflow-hidden border-2 border-green-300 bg-green-50">
          <img 
            src={localPreview} 
            alt={docLabel}
            className="w-full h-32 object-cover"
          />
          <div className="absolute top-2 right-2 bg-green-600 text-white px-2 py-1 rounded text-[10px] font-bold">
            ✅ Chargé
          </div>
        </div>
      )}

      {/* Info APK */}
      {isWebView && !localPreview && (
        <div className="flex gap-2 p-2 rounded-lg bg-blue-50 border border-blue-200 text-[10px] text-blue-700">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <p>Appuyez sur Caméra ou Galerie pour ajouter {docLabel.toLowerCase()}</p>
        </div>
      )}

      {/* Inputs cachés */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFileSelect(e, false)}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFileSelect(e, true)}
      />
    </div>
  );
}