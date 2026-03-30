import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Upload, Store } from "lucide-react";
import QuartierSelect from "@/components/QuartierSelect";
import { toast } from "sonner";

const TYPES = ["Restaurant", "Pharmacie", "Boutique", "Alimentation", "Boissons", "Vitrine"];

export default function CreerBoutiqueAdmin() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    nom_commerce: "", type_commerce: "Boutique", description: "", quartier: "", adresse: "",
    telephone: "", whatsapp: "", horaires: "", nom_responsable: "",
    email_partenaire: "",
  });
  const [logoFile, setLogoFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [galerieFiles, setGalerieFiles] = useState([]);
  const [saving, setSaving] = useState(false);

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.nom_commerce || !form.telephone) { toast.error("Nom et téléphone requis"); return; }
    if (!form.email_partenaire) { toast.error("L'email du partenaire est requis"); return; }
    setSaving(true);

    let logo = "", photo_principale = "";
    const galerieUrls = [];

    if (logoFile) { const r = await base44.integrations.Core.UploadFile({ file: logoFile }); logo = r.file_url; }
    if (coverFile) { const r = await base44.integrations.Core.UploadFile({ file: coverFile }); photo_principale = r.file_url; }
    for (const f of galerieFiles) {
      const r = await base44.integrations.Core.UploadFile({ file: f });
      galerieUrls.push(r.file_url);
    }

    // Créer la fiche partenaire
    await base44.entities.Partenaire.create({
      user_email: form.email_partenaire,
      nom_commerce: form.nom_commerce,
      nom_responsable: form.nom_responsable || form.nom_commerce,
      telephone: form.telephone,
      whatsapp: form.whatsapp || form.telephone,
      type_commerce: form.type_commerce,
      description: form.description,
      quartier: form.quartier,
      adresse: form.adresse,
      horaires: form.horaires,
      logo,
      photo_principale,
      galerie_photos: JSON.stringify(galerieUrls),
      statut: "actif",
      statut_abonnement: "Actif",
      ouvert: true,
      nombre_vues: 0,
      nombre_commandes: 0,
      nombre_clics_commander: 0,
      chiffre_affaires: 0,
      date_paiement_abonnement: new Date().toISOString(),
      date_expiration_abonnement: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });

    // Mettre à jour le User correspondant si existant
    try {
      const users = await base44.entities.User.filter({ email: form.email_partenaire });
      if (users.length > 0) {
        await base44.entities.User.update(users[0].id, {
          user_type: "partenaire",
          onboarding_completed: true,
          profil_valide: true,
          statut_validation_partenaire: "valide",
        });
      }
    } catch (_) {}

    toast.success(`Boutique "${form.nom_commerce}" créée et activée !`);
    navigate("/gerer-partenaires");
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="text-xl font-bold">Créer une boutique</h1>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <p className="text-sm font-semibold text-primary flex items-center gap-2"><Store className="h-4 w-4" />Informations boutique</p>

          <div className="space-y-1">
            <Label>Nom de la boutique *</Label>
            <Input placeholder="Ex: Restaurant Chez Fatou" value={form.nom_commerce} onChange={e => update("nom_commerce", e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>Catégorie *</Label>
            <div className="grid grid-cols-3 gap-2">
              {TYPES.map(t => (
                <button key={t} onClick={() => update("type_commerce", t)}
                  className={`p-2 rounded-lg border text-xs font-medium transition-all ${form.type_commerce === t ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <Label>Description</Label>
            <Input placeholder="Description de la boutique..." value={form.description} onChange={e => update("description", e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Téléphone *</Label>
              <Input placeholder="+226 XX XX XX XX" value={form.telephone} onChange={e => update("telephone", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>WhatsApp</Label>
              <Input placeholder="+226 XX XX XX XX" value={form.whatsapp} onChange={e => update("whatsapp", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Quartier</Label>
            <QuartierSelect value={form.quartier} onValueChange={v => update("quartier", v)} placeholder="Quartier de la boutique" />
          </div>

          <div className="space-y-1">
            <Label>Adresse précise</Label>
            <Input placeholder="Ex: Rue 12.34, Ouaga 2000" value={form.adresse} onChange={e => update("adresse", e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>Horaires d'ouverture</Label>
            <Input placeholder="Ex: Lun-Sam 8h-20h" value={form.horaires} onChange={e => update("horaires", e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>Nom du responsable</Label>
            <Input placeholder="Nom du propriétaire" value={form.nom_responsable} onChange={e => update("nom_responsable", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-4">
          <p className="text-sm font-semibold text-primary">👤 Compte partenaire</p>
          <div className="space-y-1">
            <Label>Email du partenaire * <span className="text-xs text-muted-foreground">(compte utilisateur CDL)</span></Label>
            <Input type="email" placeholder="partenaire@email.com" value={form.email_partenaire} onChange={e => update("email_partenaire", e.target.value)} />
            <p className="text-xs text-muted-foreground">L'utilisateur doit déjà avoir un compte CDL. Ses accès seront activés automatiquement.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-4">
          <p className="text-sm font-semibold text-primary">🖼️ Visuels</p>

          <div className="space-y-1">
            <Label>Logo</Label>
            <input type="file" accept="image/*" className="hidden" id="logo_admin" onChange={e => setLogoFile(e.target.files[0])} />
            <label htmlFor="logo_admin" className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-sm transition-colors ${logoFile ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted"}`}>
              <Upload className="h-4 w-4" />{logoFile ? logoFile.name : "Choisir le logo"}
            </label>
          </div>

          <div className="space-y-1">
            <Label>Photo de couverture</Label>
            <input type="file" accept="image/*" className="hidden" id="cover_admin" onChange={e => setCoverFile(e.target.files[0])} />
            <label htmlFor="cover_admin" className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-sm transition-colors ${coverFile ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted"}`}>
              <Upload className="h-4 w-4" />{coverFile ? coverFile.name : "Choisir la couverture"}
            </label>
          </div>

          <div className="space-y-1">
            <Label>Galerie photos (plusieurs)</Label>
            <input type="file" accept="image/*" multiple className="hidden" id="galerie_admin" onChange={e => setGalerieFiles(Array.from(e.target.files))} />
            <label htmlFor="galerie_admin" className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-sm transition-colors ${galerieFiles.length > 0 ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted"}`}>
              <Upload className="h-4 w-4" />{galerieFiles.length > 0 ? `${galerieFiles.length} photo(s) sélectionnée(s)` : "Choisir des photos"}
            </label>
          </div>
        </CardContent>
      </Card>

      <Button className="w-full h-12 text-base" onClick={handleSubmit} disabled={saving}>
        {saving ? "Création en cours..." : "✅ Créer et activer la boutique"}
      </Button>
    </div>
  );
}