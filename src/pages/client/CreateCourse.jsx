import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Phone, Package, ArrowLeft } from "lucide-react";
import QuartierSelect from "../../components/QuartierSelect";
import { lancerDispatch } from "@/lib/dispatch";
import { PRIX_PAR_TYPE } from "@/lib/quartiers";
import { toast } from "sonner";

const TYPES_COLIS = ["Documents", "Petit colis", "Colis moyen", "Gros colis", "Nourriture", "Autre"];
const MODES_PAIEMENT = ["Orange Money", "Moov Money", "Telecel Money", "Paiement à la livraison"];

export default function CreateCourse() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [form, setForm] = useState({
    quartier_depart: "",
    quartier_arrivee: "",
    telephone_expediteur: "",
    telephone_destinataire: "",
    type_colis: "",
    description: "",
    mode_paiement: "",
  });

  useEffect(() => {
    const load = async () => {
      const me = await base44.auth.me();
      setUser(me);
      setForm(f => ({ ...f, telephone_expediteur: me.telephone || "" }));
    };
    load();
  }, []);

  const prix = PRIX_PAR_TYPE[form.type_colis] || 0;
  const commission = Math.round(prix * 0.2);

  const handleSubmit = async () => {
    if (!form.quartier_depart || !form.quartier_arrivee || !form.telephone_expediteur || !form.telephone_destinataire || !form.type_colis) {
      toast.error("Veuillez remplir tous les champs obligatoires");
      return;
    }
    setLoading(true);
    if (!form.mode_paiement) {
      toast.error("Veuillez choisir un mode de paiement");
      return;
    }
    setLoading(true);
    const statut_paiement = form.mode_paiement === "Paiement à la livraison" ? "paiement_livraison" : "en_attente";
    const courseData = await base44.entities.Course.create({
      ...form,
      statut: "en_attente",
      statut_paiement,
      client_email: user.email,
      client_name: user.full_name,
      prix: prix,
      commission: commission,
      commission_active: true,
      commission_cdl: commission,
      gain_livreur: prix - commission,
      statut_paiement_livreur: "Commission due",
      nombre_tentatives: 0,
    });
    // Lancer le dispatch automatique
    lancerDispatch(courseData);
    toast.success("Course créée ! Recherche d'un livreur en cours...");
    navigate("/mes-courses");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">Commander une course</h1>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            Itinéraire
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Quartier de départ *</Label>
            <QuartierSelect
              value={form.quartier_depart}
              onValueChange={(v) => setForm({ ...form, quartier_depart: v })}
              placeholder="D'où part le colis ?"
            />
          </div>
          <div className="space-y-2">
            <Label>Quartier d'arrivée *</Label>
            <QuartierSelect
              value={form.quartier_arrivee}
              onValueChange={(v) => setForm({ ...form, quartier_arrivee: v })}
              placeholder="Où livrer le colis ?"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Phone className="h-4 w-4 text-primary" />
            Contacts
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Téléphone expéditeur *</Label>
            <Input
              placeholder="+226 XX XX XX XX"
              value={form.telephone_expediteur}
              onChange={(e) => setForm({ ...form, telephone_expediteur: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Téléphone destinataire *</Label>
            <Input
              placeholder="+226 XX XX XX XX"
              value={form.telephone_destinataire}
              onChange={(e) => setForm({ ...form, telephone_destinataire: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            Colis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Type de colis *</Label>
            <Select value={form.type_colis} onValueChange={(v) => setForm({ ...form, type_colis: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner le type" />
              </SelectTrigger>
              <SelectContent>
                {TYPES_COLIS.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Description (optionnel)</Label>
            <Textarea
              placeholder="Détails sur le colis..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* Paiement */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="text-lg">💳</span>
            Mode de paiement *
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2">
          {MODES_PAIEMENT.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setForm({ ...form, mode_paiement: mode })}
              className={`p-3 rounded-lg border text-sm font-medium text-left transition-all ${
                form.mode_paiement === mode
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:bg-muted"
              }`}
            >
              {mode === "Orange Money" && "🟠 "}
              {mode === "Moov Money" && "🔵 "}
              {mode === "Telecel Money" && "🟢 "}
              {mode === "Paiement à la livraison" && "🤝 "}
              {mode}
            </button>
          ))}
        </CardContent>
      </Card>

      {prix > 0 && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Prix de la course</span>
              <span className="text-2xl font-bold text-primary">{prix} FCFA</span>
            </div>
          </CardContent>
        </Card>
      )}

      <Button
        className="w-full h-12 text-base font-semibold"
        onClick={handleSubmit}
        disabled={loading}
      >
        {loading ? "Création en cours..." : "Commander la course"}
      </Button>
    </div>
  );
}