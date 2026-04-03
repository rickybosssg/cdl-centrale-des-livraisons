import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, Upload, AlertCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const TARIF = 5000;
const MAX_PHOTOS = 5;
const MAX_VIDEO_MB = 15;
const PLACEMENTS = ['accueil', 'toutes_pages'];
const ROLES = ['client', 'livreur', 'partenaire', 'commercial', 'admin'];

export default function AdminCreerPublicite() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    titre: '',
    description: '',
    placement: 'accueil',
    targets: ['client'],
    photos: [],
    video: null,
  });
  const [photoUrls, setPhotoUrls] = useState([]);
  const [videoUrl, setVideoUrl] = useState(null);

  useEffect(() => {
    const load = async () => {
      const me = await base44.auth.me();
      if (me?.role !== 'admin') {
        navigate('/admin-dashboard');
        return;
      }
      setLoading(false);
    };
    load();
  }, [navigate]);

  const handlePhotoUpload = async (file) => {
    if (photoUrls.length >= MAX_PHOTOS) {
      toast.error(`Vous pouvez ajouter au maximum ${MAX_PHOTOS} photos`);
      return;
    }
    try {
      const res = await base44.integrations.Core.UploadFile({ file });
      setPhotoUrls(prev => [...prev, res.file_url]);
      toast.success('Photo ajoutée');
    } catch (e) {
      toast.error('Erreur upload photo');
    }
  };

  const handleVideoUpload = async (file) => {
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
      toast.error(`La vidéo ne doit pas dépasser ${MAX_VIDEO_MB} MB`);
      return;
    }
    try {
      const res = await base44.integrations.Core.UploadFile({ file });
      setVideoUrl(res.file_url);
      toast.success('Vidéo ajoutée');
    } catch (e) {
      toast.error('Erreur upload vidéo');
    }
  };

  const handleSubmit = async () => {
    if (!form.titre?.trim()) {
      toast.error('Titre requis');
      return;
    }
    if (photoUrls.length === 0) {
      toast.error('Ajouter au moins une photo');
      return;
    }

    setSubmitting(true);
    try {
      const dateDebut = new Date();
      const dateFin = new Date();
      dateFin.setDate(dateFin.getDate() + 7);

      await base44.entities.Publicite.create({
        titre: form.titre,
        description: form.description || '',
        image_url: photoUrls[0],
        images: JSON.stringify(photoUrls),
        video_url: videoUrl || null,
        placement: form.placement,
        targets: form.targets,
        date_debut: dateDebut.toISOString(),
        date_fin: dateFin.toISOString(),
        active: true,
        statut: 'validée',
        cout: 0,
        nom_annonceur: 'CDL Admin',
      });

      toast.success('Publicité créée');
      navigate('/admin-mes-publicites');
    } catch (e) {
      console.error('[AdminCreerPublicite] Error:', e);
      toast.error('Erreur création publicité');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin-mes-publicites')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Créer une publicité</h1>
          <p className="text-xs text-muted-foreground">Admin - Création rapide</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-1.5">Titre</label>
            <Input
              placeholder="Titre de la publicité"
              value={form.titre}
              onChange={e => setForm(prev => ({ ...prev, titre: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1.5">Description</label>
            <textarea
              className="w-full border rounded-md px-3 py-2 text-sm resize-none"
              placeholder="Description"
              rows={3}
              value={form.description}
              onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1.5">Photos ({photoUrls.length}/{MAX_PHOTOS})</label>
            {photoUrls.length < MAX_PHOTOS && (
              <label className="block p-4 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/30 mb-2">
                <div className="flex flex-col items-center gap-2">
                  <Upload className="h-5 w-5 text-muted-foreground" />
                  <span className="text-xs font-medium">Cliquez pour upload</span>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handlePhotoUpload(file);
                  }}
                  className="hidden"
                />
              </label>
            )}
            <div className="grid grid-cols-2 gap-2">
              {photoUrls.map((url, i) => (
                <div key={i} className="relative">
                  <img src={url} alt="" className="w-full h-24 rounded-lg object-cover" />
                  <Button
                    size="sm"
                    variant="destructive"
                    className="absolute top-1 right-1 h-6 w-6 p-0"
                    onClick={() => setPhotoUrls(prev => prev.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1.5">Vidéo ({videoUrl ? '1/1' : '0/1'}) - Max {MAX_VIDEO_MB}MB</label>
            {!videoUrl && (
              <label className="block p-4 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/30">
                <div className="flex flex-col items-center gap-2">
                  <Upload className="h-5 w-5 text-muted-foreground" />
                  <span className="text-xs font-medium">Cliquez pour upload vidéo</span>
                </div>
                <input
                  type="file"
                  accept="video/*"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleVideoUpload(file);
                  }}
                  className="hidden"
                />
              </label>
            )}
            {videoUrl && (
              <div className="relative p-2 border rounded-lg bg-muted/30">
                <p className="text-xs font-medium">Vidéo uploadée ✅</p>
                <Button
                  size="sm"
                  variant="destructive"
                  className="mt-2 w-full"
                  onClick={() => setVideoUrl(null)}
                >
                  Supprimer la vidéo
                </Button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1.5">Emplacement</label>
            <Select value={form.placement} onValueChange={val => setForm(prev => ({ ...prev, placement: val }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLACEMENTS.map(p => (
                  <SelectItem key={p} value={p}>
                    {p === 'accueil' ? 'Accueil seulement' : 'Toutes les pages'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1.5">Cibles</label>
            <div className="space-y-2">
              {ROLES.map(role => (
                <label key={role} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.targets.includes(role)}
                    onChange={e => {
                      if (e.target.checked) {
                        setForm(prev => ({ ...prev, targets: [...prev.targets, role] }));
                      } else {
                        setForm(prev => ({ ...prev, targets: prev.targets.filter(r => r !== role) }));
                      }
                    }}
                    className="rounded border-input"
                  />
                  <span className="text-sm capitalize">{role}</span>
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => navigate('/admin-mes-publicites')}>
          Annuler
        </Button>
        <Button className="flex-1" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Création...' : 'Créer la publicité'}
        </Button>
      </div>
    </div>
  );
}