import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { vibrateSuccess } from "@/lib/vibration";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Phone, Package, ArrowLeft, AlertTriangle } from "lucide-react";
import QuartierSelect from "../../components/QuartierSelect";
import { lancerDispatch } from "@/lib/dispatch";
import { toast } from "sonner";

const TYPES_COLIS = ["Documents", "Petit colis", "Colis moyen", "Gros colis", "Nourriture", "Autre"];
const MODES_PAIEMENT = ["Orange Money", "Moov Money", "Telecel Money", "Paiement cash à la livraison"];

export default function CreateCourse() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [urgent, setUrgent] = useState(false);
  const [tresUrgent, setTresUrgent] = useState(false);
  const [form, setForm] = useState({
    quartier_depart: "",
    quartier_arrivee: "",
    telephone_expediteur: "",
    telephone_destinataire: "",
    type_colis: "",
    description: "",
    mode_paiement: "",
    prix_base: "",
  });

  useEffect(() => {
    const load = async () => {
      const me = await base44.auth.me();
      setUser(me);
      setForm(f => ({ ...f, telephone_expediteur: me.telephone || "" }));
    };
    load();
  }, []);

  const prixBase = parseInt(form.prix_base, 10) || 0;
  const supplement = tresUrgent ? 1000 : urgent ? 500 : 0;
  const prixAvecPromo = prixBase + supplement;
  const commission = Math.round(prixAvecPromo * 0.2);
  const gainLivreur = prixAvecPromo - commission;

  const handleUrgent = (val) => {
    setUrgent(val);
    if (val) setTresUrgent(false);
  };

  const handleTresUrgent = (val) => {
    setTresUrgent(val);
    if (val) setUrgent(false);
  };

  const handleSubmit = async () => {
    if (!form.quartier_depart || !form.quartier_arrivee || !form.telephone_expediteur || !form.telephone_destinataire || !form.type_colis) {
      toast.error("Veuillez remplir tous les champs obligatoires");
      return;
    }
    if (!prixBase || prixBase <= 0) {
      toast.error("Veuillez indiquer le montant de la course");
      return;
    }
    if (!form.mode_paiement) {
      toast.error("Veuillez choisir un mode de paiement");
      return;
    }
    setLoading(true);
    const statut_paiement = form.mode_paiement === "Paiement cash à la livraison" ? "paiement_livraison" : "en_attente";
    // Récupérer la position GPS du client pour le départ
    let clientLat = user.gps_latitude || null;
    let clientLng = user.gps_longitude || null;
    if (!clientLat && navigator.geolocation) {
      try {
        const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 3000 }));
        clientLat = pos.coords.latitude;
        clientLng = pos.coords.longitude;
        base44.auth.updateMe({ gps_latitude: clientLat, gps_longitude: clientLng });
      } catch (_) {}
    }
    const courseData = await base44.entities.Course.create({
      quartier_depart: form.quartier_depart,
      quartier_arrivee: form.quartier_arrivee,
      latitude_depart: clientLat,
      longitude_depart: clientLng,
      telephone_expediteur: form.telephone_expediteur,
      telephone_destinataire: form.telephone_destinataire,
      type_colis: form.type_colis,
      description: form.description,
      mode_paiement: form.mode_paiement,
      statut: "en_attente",
      statut_paiement,
      client_email: user.email,
      client_name: user.full_name,
      prix: prixAvecPromo,
      commission: commission,
      commission_active: true,
      commission_cdl: commission,
      gain_livreur: gainLivreur,
      statut_paiement_livreur: "Commission due",
      nombre_tentatives: 0,
      urgence: tresUrgent ? "tres_urgent" : urgent ? "urgent" : null,
    });

    lancerDispatch(courseData);
    vibrateSuccess();
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

      {/* Itinéraire */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />Itinéraire
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Quartier de départ *</Label>
            <QuartierSelect value={form.quartier_depart} onValueChange={(v) => setForm({ ...form, quartier_depart: v })} placeholder="D'où part le colis ?" />
          </div>
          <div className="space-y-2">
            <Label>Quartier d'arrivée *</Label>
            <QuartierSelect value={form.quartier_arrivee} onValueChange={(v) => setForm({ ...form, quartier_arrivee: v })} placeholder="Où livrer le colis ?" />
          </div>
        </CardContent>
      </Card>

      {/* Contacts */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Phone className="h-4 w-4 text-primary" />Contacts
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Téléphone expéditeur *</Label>
            <Input placeholder="+226 XX XX XX XX" value={form.telephone_expediteur} onChange={(e) => setForm({ ...form, telephone_expediteur: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Téléphone destinataire *</Label>
            <Input placeholder="+226 XX XX XX XX" value={form.telephone_destinataire} onChange={(e) => setForm({ ...form, telephone_destinataire: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      {/* Colis */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />Colis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Type de colis *</Label>
            <Select value={form.type_colis} onValueChange={(v) => setForm({ ...form, type_colis: v })}>
              <SelectTrigger><SelectValue placeholder="Sélectionner le type" /></SelectTrigger>
              <SelectContent>
                {TYPES_COLIS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Description (optionnel)</Label>
            <Textarea placeholder="Détails sur le colis..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
          </div>
        </CardContent>
      </Card>

      {/* Prix */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="text-lg">💰</span>Montant de la course
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Prix proposé (FCFA) *</Label>
            <div className="relative">
              <Input
                type="number"
                min="0"
                placeholder="Ex: 1500"
                value={form.prix_base}
                onChange={(e) => setForm({ ...form, prix_base: e.target.value })}
                className="pr-16"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">FCFA</span>
            </div>
          </div>

          {/* Alerte prix bas */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-500" />
            <span>⚠️ Attention — avec un prix trop bas vous risquez de ne pas avoir de livreurs disponibles.</span>
          </div>

          {/* Options urgence */}
          <div className="space-y-2">
            <Label>Niveau d'urgence (optionnel)</Label>
            <div className="space-y-2">
              <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${urgent ? 'border-amber-400 bg-amber-50' : 'border-border'}`}>
                <input
                  type="checkbox"
                  checked={urgent}
                  onChange={(e) => handleUrgent(e.target.checked)}
                  className="h-4 w-4 accent-amber-500"
                />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-700">🔔 Urgent <span className="text-amber-600 font-bold">+500 FCFA</span></p>
                  <p className="text-xs text-muted-foreground">(moins de 30 min)</p>
                </div>
              </label>
              <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${tresUrgent ? 'border-red-400 bg-red-50' : 'border-border'}`}>
                <input
                  type="checkbox"
                  checked={tresUrgent}
                  onChange={(e) => handleTresUrgent(e.target.checked)}
                  className="h-4 w-4 accent-red-500"
                />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-700">🚨 Très urgent <span className="text-red-600 font-bold">+1000 FCFA</span></p>
                  <p className="text-xs text-muted-foreground">(moins de 20 min)</p>
                </div>
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Paiement */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="text-lg">💳</span>Mode de paiement *
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2">
          {MODES_PAIEMENT.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setForm({ ...form, mode_paiement: mode })}
              className={`p-3 rounded-lg border text-sm font-medium text-left transition-all ${form.mode_paiement === mode ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"}`}
            >
              {mode === "Orange Money" && "🟠 "}
              {mode === "Moov Money" && "🔵 "}
              {mode === "Telecel Money" && "🟢 "}
              {mode === "Paiement cash à la livraison" && "🤝 "}
              {mode}
            </button>
          ))}
        </CardContent>
      </Card>

      {/* Récapitulatif */}
      {prixBase > 0 && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-semibold">📋 Récapitulatif</p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Prix de base</span>
                <span>{prixBase} FCFA</span>
              </div>
              {supplement > 0 && (
                <div className="flex justify-between text-amber-700">
                  <span>{tresUrgent ? "🚨 Très urgent" : "🔔 Urgent"}</span>
                  <span>+{supplement} FCFA</span>
                </div>
              )}
              <div className="border-t pt-2 flex justify-between font-bold text-base">
                <span>Montant total</span>
                <span className="text-primary text-xl">{prixAvecPromo} FCFA</span>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground text-center">
              {tresUrgent ? "🚨 Livraison en moins de 20 min" : urgent ? "🔔 Livraison en moins de 30 min" : "⏱ Livraison estimée : 20-45 min selon le trafic"}
            </p>
          </CardContent>
        </Card>
      )}

      <Button
        className="w-full h-12 text-base font-semibold"
        onClick={handleSubmit}
        disabled={loading || !form.quartier_depart || !form.quartier_arrivee || !form.type_colis || !form.mode_paiement || !prixBase}
      >
        {loading ? "⏳ Recherche d'un livreur..." : "🛵 Commander la course"}
      </Button>
    </div>
  );
}