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
import { PRIX_PAR_TYPE } from "@/lib/quartiers";
import { toast } from "sonner";

const TYPES_COLIS = ["Documents", "Petit colis", "Colis moyen", "Gros colis", "Nourriture", "Autre"];

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
    await base44.entities.Course.create({
      ...form,
      statut: "en_attente",
      client_email: user.email,
      client_name: user.full_name,
      prix: prix,
      commission: commission,
      commission_active: true,
    });
    toast.success("Course créée avec succès !");
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

      {/* Price */}
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