import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, ArrowLeft, Store, Pill, ShoppingBag, UtensilsCrossed, Wine, Sparkles } from "lucide-react";
import QuartierSelect from "./QuartierSelect";
import { toast } from "sonner";

const TYPES = [
  { value: "Restaurant", label: "Restaurant", icon: UtensilsCrossed, color: "bg-orange-100 text-orange-600" },
  { value: "Pharmacie", label: "Pharmacie", icon: Pill, color: "bg-green-100 text-green-600" },
  { value: "Boutique", label: "Boutique", icon: ShoppingBag, color: "bg-blue-100 text-blue-600" },
  { value: "Alimentation", label: "Alimentation", icon: Store, color: "bg-yellow-100 text-yellow-600" },
  { value: "Boissons", label: "Boissons", icon: Wine, color: "bg-purple-100 text-purple-600" },
  { value: "Vitrine", label: "Vitrine", icon: Sparkles, color: "bg-pink-100 text-pink-600" },
];

export default function InscriptionPartenaire({ onBack, onComplete }) {
  const [step, setStep] = useState(1);
  const [typeCommerce, setTypeCommerce] = useState(null);
  const [loading, setLoading] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [form, setForm] = useState({
    nom_commerce: "", nom_responsable: "", telephone: "",
    quartier: "", adresse: "", description: "", horaires: "",
    type_activite: "",
  });

  const handleSubmit = async () => {
    if (!form.nom_commerce || !form.telephone || !form.quartier) {
      toast.error("Veuillez remplir tous les champs obligatoires");
      return;
    }
    setLoading(true);
    let photo_principale = "";
    if (photoFile) {
      const res = await base44.integrations.Core.UploadFile({ file: photoFile });
      photo_principale = res.file_url;
    }
    const user = await base44.auth.me();
    const expiration = new Date();
    expiration.setMonth(expiration.getMonth() + 1);

    await base44.entities.Partenaire.create({
      user_email: user.email,
      nom_commerce: form.nom_commerce,
      nom_responsable: form.nom_responsable,
      telephone: form.telephone,
      type_commerce: typeCommerce,
      type_activite: form.type_activite,
      quartier: form.quartier,
      adresse: form.adresse,
      description: form.description,
      horaires: form.horaires,
      photo_principale,
      ouvert: true,
      statut: "en_attente",
      statut_abonnement: "Actif",
      date_paiement_abonnement: new Date().toISOString(),
      date_expiration_abonnement: expiration.toISOString(),
      nombre_vues: 0,
      nombre_clics_commander: 0,
      nombre_contacts: 0,
      nombre_commandes: 0,
    });
    await base44.auth.updateMe({ user_type: "partenaire", telephone: form.telephone });
    toast.success("Commerce enregistré ! En attente de validation CDL.");
    setLoading(false);
    onComplete();
  };

  if (step === 1) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <h2 className="text-xl font-bold">Type de commerce</h2>
            <p className="text-sm text-muted-foreground mt-1">Commerce, service ou vitrine ?</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {TYPES.map((t) => {
              const Icon = t.icon;
              return (
                <Card
                  key={t.value}
                  className={`cursor-pointer transition-all hover:shadow-md ${typeCommerce === t.value ? "ring-2 ring-primary border-primary" : ""}`}
                  onClick={() => setTypeCommerce(t.value)}
                >
                  <CardContent className="p-4 flex flex-col items-center gap-2 text-center">
                    <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${t.color}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <p className="text-sm font-semibold">{t.label}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onBack} className="flex-1"><ArrowLeft className="h-4 w-4 mr-1" />Retour</Button>
            <Button className="flex-1" disabled={!typeCommerce} onClick={() => setStep(2)}>Continuer</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 bg-background">
      <div className="max-w-sm mx-auto space-y-5 pb-8">
        <div className="text-center pt-4">
          <h2 className="text-xl font-bold">{typeCommerce === "Vitrine" ? "Votre vitrine" : "Votre commerce"}</h2>
          <p className="text-sm text-muted-foreground">{typeCommerce}</p>
        </div>

        <div className="space-y-3">
          <div><Label>{typeCommerce === "Vitrine" ? "Nom de l'activité *" : "Nom du commerce *"}</Label>
            <Input placeholder={typeCommerce === "Vitrine" ? "Ex: Couture Aminata, Design Graphique..." : "Ex: Restaurant Le Délice"} value={form.nom_commerce} onChange={e => setForm(f => ({ ...f, nom_commerce: e.target.value }))} /></div>
          <div><Label>Nom du responsable *</Label>
            <Input placeholder="Votre nom complet" value={form.nom_responsable} onChange={e => setForm(f => ({ ...f, nom_responsable: e.target.value }))} /></div>
          <div><Label>Téléphone *</Label>
            <Input placeholder="+226 XX XX XX XX" value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))} /></div>
          <div><Label>Quartier *</Label>
            <QuartierSelect value={form.quartier} onValueChange={v => setForm(f => ({ ...f, quartier: v }))} placeholder="Votre quartier" /></div>
          <div><Label>Adresse</Label>
            <Input placeholder="Rue, avenue, côté..." value={form.adresse} onChange={e => setForm(f => ({ ...f, adresse: e.target.value }))} /></div>
          <div><Label>Description</Label>
            <Textarea rows={3} placeholder="Décrivez votre commerce..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          {typeCommerce === "Vitrine" && (
            <div><Label>Type d'activité</Label>
              <Input placeholder="Ex: Couture, Design, Commerce, Freelance..." value={form.type_activite} onChange={e => setForm(f => ({ ...f, type_activite: e.target.value }))} /></div>
          )}
          <div><Label>Horaires / Disponibilité</Label>
            <Input placeholder="Ex: Lun-Sam 7h-20h ou Sur rendez-vous" value={form.horaires} onChange={e => setForm(f => ({ ...f, horaires: e.target.value }))} /></div>
          <div>
            <Label>Photo</Label>
            <div className="mt-1">
              <input type="file" accept="image/*" className="hidden" id="photo_commerce" onChange={e => setPhotoFile(e.target.files[0])} />
              <label htmlFor="photo_commerce" className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer text-sm transition-colors ${photoFile ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted"}`}>
                <Upload className="h-4 w-4" />
                {photoFile ? photoFile.name : "Choisir une photo"}
              </label>
            </div>
          </div>
        </div>

        <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-xs text-muted-foreground">
          <p className="font-semibold text-primary mb-1">💳 Abonnement mensuel : 30 000 FCFA</p>
          <p>Votre compte sera activé après validation par l'équipe CDL et règlement de l'abonnement.</p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setStep(1)} className="flex-1">Retour</Button>
          <Button className="flex-1" onClick={handleSubmit} disabled={loading || !form.nom_commerce || !form.telephone || !form.quartier}>
            {loading ? "Enregistrement..." : "S'inscrire"}
          </Button>
        </div>
      </div>
    </div>
  );
}