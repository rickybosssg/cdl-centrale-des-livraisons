/**
 * Caméra / galerie natives pour l'APK Capacitor.
 * Utilise l'API officielle @capacitor/camera (enregistrée au chargement du module).
 */
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

export function isNativeApp() {
  return (
    typeof window !== 'undefined' &&
    window.Capacitor !== undefined &&
    typeof window.Capacitor.isNativePlatform === 'function' &&
    window.Capacitor.isNativePlatform()
  );
}

function base64ToFile(base64, filename = 'photo.jpg') {
  const arr = base64.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const bstr = atob(arr[1] || base64);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new File([u8arr], filename, { type: mime });
}

export async function compressImage(file, maxSize = 1920, quality = 0.85) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width <= maxSize && height <= maxSize) {
        resolve(file);
        return;
      }
      if (width > height) {
        height = Math.round((height * maxSize) / width);
        width = maxSize;
      } else {
        width = Math.round((width * maxSize) / height);
        height = maxSize;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          const compressed = new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });
          resolve(compressed);
        },
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

/**
 * Convertit base64 brut (sans header data:...) en File
 */
function rawBase64ToFile(base64, filename = 'photo.jpg') {
  try {
    const bstr = atob(base64);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new File([u8arr], filename, { type: 'image/jpeg' });
  } catch {
    return null;
  }
}

/**
 * Essaie DataUrl, puis Base64 en fallback (robustesse Android WebView)
 * @returns {Promise<File|null>}
 */
async function capturePhoto(source) {
  // Tentative 1 : DataUrl (format préféré)
  try {
    const photo = await Camera.getPhoto({
      quality: 82,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source,
      correctOrientation: true,
      width: 1600,
      // usePicker force le sélecteur système Android (évite le bug galerie WebView)
      ...(source === CameraSource.Photos ? { presentationStyle: 'fullScreen' } : {}),
    });
    if (photo?.dataUrl) {
      const file = base64ToFile(photo.dataUrl, `img_${Date.now()}.jpg`);
      return await compressImage(file);
    }
  } catch (err) {
    const msg = err?.message || String(err);
    if (msg.includes('cancel') || msg.includes('Cancel') || msg.includes('dismiss')) return null;
    // Ne pas rejeter ici — tenter le fallback Base64
    console.warn('[nativeCamera] DataUrl failed, trying Base64:', msg);
  }

  // Tentative 2 : Base64 brut (fallback Android 10 et certains WebView)
  try {
    const photo = await Camera.getPhoto({
      quality: 80,
      allowEditing: false,
      resultType: CameraResultType.Base64,
      source,
      correctOrientation: true,
      width: 1600,
    });
    if (photo?.base64String) {
      const file = rawBase64ToFile(photo.base64String, `img_${Date.now()}.jpg`);
      if (file) return await compressImage(file);
    }
  } catch (err2) {
    const msg2 = err2?.message || String(err2);
    if (msg2.includes('cancel') || msg2.includes('Cancel') || msg2.includes('dismiss')) return null;
    throw new Error(`Impossible de charger l'image. ${msg2}`);
  }

  throw new Error('Aucune image reçue — réessayez.');
}

/**
 * @returns {Promise<File|null>} fichier ou null si annulé
 */
export async function openNativeCamera() {
  if (!isNativeApp()) return null;
  try {
    const perms = await Camera.requestPermissions({ permissions: ['camera'] });
    if (perms.camera === 'denied') {
      throw new Error('Permission caméra refusée. Allez dans Paramètres → Applications → CDL → Autorisations → Caméra → Autoriser.');
    }
    return await capturePhoto(CameraSource.Camera);
  } catch (err) {
    const msg = err?.message || String(err);
    if (msg.includes('cancel') || msg.includes('Cancel') || msg.includes('dismiss')) return null;
    throw err;
  }
}

/**
 * @returns {Promise<File|null>} fichier ou null si annulé
 */
export async function openNativeGallery() {
  if (!isNativeApp()) return null;
  try {
    // Android 13+ : 'limited' = accès partiel galerie, on l'accepte
    const perms = await Camera.requestPermissions({ permissions: ['photos'] });
    if (perms.photos === 'denied') {
      throw new Error('Permission galerie refusée. Allez dans Paramètres → Applications → CDL → Autorisations → Photos → Autoriser.');
    }
    return await capturePhoto(CameraSource.Photos);
  } catch (err) {
    const msg = err?.message || String(err);
    if (msg.includes('cancel') || msg.includes('Cancel') || msg.includes('dismiss')) return null;
    throw err;
  }
}