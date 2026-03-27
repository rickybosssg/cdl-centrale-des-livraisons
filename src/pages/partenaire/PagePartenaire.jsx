import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { MapPin, Phone, Clock, ShoppingCart, MessageCircle, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { vibrateLight, vibrateSuccess } from "@/lib/vibration";
import { lancerDispatch } from "@/lib/dispatch";
import QuartierSelect from "../../components/QuartierSelect";
import moment from "moment";

const TYPE_EMOJI = {
  Restaurant: "🍽️", Pharmacie: "💊", Boutique: "🛍️", Alimentation: "🥗", Boissons: "🥤"
};

export default function PagePartenaire() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [partenaire, setPartenaire] = useState(null);
  const [produits, setProduits] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCommander, setShowCommander] = useState(false);
  const [formCommande, setFormCommande] = useState({ quartier_arrivee: "", telephone_destinataire: "", mode_paiement: "Paiement à la livraison" });
  const [ordering, setOrdering] = useState(false);

  useEffect(() => {
    const load = async () => {
      const me = await base44.auth.me();
      setUser(me);
      const parts = await base44.entities.Partenaire.filter({ id });
      if (parts.length > 0) {
        const p = parts[0];
        setPartenaire(p);
        const prods = await base44.entities.ProduitPartenaire.filter({ partenaire_id: p.id, disponible: true }, "nom", 100);
        setProduits(prods);
        // Track vue
        base44.entities.VisitePartenaire.create({
          partenaire_id: p.id,
          visiteur_email: me.email,
          visiteur_nom: me.full_name,
          type_action: "vue",
          date_visite: new Date().toISOString(),
        });
        base44.entities.Partenaire.update(p.id, { nombre_vues: (p.nombre_vues || 0) + 1 });
      }
      setLoading(false);
    };
    load();
  }, [id]);

  const handleCommander = async () => {
    if (!formCommande.quartier_arrivee || !formCommande.telephone_destinataire) {
      toast.error("Veuillez remplir tous les champs");
      return;
    }
    setOrdering(true);
    // Track click commander
    base44.entities.VisitePartenaire.create({
      partenaire_id: partenaire.id,
      visiteur_email: user.email,
      visiteur_nom: user.full_name,
      type_action: "commander_click",
      date_visite: new Date().toISOString(),
    });
    base44.entities.Partenaire.update(partenaire.id, {
      nombre_clics_commander: (partenaire.nombre_clics_commander || 0) + 1,
      nombre_commandes: (partenaire.nombre_commandes || 0) + 1,
    });

    const courseData = await base44.entities.Course.create({
      quartier_depart: partenaire.quartier,
      quartier_arrivee: formCommande.quartier_arrivee,
      telephone_expediteur: partenaire.telephone,
      telephone_destinataire: formCommande.telephone_destinataire,
      type_colis: "Petit colis",
      description: `Commande chez ${partenaire.nom_commerce}`,
      statut: "en_attente",
      statut_paiement: "paiement_livraison",
      mode_paiement: formCommande.mode_paiement,
      client_email: user.email,
      client_name: user.full_name,
      prix: 1500,
      commission: 300,
      commission_active: true,
      commission_cdl: 300,
      gain_livreur: 1200,
      statut_paiement_livreur: "Commission due",
      nombre_tentatives: 0,
    });
    lancerDispatch(courseData);
    vibrateSuccess();
    toast.success("Commande envoyée ! Un livreur arrive bientôt 🛵");
    setShowCommander(false);
    setOrdering(false);
  };

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;

  if (!partenaire) return (
    <div className="text-center py-12">
      <p className="text-muted-foreground">Commerce introuvable</p>
      <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>Retour</Button>
    </div>
  );

  if (partenaire.statut === "suspendu") return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="border-red-200 bg-red-50 max-w-sm mx-auto">
        <CardContent className="p-8 text-center space-y-3">
          <div className="text-4xl">🚫</div>
          <h2 className="font-bold text-red-700">Commerce suspendu</h2>
          <p className="text-sm text-red-600">Ce commerce n'est plus disponible pour le moment.</p>
        </CardContent>
      </Card>
    </div>
  );

  const categories = [...new Set(produits.map(p => p.categorie).filter(Boolean))];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
      </div>

      {/* Hero */}
      <div className="relative rounded-2xl overflow-hidden">
        {partenaire.photo_principale ? (
          <img src={partenaire.photo_principale} alt={partenaire.nom_commerce} className="w-full h-48 object-cover" />
        ) : (
          <div className="w-full h-48 bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
            <span className="text-6xl">{TYPE_EMOJI[partenaire.type_commerce] || "🏪"}</span>
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
          <h1 className="text-white font-bold text-xl">{partenaire.nom_commerce}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-white/80 text-xs">{partenaire.type_commerce}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${partenaire.ouvert ? "bg-green-500 text-white" : "bg-gray-500 text-white"}`}>
              {partenaire.ouvert ? "Ouvert" : "Fermé"}
            </span>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="space-y-2">
        {partenaire.description && <p className="text-sm text-muted-foreground">{partenaire.description}</p>}
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {partenaire.quartier && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{partenaire.quartier}{partenaire.adresse ? ` · ${partenaire.adresse}` : ""}</span>}
          {partenaire.telephone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{partenaire.telephone}</span>}
          {partenaire.horaires && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{partenaire.horaires}</span>}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => { vibrateLight(); setShowCommander(true); }}>
          <ShoppingCart className="h-4 w-4 mr-1" />Commander
        </Button>
        {partenaire.telephone && (
          <a href={`https://wa.me/${partenaire.telephone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="bg-green-50 border-green-200 text-green-700">
              <MessageCircle className="h-4 w-4" />
            </Button>
          </a>
        )}
      </div>

      {/* Formulaire commande */}
      {showCommander && (
        <Card className="border-primary/30">
          <CardContent className="p-4 space-y-3">
            <p className="font-semibold text-sm">📍 Votre adresse de livraison</p>
            <div><Label className="text-xs">Votre quartier *</Label>
              <QuartierSelect value={formCommande.quartier_arrivee} onValueChange={v => setFormCommande(f => ({ ...f, quartier_arrivee: v }))} placeholder="Où livrer ?" /></div>
            <div><Label className="text-xs">Votre téléphone *</Label>
              <input className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" placeholder="+226 XX XX XX XX" value={formCommande.telephone_destinataire} onChange={e => setFormCommande(f => ({ ...f, telephone_destinataire: e.target.value }))} /></div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowCommander(false)}>Annuler</Button>
              <Button className="flex-1" onClick={handleCommander} disabled={ordering}>
                {ordering ? "Envoi..." : "Confirmer"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Catalogue */}
      {produits.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-bold text-base">{partenaire.type_commerce === "Restaurant" ? "🍽️ Menu" : "🛍️ Catalogue"}</h2>
          {(categories.length > 0 ? categories : [null]).map(cat => (
            <div key={cat || "all"}>
              {cat && <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{cat}</p>}
              <div className="space-y-2">
                {produits.filter(p => cat ? p.categorie === cat : true).map(prod => (
                  <Card key={prod.id}>
                    <CardContent className="p-3 flex items-center gap-3">
                      {prod.photo
                        ? <img src={prod.photo} alt={prod.nom} className="h-14 w-14 rounded-xl object-cover flex-shrink-0" />
                        : <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center text-2xl flex-shrink-0">🍱</div>
                      }
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{prod.nom}</p>
                        {prod.description && <p className="text-xs text-muted-foreground truncate">{prod.description}</p>}
                        <p className="font-bold text-primary text-sm mt-0.5">{(prod.prix || 0).toLocaleString()} FCFA</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}