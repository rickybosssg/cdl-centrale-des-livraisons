import { useState, useRef } from 'react';
import { Upload, X, GripVertical } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const MAX_IMAGES = 5;
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export default function MultiImageUploader({ images = [], onChange }) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [draggingIdx, setDraggingIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const inputRef = useRef(null);

  const handleFiles = async (files) => {
    const fileList = Array.from(files);
    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) {
      toast.error(`Maximum ${MAX_IMAGES} images autorisées`);
      return;
    }
    const toUpload = fileList.slice(0, remaining);
    if (fileList.length > remaining) {
      toast.warning(`Seulement ${remaining} image(s) ajoutée(s) (max ${MAX_IMAGES})`);
    }

    for (const file of toUpload) {
      if (file.size > MAX_SIZE) {
        toast.error(`${file.name} trop volumineux (max 5MB)`);
        continue;
      }
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name} n'est pas une image`);
        continue;
      }
      setUploading(true);
      try {
        const res = await base44.integrations.Core.UploadFile({ file });
        onChange([...images, res.file_url]);
      } catch (err) {
        toast.error('Erreur upload: ' + err.message);
      } finally {
        setUploading(false);
      }
    }
  };

  const removeImage = (idx) => {
    const next = images.filter((_, i) => i !== idx);
    onChange(next);
  };

  // Drag & drop reorder
  const onDragStart = (idx) => setDraggingIdx(idx);
  const onDragEnter = (idx) => setDragOverIdx(idx);
  const onDragEnd = () => {
    if (draggingIdx !== null && dragOverIdx !== null && draggingIdx !== dragOverIdx) {
      const next = [...images];
      const [moved] = next.splice(draggingIdx, 1);
      next.splice(dragOverIdx, 0, moved);
      onChange(next);
    }
    setDraggingIdx(null);
    setDragOverIdx(null);
  };

  return (
    <div className="space-y-3">
      {/* Zone de drop */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary hover:bg-primary/5'
        } ${images.length >= MAX_IMAGES ? 'opacity-50 pointer-events-none' : ''}`}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Upload en cours...</p>
          </div>
        ) : (
          <>
            <Upload className="h-7 w-7 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium">
              {images.length >= MAX_IMAGES
                ? `Maximum ${MAX_IMAGES} images atteint`
                : 'Cliquez ou glissez des images ici'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              JPG, PNG · Max 5MB · {images.length}/{MAX_IMAGES} images
            </p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {/* Prévisualisation & réorganisation */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {images.map((url, idx) => (
            <div
              key={url + idx}
              draggable
              onDragStart={() => onDragStart(idx)}
              onDragEnter={() => onDragEnter(idx)}
              onDragEnd={onDragEnd}
              className={`relative rounded-xl overflow-hidden border-2 transition-all cursor-grab ${
                dragOverIdx === idx && draggingIdx !== idx
                  ? 'border-primary scale-105'
                  : 'border-transparent'
              } ${draggingIdx === idx ? 'opacity-50' : ''}`}
              style={{ aspectRatio: '1' }}
            >
              <img
                src={url}
                alt={`Image ${idx + 1}`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              {/* Badge position */}
              <div className="absolute top-1 left-1 bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {idx + 1}
              </div>
              {/* Drag handle */}
              <div className="absolute bottom-1 left-1 bg-black/40 text-white rounded p-0.5">
                <GripVertical className="h-3 w-3" />
              </div>
              {/* Supprimer */}
              <button
                type="button"
                onClick={() => removeImage(idx)}
                className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full p-0.5 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {images.length > 1 && (
        <p className="text-[11px] text-muted-foreground text-center">
          Glissez-déposez pour réorganiser l'ordre des images
        </p>
      )}
    </div>
  );
}