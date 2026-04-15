/**
 * nativeCamera.js — Wrapper caméra/galerie pour APK Capacitor + navigateur
 *
 * Dans l'APK Android (Capacitor), utilise le plugin @capacitor/camera
 * qui ouvre la caméra ou la galerie natives.
 *
 * Dans le navigateur web, retourne null pour indiquer d'utiliser
 * l'input HTML classique (géré par le composant appelant).
 *
 * Retourne toujours un objet File prêt pour l'upload.
 */

export function isNativeApp() {
  return (
    typeof window !== 'undefined' &&
    window.Capacitor !== undefined &&
    window.Capacitor.isNativePlatform &&
    window.Capacitor.isNativePlatform()
  );
}

/**
 * Convertit un dataURL base64 en File
 */
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

/**
 * Compresse une image en canvas (max 1920x1920, qualité 0.85)
 * Retourne un nouveau File compressé
 */
export async function compressImage(file, maxSize = 1920, quality = 0.85) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width <= maxSize && height <= maxSize) {
        resolve(file); // Pas besoin de compression
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
          const compressed = new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() });
          resolve(compressed);
        },
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

/**
 * Récupère le plugin Camera via window.Capacitor (injecté par l'APK)
 * Pas d'import statique — évite les erreurs de build web
 */
function getCapacitorCamera() {
  const Capacitor = window.Capacitor;
  if (!Capacitor) return null;
  // Dans Capacitor v3+, les plugins sont sur window.Capacitor.Plugins
  const Camera = Capacitor.Plugins?.Camera;
  if (!Camera) return null;
  return Camera;
}

/**
 * Ouvre la CAMÉRA native (APK) ou retourne null (navigateur)
 * @returns {Promise<File|null>}
 */
export async function openNativeCamera() {
  if (!isNativeApp()) return null;

  const Camera = getCapacitorCamera();
  if (!Camera) return null;

  try {
    // Demander permission caméra
    const perms = await Camera.requestPermissions({ permissions: ['camera'] });
    if (perms.camera !== 'granted') {
      throw new Error('Permission caméra refusée. Activez-la dans les paramètres.');
    }

    const photo = await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: 'dataUrl',
      source: 'CAMERA',
      correctOrientation: true,
      width: 1920,
    });

    if (!photo.dataUrl) throw new Error('Aucune photo reçue');
    const file = base64ToFile(photo.dataUrl, `photo_${Date.now()}.jpg`);
    return await compressImage(file);

  } catch (err) {
    if (err?.message?.includes('User cancelled') || err?.message?.includes('cancelled')) {
      return null;
    }
    throw err;
  }
}

/**
 * Ouvre la GALERIE native (APK) ou retourne null (navigateur)
 * @returns {Promise<File|null>}
 */
export async function openNativeGallery() {
  if (!isNativeApp()) return null;

  const Camera = getCapacitorCamera();
  if (!Camera) return null;

  try {
    // Demander permission photos
    const perms = await Camera.requestPermissions({ permissions: ['photos'] });
    if (perms.photos !== 'granted') {
      throw new Error('Permission galerie refusée. Activez-la dans les paramètres.');
    }

    const photo = await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: 'dataUrl',
      source: 'PHOTOS',
      correctOrientation: true,
      width: 1920,
    });

    if (!photo.dataUrl) throw new Error('Aucune image reçue');
    const file = base64ToFile(photo.dataUrl, `galerie_${Date.now()}.jpg`);
    return await compressImage(file);

  } catch (err) {
    if (err?.message?.includes('User cancelled') || err?.message?.includes('cancelled')) {
      return null;
    }
    throw err;
  }
}