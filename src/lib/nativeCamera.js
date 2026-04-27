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
 * @returns {Promise<File|null>} fichier ou null si annulé
 */
export async function openNativeCamera() {
  if (!isNativeApp()) return null;

  try {
    const perms = await Camera.requestPermissions({ permissions: ['camera'] });
    if (perms.camera === 'denied') {
      throw new Error('Permission caméra refusée. Ouvrez Paramètres → Applications → CDL → Autorisations → Caméra → Autoriser.');
    }

    const photo = await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
      correctOrientation: true,
      width: 1920,
    });

    if (!photo.dataUrl) throw new Error('Aucune photo reçue');
    const file = base64ToFile(photo.dataUrl, `photo_${Date.now()}.jpg`);
    return await compressImage(file);
  } catch (err) {
    const msg = err?.message || String(err);
    if (msg.includes('User cancelled') || msg.includes('cancelled') || msg.includes('canceled')) {
      return null;
    }
    throw err;
  }
}

/**
 * @returns {Promise<File|null>} fichier ou null si annulé
 */
export async function openNativeGallery() {
  if (!isNativeApp()) return null;

  try {
    // Android 13+ : 'limited' = accès partiel, on l'accepte
    const perms = await Camera.requestPermissions({ permissions: ['photos'] });
    if (perms.photos === 'denied') {
      throw new Error('Permission galerie refusée. Ouvrez Paramètres → Applications → CDL → Autorisations → Photos → Autoriser.');
    }

    const photo = await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Photos,
      correctOrientation: true,
      width: 1920,
    });

    if (!photo.dataUrl) throw new Error('Aucune image reçue');
    const file = base64ToFile(photo.dataUrl, `galerie_${Date.now()}.jpg`);
    return await compressImage(file);
  } catch (err) {
    const msg = err?.message || String(err);
    if (msg.includes('User cancelled') || msg.includes('cancelled') || msg.includes('canceled')) {
      return null;
    }
    throw err;
  }
}