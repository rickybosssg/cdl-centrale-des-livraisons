import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Upload, AlertCircle, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const TARIF = 5000;
const DUREE_JOURS = 7;
const PLACEMENTS = ["accueil", "toutes_pages"];
const ROLES = ["client", "livreur", "partenaire", "commercial", "admin"];

export default function CreerPublicite({ user }) {
  const navigate = useNavigate();
  const [bedou, setBedou] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [uploadingVid, setUploadingVid] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({
    titre: "",
    description: "",
    image_url: "",
    images: [],
    video_url: "",
    video_title: "",
    lien_url: "",
    placement: "accueil",
    targets: ["client"],
  });

  useEffect(() => {
    const load = async () => {
      try {
        if (!user?.email) {
          setError('Utilisateur non authentifié');
          setLoading(false);
          return;
        }
        const res = await base44.functions.invoke("bedouEngine", { action: "get_bedou" });
        setBedou(res.data?.bedou || null);
      } catch (e) {
        console.error("[CreerPublicite] bedou error:", e);
        setError('Erreur lors du chargement du solde');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.email]);

  const MAX_IMAGES = 5;
  const MAX_IMG_MB = 8;
  const MAX_VID_MB = 15;

  const handleImageUpload = async (file, isMulti = false) => {
    if (!file.type.match(/^image\/(jpeg|png|webp|gif)$/)) {
      toast.error('Format accepté : JPG, PNG, WEBP');
      return;
    }
    if (file.size > MAX_IMG_MB * 1024 * 1024) {
      toast.error(`Image trop lourde (max ${MAX_IMG_MB} MB)`);
      return;
    }
    if (isMulti && (form.images || []).length >= MAX_IMAGES) {
      toast.error(`Maximum ${MAX_IMAGES} images autorisées`);
      return;
    }
    setUploadingImg(true);
    try {
      const res = await base44.integrations.Core.UploadFile({ file });
      if (isMulti) {
        setForm(prev => ({ ...prev, images: [...(prev.images || []), res.file_url] }));
      } else {
        setForm(prev => ({ ...prev, image_url: res.file_url }));
      }
      toast.success('Photo ajoutée ✓');
    } catch (e) {
      toast.error('Erreur upload — vérifiez votre connexion');
    } finally {
      setUploadingImg(false);
    }
  };

  const handleVideoUpload = async (file) => {
    if (!file.type.match(/^video\/(mp4|quicktime|x-m4v)$/)) {
      toast.error('Format vidéo accepté : MP4, MOV');
      return;
    }
    if (file.size > MAX_VID_MB * 1024 * 1024) {
      toast.error(`Vidéo trop volumineuse (max ${MAX_VID_MB} MB)`);
      return;
    }
    setUploadingVid(true);
    try {
      const res = await base44.integrations.Core.UploadFile({ file });
      setForm(prev => ({ ...prev, video_url: res.file_url }));
      toast.success('Vidéo uploadée ✓');
    } catch (e) {
      toast.error('Erreur upload vidéo — vérifiez votre connexion');
    } finally {
      setUploadingVid(false);
    }
  };

  const handleSubmit = async () => {
    // Validations
    if (!form.titre?.trim()) {
      toast.error("Titre requis");
      return;
    }
    if (!form.image_url) {
      toast.error("Image requise");
      return;
    }

    const soldeDisp = bedou?.solde_disponible || 0;
    if (soldeDisp < TARIF) {
      toast.error(`Solde insuffisant (${TARIF.toLocaleString()}F requis)`);
      return;
    }

    if (!user?.email) {
      toast.error("Utilisateur non authentifié");
      return;
    }

    setSubmitting(true);
    try {
      const dateDebut = new Date();
      const dateFin = new Date();
      dateFin.setDate(dateFin.getDate() + DUREE_JOURS);

      await base44.entities.Publicite.create({
        titre: form.titre,
        description: form.description || "",
        image_url: form.image_url,
        images: form.images.length > 0 ? JSON.stringify(form.images) : "",
        video_url: form.video_url || "",
        video_title: form.video_title || "",
        lien_url: form.lien_url || "",
        placement: form.placement,
        targets: form.targets,
        date_debut: dateDebut.toISOString(),
        date_fin: dateFin.toISOString(),
        active: false,
        statut: "en_attente",
        cout: TARIF,
        impressions: 0,
        clics: 0,
        created_by: user.email,
      });

      toast.success("Publicité créée ! En attente de validation admin");
      navigate("/dashboard-annonceur");
    } catch (e) {
      console.error("[CreerPublicite] Submit error:", e);
      toast.error("Erreur création publicité");
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

  if (error) {
    return (
      <div className="text-center py-12 space-y-4">
        <p className="text-red-600 font-semibold">{error}</p>
        <Button onClick={() => window.location.reload()}>Réessayer</Button>
      </div>
    );
  }

  const soldeDisp = bedou?.solde_disponible || 0;
  const soldeOk = soldeDisp >= TARIF;

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Créer une publicité</h1>
          <p className="text-xs text-muted-foreground">Tarif : {TARIF.toLocaleString()}F pour {DUREE_JOURS} jours</p>
        </div>
      </div>

      {/* Alerte solde */}
      {!soldeOk && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
          <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-700">
            <p className="font-semibold">Solde insuffisant</p>
            <p className="text-xs mt-1">
              Vous avez {soldeDisp.toLocaleString()}F. Vous avez besoin de {TARIF.toLocaleString()}F pour publier.
            </p>
          </div>
        </div>
      )}

      {/* Formulaire */}
      <Card>
        <CardContent className="p-4 space-y-4">
          {/* Titre */}
          <div>
            <label className="block text-sm font-semibold mb-1.5">Titre de la publicité</label>
            <Input
              placeholder="Ex: Livraison rapide 24/7"
              value={form.titre}
              onChange={e => setForm(prev => ({ ...prev, titre: e.target.value }))}
              maxLength={100}
            />
            <p className="text-[10px] text-muted-foreground mt-1">{form.titre.length}/100</p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-semibold mb-1.5">Description (optionnel)</label>
            <textarea
              className="w-full border rounded-md px-3 py-2 text-sm placeholder:text-muted-foreground resize-none"
              placeholder="Description détaillée"
              rows={3}
              value={form.description}
              onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
              maxLength={500}
            />
            <p className="text-[10px] text-muted-foreground mt-1">{form.description.length}/500</p>
          </div>

          {/* Image principale */}
          <div>
            <label className="block text-sm font-semibold mb-1.5">
              Image principale <span className="text-red-500">*</span>
            </label>
            {form.image_url ? (
              <div className="space-y-2">
                <div className="relative rounded-xl overflow-hidden bg-gray-100">
                  <img src={form.image_url} alt="Aperçu" className="w-full aspect-video object-cover" />
                  <button
                    onClick={() => setForm(prev => ({ ...prev, image_url: "" }))}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-7 h-7 flex items-center justify-center active:scale-90"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <label className={`block p-5 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${uploadingImg ? 'bg-primary/5 border-primary/30' : 'hover:bg-muted/30'}`}>
                <div className="flex flex-col items-center gap-2 text-center">
                  {uploadingImg
                    ? <Loader2 className="h-7 w-7 text-primary animate-spin" />
                    : <Upload className="h-7 w-7 text-muted-foreground" />}
                  <span className="text-sm font-semibold">{uploadingImg ? 'Envoi en cours…' : 'Ajouter une photo'}</span>
                  <span className="text-[11px] text-muted-foreground">JPG, PNG, WEBP · max 8 MB</span>
                </div>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ''; }}
                  className="hidden"
                  disabled={uploadingImg}
                />
              </label>
            )}
          </div>

          {/* Galerie multi-images (max 5) */}
          <div>
            <label className="block text-sm font-semibold mb-1.5">
              Galerie d'images supplémentaires
              <span className="ml-1 text-xs font-normal text-muted-foreground">({(form.images || []).length}/{5} max)</span>
            </label>
            <div className="space-y-2">
              {(form.images || []).length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {form.images.map((img, idx) => (
                    <div key={idx} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 border">
                      <img src={img} alt={`Image ${idx + 1}`} className="w-full h-full object-cover" />
                      <button
                        onClick={() => setForm(prev => ({ ...prev, images: prev.images.filter((_, i) => i !== idx) }))}
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center active:scale-90"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {(form.images || []).length < 5 && (
                <label className={`block p-3 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${uploadingImg ? 'opacity-50 pointer-events-none' : 'hover:bg-muted/30'}`}>
                  <div className="flex items-center justify-center gap-2">
                    {uploadingImg
                      ? <Loader2 className="h-4 w-4 text-primary animate-spin" />
                      : <Upload className="h-4 w-4 text-muted-foreground" />}
                    <span className="text-xs font-medium">{uploadingImg ? 'Envoi…' : 'Ajouter des photos'}</span>
                  </div>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={e => { Array.from(e.target.files || []).forEach(f => handleImageUpload(f, true)); e.target.value = ''; }}
                    className="hidden"
                    disabled={uploadingImg}
                  />
                </label>
              )}
            </div>
          </div>

          {/* Vidéo */}
          <div>
            <label className="block text-sm font-semibold mb-1.5">Vidéo (optionnel)</label>
            {form.video_url ? (
              <div className="space-y-2">
                <div className="aspect-video rounded-xl overflow-hidden bg-gray-900">
                  <video src={form.video_url} className="w-full h-full object-cover" controls muted playsInline />
                </div>
                <Input
                  placeholder="Titre de la vidéo (optionnel)"
                  value={form.video_title}
                  onChange={e => setForm(prev => ({ ...prev, video_title: e.target.value }))}
                />
                <button
                  onClick={() => setForm(prev => ({ ...prev, video_url: '', video_title: '' }))}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                >
                  Supprimer la vidéo
                </button>
              </div>
            ) : (
              <label className={`block p-5 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${uploadingVid ? 'bg-primary/5 border-primary/30' : 'hover:bg-muted/30'}`}>
                <div className="flex flex-col items-center gap-2 text-center">
                  {uploadingVid
                    ? <Loader2 className="h-7 w-7 text-primary animate-spin" />
                    : <Upload className="h-7 w-7 text-muted-foreground" />}
                  <span className="text-sm font-semibold">{uploadingVid ? 'Envoi en cours…' : 'Ajouter une vidéo'}</span>
                  <span className="text-[11px] text-muted-foreground">MP4, MOV · max 15 MB</span>
                </div>
                <input
                  type="file"
                  accept="video/mp4,video/quicktime,video/x-m4v"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleVideoUpload(f); e.target.value = ''; }}
                  className="hidden"
                  disabled={uploadingVid}
                />
              </label>
            )}
          </div>

          {/* Lien */}
          <div>
            <label className="block text-sm font-semibold mb-1.5">Lien de redirection (optionnel)</label>
            <Input
              placeholder="https://..."
              value={form.lien_url}
              onChange={e => setForm(prev => ({ ...prev, lien_url: e.target.value }))}
            />
          </div>

          {/* Placement */}
          <div>
            <label className="block text-sm font-semibold mb-1.5">Où afficher ?</label>
            <Select value={form.placement} onValueChange={val => setForm(prev => ({ ...prev, placement: val }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLACEMENTS.map(p => (
                  <SelectItem key={p} value={p}>
                    {p === "accueil" ? "Accueil seulement" : "Toutes les pages"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Cibles */}
          <div>
            <label className="block text-sm font-semibold mb-1.5">Cibler les profils</label>
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

      {/* Résumé */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-4 space-y-1.5">
          <p className="text-sm font-semibold">Résumé</p>
          <div className="text-xs text-muted-foreground space-y-0.5">
            <p>Tarif : <strong className="text-foreground">{TARIF.toLocaleString()} FCFA</strong></p>
            <p>Durée : <strong className="text-foreground">{DUREE_JOURS} jours</strong></p>
            <p>Solde actuel : <strong className={soldeOk ? "text-green-600" : "text-red-600"}>{soldeDisp.toLocaleString()} FCFA</strong></p>
            <p className="text-[10px] italic">Débit au moment de la validation admin</p>
          </div>
        </CardContent>
      </Card>

      {/* Boutons */}
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => navigate(-1)}>
          Annuler
        </Button>
        <Button className="flex-1" onClick={handleSubmit} disabled={!soldeOk || submitting}>
          {submitting ? "Création..." : "Créer la publicité"}
        </Button>
      </div>
    </div>
  );
}