import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MapPin, Truck, Package, Clock } from "lucide-react";
import moment from "moment";

const STATUT_CONFIG = {
  en_attente_partenaire: { label: "En attente de confirmation",  color: "bg-amber-100 text-amber-700", icon: Clock },
  acceptee:              { label: "Commande acceptée",           color: "bg-blue-100 text-blue-700",   icon: Package },
  refusee:               { label: "Commande refusée",            color: "bg-red-100 text-red-700",     icon: Package },
  en_preparation:        { label: "En préparation",              color: "bg-purple-100 text-purple-700", icon: Package },
  prete:                 { label: "Prête, livreur en route",     color: "bg-indigo-100 text-indigo-700", icon: Truck },
  en_livraison:          { label: "En cours de livraison",       color: "bg-cyan-100 text-cyan-700",   icon: Truck },
  livree:                { label: "Livrée ✅",                   color: "bg-green-100 text-green-700", icon: Package },
  annulee:               { label: "Annulée",                     color: "bg-gray-100 text-gray-600",   icon: Package },
};

const STEPS = [
  { key: "en_attente_partenaire", label: "Commande envoyée" },
  { key: "acceptee",              label: "Acceptée" },
  { key: "en_preparation",        label: "En préparation" },
  { key: "prete",                 label: "Prête" },
  { key: "en_livraison",          label: "En livraison" },
  { key: "livree",                label: "Livrée" },
];

const STEP_ORDER = STEPS.map(s => s.key);

export default function CommandeMarketplaceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [commande, setCommande] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const data = await base44.entities.CommandePartenaire.filter({ id });
      if (data.length > 0) setCommande(data[0]);
      setLoading(false);
    };
    load();
  }, [id]);

  // Temps réel
  useEffect(() => {
    const unsub = base44.entities.CommandePartenaire.subscribe((event) => {
      if (event.id === id && event.data) setCommande(event.data);
    });
    return unsub;
  }, [id]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  if (!commande) return (
    <div className="text-center py-16">
      <p className="text-muted-foreground">Commande introuvable</p>
      <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>Retour</Button>
    </div>
  );

  const cfg = STATUT_CONFIG[commande.statut] || STATUT_CONFIG.en_attente_partenaire;
  const Icon = cfg.icon;
  const items = (() => { try { return JSON.parse(commande.items_json || "[]"); } catch (_) { return []; } })();
  const currentStep = STEP_ORDER.indexOf(commande.statut);
  const isRefused = commande.statut === "refusee";
  const isAnnulee = commande.statut === "annulee";

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">{commande.partenaire_nom}</h1>
          <p className="text-xs text-muted-foreground">{moment(commande.created_date).format("DD/MM/YYYY à HH:mm")}</p>
        </div>
      </div>

      {/* Statut principal */}
      <Card className={isRefused || isAnnulee ? "border-red-200" : "border-primary/20"}>
        <CardContent className="p-4 flex items-center gap-3">
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.color}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-sm">{cfg.label}</p>
            {commande.motif_refus && (
              <p className="text-xs text-red-600 mt-0.5">Motif : {commande.motif_refus}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Barre de progression */}
      {!isRefused && !isAnnulee && (
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {STEPS.map((step, i) => (
            <div key={step.key} className="flex items-center gap-1 flex-shrink-0">
              <div className={`h-2 w-2 rounded-full ${i <= currentStep ? "bg-primary" : "bg-border"}`} />
              <p className={`text-[10px] ${i <= currentStep ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                {step.label}
              </p>
              {i < STEPS.length - 1 && <div className={`h-0.5 w-4 ${i < currentStep ? "bg-primary" : "bg-border"}`} />}
            </div>
          ))}
        </div>
      )}

      {/* Bouton suivre livraison */}
      {commande.course_id && ["prete", "en_livraison"].includes(commande.statut) && (
        <Button className="w-full h-12" onClick={() => navigate(`/course/${commande.course_id}`)}>
          <Truck className="h-4 w-4 mr-2" />Suivre la livraison en temps réel
        </Button>
      )}

      {/* Produits */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="font-semibold text-sm">🛍️ Articles commandés</p>
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-3">
              {item.photo
                ? <img src={item.photo} alt={item.nom} className="h-10 w-10 rounded-lg object-cover flex-shrink-0" />
                : <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center text-lg flex-shrink-0">🍱</div>
              }
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{item.nom}</p>
                <p className="text-xs text-muted-foreground">× {item.qty}</p>
              </div>
              <p className="text-sm font-bold text-primary flex-shrink-0">
                {((item.prix || 0) * item.qty).toLocaleString()} F
              </p>
            </div>
          ))}

          <div className="border-t pt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sous-total</span>
              <span>{(commande.total_produits || 0).toLocaleString()} FCFA</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Frais de livraison</span>
              <span>{(commande.frais_livraison || 1500).toLocaleString()} FCFA</span>
            </div>
            <div className="flex justify-between font-bold text-base border-t pt-2">
              <span>Total</span>
              <span className="text-primary">{(commande.total_commande || 0).toLocaleString()} FCFA</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Infos livraison */}
      <Card>
        <CardContent className="p-4 space-y-2 text-sm">
          <p className="font-semibold">📍 Détails livraison</p>
          <div className="flex items-start gap-2 text-muted-foreground">
            <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              <p>{commande.quartier_livraison}</p>
              {commande.adresse_livraison && <p className="text-xs">{commande.adresse_livraison}</p>}
            </div>
          </div>
          {commande.note_client && (
            <div className="bg-muted/50 rounded-lg p-2 text-xs text-muted-foreground">
              💬 {commande.note_client}
            </div>
          )}
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Mode de paiement</span>
            <span className="font-medium">{commande.mode_paiement}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}