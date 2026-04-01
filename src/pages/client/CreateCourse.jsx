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
import { MapPin, Phone, Package, ArrowLeft, AlertTriangle, Send, RefreshCw, Wallet } from "lucide-react";
import { fmt } from "@/lib/formatMoney";
import QuartierSelect from "../../components/QuartierSelect";
import { lancerDispatch } from "@/lib/dispatch";
import { toast } from "sonner";

const TYPES_COLIS = ["Documents", "Petit colis", "Colis moyen", "Gros colis", "Nourriture", "Autre"];

export default function CreateCourse() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [soldeBedou, setSoldeBedou] = useState(null);
  const [urgent, setUrgent] = useState(false);
  const [tresUrgent, setTresUrgent] = useState(false);
  const [typeMission, setTypeMission] = useState(null);
  const [form, setForm] = useState({
    quartier_depart: "",
    quartier_arrivee: "",
    nom_expediteur: "",
    telephone_expediteur: "",
    nom_destinataire: "",
    telephone_destinataire: "",
    type_colis: "",
    description: "",
    prix_base: "",
    instructions_speciales: "",
  });

  useEffect(() => {
    const load = async () => {
      const me = await base44.auth.me();
      setUser(me);
      setForm(f => ({ ...f, telephone_expediteur: me.telephone || "" }));
      const res = await base44.functions.invoke('bedouEngine', { action: 'get_bedou' });
      setSoldeBedou(res.data.bedou?.solde_disponible || 0);
    };
    load();
  }, []);

  const prixBase = parseInt(form.prix_base, 10) || 0;
  const supplement = tresUrgent ? 1000 : urgent ? 500 : 0;
  const prixAvecPromo = prixBase + supplement;
  const soldeInsuffisant = soldeBedou !== null && prixAvecPromo > 0 && soldeBedou < prixAvecPromo;

  const handleUrgent = (val) => { setUrgent(val); if (val) setTresUrgent(false); };
  const handleTresUrgent = (val) => { setTresUrgent(val); if (val) setUrgent(false); };

  const handleSubmit = async () => {
    if (!form.quartier_depart || !form.quartier_arrivee || !form.telephone_expediteur || !form.telephone_destinataire || !form.type_colis || !form.nom_expediteur || !form.nom_destinataire) {
      toast.error("Veuillez remplir tous les champs obligatoires");
      return;
    }
    if (!prixBase || prixBase <= 0) {
      toast.error("Veuillez indiquer le montant de la course");
      return;
    }
    if (soldeInsuffisant) {
      toast.error("Solde Bedou insuffisant. Rechargez votre Bedou.");
      return;
    }
    setLoading(true);

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

    const commission = Math.round(prixAvecPromo * 0.2);
    const gainLivreur = prixAvecPromo - commission;

    const courseData = await base44.entities.Course.create({
      quartier_depart: form.quartier_depart,
      quartier_arrivee: form.quartier_arrivee,
      latitude_depart: clientLat,
      longitude_depart: clientLng,
      nom_expediteur: form.nom_expediteur,
      telephone_expediteur: form.telephone_expediteur,
      nom_destinataire: form.nom_destinataire,
      telephone_destinataire: form.telephone_destinataire,
      type_colis: form.type_colis,
      description: form.description,
      instructions_speciales: form.instructions_speciales,
      type_mission: typeMission,
      mode_paiement: "Bedou",
      statut: "en_attente",
      statut_paiement: "en_attente",
      client_email: user.email,
      client_name: user.full_name,
      prix: prixAvecPromo,
      montant_base: prixBase,
      supplement_urgence: supplement,
      niveau_urgence: tresUrgent ? "tres_urgent" : urgent ? "urgent" : "normal",
      commission,
      commission_active: true,
      commission_cdl: commission,
      gain_livreur: gainLivreur,
      statut_paiement_livreur: "Commission due",
      nombre_tentatives: 0,
      urgence: tresUrgent ? "tres_urgent" : urgent ? "urgent" : null,
    });

    lancerDispatch(courseData);
    vibrateSuccess();
    toast.success("Course payée via Bedou ! Recherche d'un livreur...");
    navigate("/mes-courses");
  };

  // Étape 0 : choix du type de mission
  if (!typeMission) {
    return (
      <div className="min-h-screen bg-background">
        <div className="flex items-center gap-3 p-4 pb-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">Commander une course</h1>
        </div>

        {soldeBedou !== null && (
          <div className={`mx-4 mb-2 flex items-center gap-3 p-3 rounded-xl border ${soldeBedou > 0 ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
            <Wallet className={`h-5 w-5 flex-shrink-0 ${soldeBedou > 0 ? 'text-green-600' : 'text-amber-600'}`} />
            <div>
              <p className={`text-sm font-semibold ${soldeBedou > 0 ? 'text-green-700' : 'text-amber-700'}`}>
                Mon Bedou : {fmt(soldeBedou)}
              </p>
              {soldeBedou === 0 && (
                <p className="text-xs text-amber-600">Rechargez votre Bedou pour commander</p>
              )}
            </div>
            {soldeBedou === 0 && (
              <Button size="sm" className="ml-auto flex-shrink-0" onClick={() => navigate('/mon-bedou')}>
                Recharger
              </Button>
            )}
          </div>
        )}

        <div className="px-4 pt-4 pb-8 space-y-4">
          <div className="text-center">
            <p className="text-base font-semibold">Que souhaitez-vous faire ?</p>
            <p className="text-sm text-muted-foreground mt-1">Choisissez le type de votre demande</p>
          </div>

          <button
            onClick={() => setTypeMission('envoyer')}
            className="w-full flex items-center gap-5 p-6 rounded-2xl border-2 border-primary bg-primary/5 active:scale-[0.98] transition-all text-left"
          >
            <div className="h-16 w-16 rounded-2xl bg-primary flex items-center justify-center flex-shrink-0">
              <Send className="h-8 w-8 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-lg font-bold text-primary">📦 Envoyer un colis</p>
              <p className="text-sm text-muted-foreground mt-1">Je veux envoyer un colis à quelqu'un.<br />Le livreur vient le récupérer chez moi.</p>
            </div>
          </button>

          <button
            onClick={() => setTypeMission('recuperer')}
            className="w-full flex items-center gap-5 p-6 rounded-2xl border-2 border-accent bg-accent/5 active:scale-[0.98] transition-all text-left"
          >
            <div className="h-16 w-16 rounded-2xl bg-accent flex items-center justify-center flex-shrink-0">
              <RefreshCw className="h-8 w-8 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-lg font-bold text-accent">🔁 Récupérer un colis</p>
              <p className="text-sm text-muted-foreground mt-1">Je veux qu'on aille chercher un colis à un endroit précis et qu'on me le livre.</p>
            </div>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setTypeMission(null)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Commander une course</h1>
          <p className="text-xs text-muted-foreground">{typeMission === 'envoyer' ? '📦 Envoyer un colis' : '🔁 Récupérer un colis'}</p>
        </div>
      </div>

      <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold w-fit ${
        typeMission === 'envoyer' ? 'bg-primary/10 text-primary' : 'bg-accent/10 text-accent'
      }`}>
        {typeMission === 'envoyer' ? <Send className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
        {typeMission === 'envoyer' ? 'Mission : Envoyer un colis' : 'Mission : Récupérer un colis'}
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
            <Label>{typeMission === 'envoyer' ? "Quartier de départ (chez l'expéditeur) *" : 'Quartier de récupération (lieu du colis) *'}</Label>
            <QuartierSelect value={form.quartier_depart} onValueChange={(v) => setForm({ ...form, quartier_depart: v })} placeholder={typeMission === 'envoyer' ? "D'où part le colis ?" : 'Où aller chercher ?'} />
          </div>
          <div className="space-y-2">
            <Label>{typeMission === 'envoyer' ? "Quartier d'arrivée (destinataire) *" : 'Quartier de livraison finale *'}</Label>
            <QuartierSelect value={form.quartier_arrivee} onValueChange={(v) => setForm({ ...form, quartier_arrivee: v })} placeholder={typeMission === 'envoyer' ? 'Où livrer ?' : 'Où livrer le colis ?'} />
          </div>
        </CardContent>
      </Card>

      {/* Contacts */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Phone className="h-4 w-4 text-primary" />
            {typeMission === 'envoyer' ? 'Expéditeur & Destinataire' : 'Contact récupération & Destinataire'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="p-3 rounded-xl bg-muted/50 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {typeMission === 'envoyer' ? '📤 Expéditeur (chez qui récupérer le colis)' : '📍 Lieu de récupération du colis'}
            </p>
            <div className="space-y-2">
              <Label>{typeMission === 'envoyer' ? "Nom de l'expéditeur *" : 'Nom de la personne qui remet le colis *'}</Label>
              <Input placeholder="Nom complet" value={form.nom_expediteur} onChange={(e) => setForm({ ...form, nom_expediteur: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{typeMission === 'envoyer' ? 'Téléphone expéditeur *' : 'Téléphone du lieu de récupération *'}</Label>
              <Input placeholder="+226 XX XX XX XX" value={form.telephone_expediteur} onChange={(e) => setForm({ ...form, telephone_expediteur: e.target.value })} />
            </div>
          </div>
          <div className="p-3 rounded-xl bg-muted/50 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {typeMission === 'envoyer' ? '📥 Destinataire (à qui livrer)' : '🏠 Destinataire final (à qui livrer)'}
            </p>
            <div className="space-y-2">
              <Label>{typeMission === 'envoyer' ? 'Nom du destinataire *' : 'Votre nom *'}</Label>
              <Input placeholder="Nom complet" value={form.nom_destinataire} onChange={(e) => setForm({ ...form, nom_destinataire: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{typeMission === 'envoyer' ? 'Téléphone destinataire *' : 'Votre téléphone *'}</Label>
              <Input placeholder="+226 XX XX XX XX" value={form.telephone_destinataire} onChange={(e) => setForm({ ...form, telephone_destinataire: e.target.value })} />
            </div>
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
          {typeMission === 'recuperer' && (
            <div className="space-y-2">
              <Label>Instructions spéciales (optionnel)</Label>
              <Textarea placeholder="Ex: payer 500 FCFA sur place, dire le code 1234..." value={form.instructions_speciales} onChange={(e) => setForm({ ...form, instructions_speciales: e.target.value })} rows={2} />
            </div>
          )}
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

          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-500" />
            <span>⚠️ Avec un prix trop bas, vous risquez de ne pas avoir de livreur disponible.</span>
          </div>

          <div className="space-y-2">
            <Label>Niveau d'urgence (optionnel)</Label>
            <div className="space-y-2">
              <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${urgent ? 'border-amber-400 bg-amber-50' : 'border-border'}`}>
                <input type="checkbox" checked={urgent} onChange={e => handleUrgent(e.target.checked)} className="h-4 w-4 accent-amber-500" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-700">🔔 Urgent <span className="text-amber-600 font-bold">+500 FCFA</span></p>
                  <p className="text-xs text-muted-foreground">(moins de 30 min)</p>
                </div>
              </label>
              <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${tresUrgent ? 'border-red-400 bg-red-50' : 'border-border'}`}>
                <input type="checkbox" checked={tresUrgent} onChange={e => handleTresUrgent(e.target.checked)} className="h-4 w-4 accent-red-500" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-700">🚨 Très urgent <span className="text-red-600 font-bold">+1000 FCFA</span></p>
                  <p className="text-xs text-muted-foreground">(moins de 20 min)</p>
                </div>
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Paiement Bedou */}
      <Card className={`border-2 ${soldeInsuffisant ? 'border-red-300 bg-red-50' : prixAvecPromo > 0 ? 'border-green-300 bg-green-50' : 'border-border'}`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />Paiement via Bedou
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Mon solde Bedou</span>
            <span className="font-bold text-foreground">{soldeBedou !== null ? fmt(soldeBedou) : '...'}</span>
          </div>
          {prixAvecPromo > 0 && (
            <>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Montant total</span>
                <span className="font-bold text-primary">{fmt(prixAvecPromo)}</span>
              </div>
              <div className={`flex items-center gap-2 p-2 rounded-lg text-sm font-semibold ${soldeInsuffisant ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                {soldeInsuffisant ? '❌ Solde insuffisant' : '✅ Solde suffisant'}
              </div>
              {soldeInsuffisant && (
                <div className="space-y-2">
                  <p className="text-xs text-red-700 font-medium">Il vous manque {fmt(prixAvecPromo - (soldeBedou || 0))}. Rechargez votre Bedou pour continuer.</p>
                  <Button className="w-full" variant="outline" onClick={() => navigate('/mon-bedou')}>
                    🔄 Recharger mon Bedou
                  </Button>
                </div>
              )}
            </>
          )}
          <p className="text-[10px] text-muted-foreground text-center">
            💰 Bedou est l'unique moyen de paiement CDL. Le débit est effectué avant l'attribution du livreur.
          </p>
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
                  <span className="font-medium text-foreground">{fmt(prixBase)}</span>
              </div>
              {supplement > 0 && (
                <div className="flex justify-between text-amber-700">
                  <span>{tresUrgent ? "🚨 Très urgent" : "🔔 Urgent"}</span>
                    <span className="font-medium text-amber-700">+{fmt(supplement)}</span>
                </div>
              )}
              <div className="border-t pt-2 flex justify-between font-bold text-base">
                <span>Total à débiter</span>
                  <span className="text-primary text-xl">{fmt(prixAvecPromo)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Button
        className="w-full h-12 text-base font-semibold"
        onClick={handleSubmit}
        disabled={
          loading ||
          !form.quartier_depart || !form.quartier_arrivee ||
          !form.nom_expediteur || !form.telephone_expediteur ||
          !form.nom_destinataire || !form.telephone_destinataire ||
          !form.type_colis || !prixBase || soldeInsuffisant
        }
      >
        {loading ? "⏳ Paiement & recherche livreur..." : "🛵 Payer et commander"}
      </Button>
    </div>
  );
}