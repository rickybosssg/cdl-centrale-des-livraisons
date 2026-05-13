/**
 * UploadEngine — SOURCE UNIQUE pour tous les uploads fichiers
 *
 * COMPATIBILITÉ : wrapper autour de base44.integrations.Core.UploadFile
 * Gère : preuves recharge, documents livreurs, photos colis, pubs images/vidéos
 *        compression, retry automatique
 *
 * LOGS : [ENGINE_INIT] [ENGINE_READY] [ENGINE_MIGRATION_OK] [ENGINE_ERROR]
 */

import { base44 } from '@/api/base44Client';

const ENGINE_VERSION = '1.0.0';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const MAX_IMAGE_SIZE_MB = 5;
const MAX_VIDEO_SIZE_MB = 50;

console.log(`[ENGINE_INIT] UploadEngine v${ENGINE_VERSION}`);

/** Attendre N ms */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** Compresser une image avant upload (canvas) */
async function compressImage(file, maxWidthPx = 1280, quality = 0.8) {
  if (!file.type.startsWith('image/')) return file;
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      const ratio = Math.min(maxWidthPx / img.width, maxWidthPx / img.height, 1);
      canvas.width = img.width * ratio;
      canvas.height = img.height * ratio;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob && blob.size < file.size) {
          const compressed = new File([blob], file.name, { type: 'image/jpeg' });
          console.log(`[ENGINE_MIGRATION_OK] UploadEngine.compress | ${(file.size / 1024).toFixed(0)}KB → ${(compressed.size / 1024).toFixed(0)}KB`);
          resolve(compressed);
        } else {
          resolve(file); // Pas de gain → garder original
        }
      }, 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

/** Valider la taille du fichier */
function validateSize(file, type = 'image') {
  const maxMB = type === 'video' ? MAX_VIDEO_SIZE_MB : MAX_IMAGE_SIZE_MB;
  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > maxMB) {
    throw new Error(`Fichier trop volumineux : ${sizeMB.toFixed(1)} MB (max ${maxMB} MB)`);
  }
}

const UploadEngine = {
  version: ENGINE_VERSION,

  /**
   * Upload générique avec retry automatique
   * @param {File} file — fichier à uploader
   * @param {object} options — { compress: bool, context: string }
   * @returns {{ file_url: string }}
   */
  async upload(file, options = {}) {
    const { compress = true, context = 'generic', onProgress } = options;
    const fileType = file.type.startsWith('video/') ? 'video' : 'image';

    validateSize(file, fileType);

    let fileToUpload = file;
    if (compress && fileType === 'image') {
      fileToUpload = await compressImage(file);
    }

    console.log(`[ENGINE_INIT] UploadEngine.upload | context=${context} | size=${(fileToUpload.size / 1024).toFixed(0)}KB | type=${file.type}`);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await base44.integrations.Core.UploadFile({ file: fileToUpload });
        console.log(`[ENGINE_MIGRATION_OK] UploadEngine.upload | context=${context} | attempt=${attempt} | url=${result.file_url?.slice(0, 50)}...`);
        return result;
      } catch (e) {
        console.error(`[ENGINE_ERROR] UploadEngine.upload | context=${context} | attempt=${attempt}/${MAX_RETRIES} | ${e.message}`);
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS * attempt);
        } else {
          throw new Error(`Upload échoué après ${MAX_RETRIES} tentatives: ${e.message}`);
        }
      }
    }
  },

  /** Upload preuve de recharge */
  async uploadRechargeProof(file) {
    return this.upload(file, { compress: true, context: 'recharge_proof' });
  },

  /** Upload document livreur */
  async uploadDriverDocument(file, documentType) {
    return this.upload(file, { compress: true, context: `driver_doc_${documentType}` });
  },

  /** Upload photo colis */
  async uploadColisPhoto(file) {
    return this.upload(file, { compress: true, context: 'colis_photo' });
  },

  /** Upload image publicité */
  async uploadAdImage(file) {
    return this.upload(file, { compress: true, context: 'publicite_image' });
  },

  /** Upload vidéo publicité */
  async uploadAdVideo(file) {
    return this.upload(file, { compress: false, context: 'publicite_video' });
  },

  /** Upload photo de profil */
  async uploadProfilePhoto(file) {
    return this.upload(file, { compress: true, context: 'profile_photo' });
  },
};

console.log(`[ENGINE_READY] UploadEngine v${ENGINE_VERSION} chargé`);

export default UploadEngine;