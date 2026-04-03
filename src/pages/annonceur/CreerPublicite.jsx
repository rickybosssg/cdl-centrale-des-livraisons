import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Upload, AlertCircle } from "lucide-react";
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

  const [form, setForm] = useState({
    titre: "",
    description: "",
    image_url: "",
    lien_url: "",
    placement: "accueil",
    targets: ["client"],
  });

  useEffect(() => {
    const load = async () => {
      try {
        const res = await base44.functions.invoke("bedouEngine", { action: "get_bedou" });
        setBedou(res.data?.bedou || null);
      } catch (e) {
        console.error("[CreerPublicite] bedou error:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleImageUpload = async (file) => {
    try {
      const res = await base44.integrations.Core.UploadFile({ file });
      setForm(prev => ({ ...prev, image_url: res.file_url }));
      toast.success("Image uploadée");
    } catch (e) {
      console.error("[CreerPublicite] Upload error:", e);
      toast.error("Erreur upload image");
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

    setSubmitting(true);
    try {
      const dateDebut = new Date();
      const dateFin = new Date();
      dateFin.setDate(dateFin.getDate() + DUREE_JOURS);

      await base44.entities.Publicite.create({
        titre: form.titre,
        description: form.description || "",
        image_url: form.image_url,
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

          {/* Image */}
          <div>
            <label className="block text-sm font-semibold mb-1.5">Image publicitaire</label>
            {form.image_url ? (
              <div className="space-y-2">
                <img src={form.image_url} alt="Aperçu" className="w-full h-32 rounded-lg object-cover" />
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setForm(prev => ({ ...prev, image_url: "" }))}
                >
                  Changer l'image
                </Button>
              </div>
            ) : (
              <label className="block p-4 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/30 transition-colors">
                <div className="flex flex-col items-center gap-2">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  <span className="text-sm font-medium">Cliquez pour upload</span>
                  <span className="text-[10px] text-muted-foreground">PNG, JPG jusqu'à 5MB</span>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleImageUpload(file);
                  }}
                  className="hidden"
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