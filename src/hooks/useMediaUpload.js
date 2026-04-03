import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export function useMediaUpload() {
  const [uploading, setUploading] = useState(false);

  const uploadImage = async (file) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Seules les images sont acceptées');
      return null;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image trop volumineuse (max 5MB)');
      return null;
    }

    setUploading(true);
    try {
      const res = await base44.integrations.Core.UploadFile({ file });
      toast.success('Image uploadée');
      return res.file_url;
    } catch (err) {
      console.error('[uploadImage]', err);
      toast.error('Erreur upload image');
      return null;
    } finally {
      setUploading(false);
    }
  };

  const uploadVideo = async (file) => {
    if (!file.type.startsWith('video/')) {
      toast.error('Seules les vidéos sont acceptées (mp4)');
      return null;
    }
    if (file.size > 100 * 1024 * 1024) {
      toast.error('Vidéo trop volumineuse (max 100MB)');
      return null;
    }

    setUploading(true);
    try {
      const res = await base44.integrations.Core.UploadFile({ file });
      toast.success('Vidéo uploadée');
      return res.file_url;
    } catch (err) {
      console.error('[uploadVideo]', err);
      toast.error('Erreur upload vidéo');
      return null;
    } finally {
      setUploading(false);
    }
  };

  return { uploadImage, uploadVideo, uploading };
}