import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { vibrateSuccess, vibrateMedium } from "@/lib/vibration";
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
  const [codePromo, setCodePromo] = useState("");
  const [codePromoApplique, setCodePromoApplique] = useState(null);
  const [checkingCode, setCheckingCode] = useState(false);
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
  const prixAvecPromo = codePromoApplique ? Math.round(prix * 0.8) : prix;
  const gainLivreur = Math.round(prixAvecPromo * 1); // livreur reçoit tout le montant client si promo
  const commission = codePromoApplique ? 0 : Math.round(prix * 0.2);

  const verifierCode = async () => {
    if (!codePromo.trim()) return;
    if (user?.code_promo_utilise) {
      toast.error("Vous avez déjà utilisé un code promo");
      return;
    }
    setCheckingCode(true);
    const codes = await base44.entities.CodePromo.filter({ code: codePromo.toUpperCase(), statut: "valide", actif: true });
    if (codes.length === 0) {
      toast.error("Code promo invalide ou non activé");
      setCodePromoApplique(null);
    } else {
      setCodePromoApplique(codes[0]);
      toast.success(`Code ${codePromo.toUpperCase()} appliqué ! -20% sur cette course 🎉`);
    }
    setCheckingCode(false);
  };

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
    const prixFinal = codePromoApplique ? Math.round(prix * 0.8) : prix;
    const commissionFinal = codePromoApplique ? 0 : Math.round(prix * 0.2);
    const gainFinal = prixFinal; // si promo, livreur reçoit tout
    const courseData = await base44.entities.Course.create({
      ...form,
      statut: "en_attente",
      statut_paiement,
      client_email: user.email,
      client_name: user.full_name,
      prix: prixFinal,
      commission: commissionFinal,
      commission_active: !codePromoApplique,
      commission_cdl: commissionFinal,
      gain_livreur: gainFinal,
      statut_paiement_livreur: "Commission due",
      nombre_tentatives: 0,
      code_promo_utilise: codePromoApplique?.code || null,
    });
    // Si code promo utilisé : mettre à jour le code promo et marquer le client
    if (codePromoApplique) {
      const nouvNb = (codePromoApplique.nombre_utilisations || 0) + 1;
      await base44.entities.CodePromo.update(codePromoApplique.id, {
        nombre_utilisations: nouvNb,
        commission_due: (codePromoApplique.commission_due || 0) + 50,
        statut_paiement: "Doit",
      });
      await base44.auth.updateMe({ code_promo_utilise: codePromoApplique.code });
    }
    // Lancer le dispatch automatique
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

      {/* Code promo */}
      {!user?.code_promo_utilise && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <p className="text-sm font-semibold">🎁 Code promotionnel</p>
            {codePromoApplique ? (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200">
                <span className="text-green-700 text-sm font-bold flex-1">✅ {codePromoApplique.code} — -20% appliqué !</span>
                <button onClick={() => { setCodePromoApplique(null); setCodePromo(""); }} className="text-xs text-red-500">Retirer</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  placeholder="Entrez un code promo..."
                  value={codePromo}
                  onChange={e => setCodePromo(e.target.value.toUpperCase())}
                  className="flex-1"
                />
                <Button variant="outline" onClick={verifierCode} disabled={checkingCode || !codePromo.trim()}>
                  {checkingCode ? "..." : "OK"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {prix > 0 && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Prix de la course</span>
              <div className="text-right">
                {codePromoApplique && <p className="text-xs text-muted-foreground line-through">{prix} FCFA</p>}
                <span className="text-2xl font-bold text-primary">{prixAvecPromo} FCFA</span>
              </div>
            </div>
            {codePromoApplique && (
              <div className="p-2 rounded-lg bg-green-50 border border-green-200 text-xs text-green-700 font-medium text-center">
                🎉 -20% grâce au code promo — CDL ne prend pas de commission sur cette course
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 rounded-lg bg-card border">
                <p className="text-muted-foreground">Gain livreur</p>
                <p className="font-bold text-green-600">{codePromoApplique ? prixAvecPromo : gainLivreur} FCFA</p>
              </div>
              <div className="p-2 rounded-lg bg-card border">
                <p className="text-muted-foreground">Commission CDL</p>
                <p className="font-bold text-primary">{commission} FCFA</p>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground text-center">⏱ Livraison estimée : 20-45 minutes selon le trafic</p>
          </CardContent>
        </Card>
      )}

      <Button
        className="w-full h-12 text-base font-semibold"
        onClick={handleSubmit}
        disabled={loading || !form.quartier_depart || !form.quartier_arrivee || !form.type_colis || !form.mode_paiement}
      >
        {loading ? "⏳ Recherche d'un livreur..." : "🛵 Commander la course"}
      </Button>
    </div>
  );
}