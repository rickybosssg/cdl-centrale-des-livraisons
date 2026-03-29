import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useMessageNotification } from "@/hooks/useMessageNotification";
import { useMessageCount } from "@/hooks/useMessageCount";
import MessageAlert from "@/components/MessageAlert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, ShoppingBag, TrendingUp, Plus, ToggleLeft, ToggleRight, Trash2, Upload, Clock, Bell, MessageCircle, User } from "lucide-react";
import ChatAdmin from "@/components/ChatAdmin";
import { toast } from "sonner";
import { vibrateLight } from "@/lib/vibration";
import moment from "moment";

export default function DashboardPartenaire({ user }) {
  const navigate = useNavigate();
  const [nbCommandes, setNbCommandes] = useState(0);
  const [partenaire, setPartenaire] = useState(null);
  const [produits, setProduits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddProduit, setShowAddProduit] = useState(false);
  const [newProduit, setNewProduit] = useState({ nom: "", prix: "", categorie: "", description: "" });
  const [photoFile, setPhotoFile] = useState(null);
  const [savingProduit, setSavingProduit] = useState(false);
  const [visiteurs, setVisiteurs] = useState([]);
  const [showMessages, setShowMessages] = useState(false);
  const newMsg = useMessageNotification(user.email);
  const hasUnreadMessages = useMessageCount(user?.email, "partenaire");

  useEffect(() => {
    const load = async () => {
      const parts = await base44.entities.Partenaire.filter({ user_email: user.email });
      if (parts.length > 0) {
        setPartenaire(parts[0]);
        const prods = await base44.entities.ProduitPartenaire.filter({ partenaire_id: parts[0].id }, "-created_date", 100);
        setProduits(prods);
        const visits = await base44.entities.VisitePartenaire.filter({ partenaire_id: parts[0].id }, "-created_date", 50);
        setVisiteurs(visits);
        const cmds = await base44.entities.CommandePartenaire.filter({ partenaire_id: parts[0].id, statut: "en_attente_partenaire" });
        setNbCommandes(cmds.length);
      }
      setLoading(false);
    };
    load();
  }, [user.email]);

  const toggleOuvert = async () => {
    vibrateLight();
    const updated = { ouvert: !partenaire.ouvert };
    await base44.entities.Partenaire.update(partenaire.id, updated);
    setPartenaire(p => ({ ...p, ...updated }));
    toast.success(updated.ouvert ? "Commerce ouvert !" : "Commerce fermé");
  };

  const ajouterProduit = async () => {
    if (!newProduit.nom || !newProduit.prix) { toast.error("Nom et prix requis"); return; }
    setSavingProduit(true);
    let photo = "";
    if (photoFile) {
      const res = await base44.integrations.Core.UploadFile({ file: photoFile });
      photo = res.file_url;
    }
    const produit = await base44.entities.ProduitPartenaire.create({
      partenaire_id: partenaire.id,
      partenaire_email: user.email,
      nom: newProduit.nom,
      prix: parseFloat(newProduit.prix),
      categorie: newProduit.categorie,
      description: newProduit.description,
      photo,
      disponible: true,
    });
    setProduits(p => [produit, ...p]);
    setNewProduit({ nom: "", prix: "", categorie: "", description: "" });
    setPhotoFile(null);
    setShowAddProduit(false);
    toast.success("Produit ajouté !");
    setSavingProduit(false);
  };

  const toggleProduit = async (produit) => {
    vibrateLight();
    await base44.entities.ProduitPartenaire.update(produit.id, { disponible: !produit.disponible });
    setProduits(p => p.map(pr => pr.id === produit.id ? { ...pr, disponible: !pr.disponible } : pr));
  };

  const supprimerProduit = async (id) => {
    await base44.entities.ProduitPartenaire.delete(id);
    setProduits(p => p.filter(pr => pr.id !== id));
    toast.success("Produit supprimé");
  };

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;

  if (!partenaire) return (
    <div className="text-center py-16 space-y-3">
      <p className="text-muted-foreground">Profil partenaire introuvable</p>
    </div>
  );

  const isSuspendu = partenaire.statut === "suspendu";

  if (isSuspendu) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="border-red-200 bg-red-50 max-w-sm mx-auto">
        <CardContent className="p-8 text-center space-y-3">
          <div className="text-4xl">🚫</div>
          <h2 className="font-bold text-red-700">Compte suspendu</h2>
          <p className="text-sm text-red-600">Votre compte est suspendu. Veuillez contacter CDL.</p>
          <a href="https://wa.me/message/EH7SMNHNHL7RN1" target="_blank" rel="noopener noreferrer">
            <Button className="bg-green-600 hover:bg-green-700 w-full">Contacter CDL via WhatsApp</Button>
          </a>
        </CardContent>
      </Card>
    </div>
  );

  const abonnExpire = partenaire.statut_abonnement === "Expiré";

  return (
    <div className="space-y-4">
      <MessageAlert newMsg={newMsg} />
      {newMsg && <div className="h-24" />}
      {/* Mon compte button */}
      <div className="flex justify-end">
        <button
          onClick={() => navigate('/parametres')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-sm font-medium"
        >
          <User className="h-4 w-4" />
          Mon compte
        </button>
      </div>
      {/* Bouton commandes */}
      <button
        onClick={() => navigate('/commandes-partenaire')}
        className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Bell className="h-5 w-5 text-primary" />
          <div className="text-left">
            <p className="font-semibold text-sm">Mes commandes</p>
            <p className="text-xs text-muted-foreground">Voir et gérer les commandes</p>
          </div>
        </div>
        {nbCommandes > 0 && (
          <span className="h-6 min-w-6 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center animate-pulse">
            {nbCommandes}
          </span>
        )}
      </button>

      {/* Bouton Messages admin */}
      <button
        onClick={() => setShowMessages(!showMessages)}
        className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-colors ${
          showMessages || !hasUnreadMessages ? "border-primary bg-primary/10" : "border-red-300 bg-red-50"
        }`}
      >
        <MessageCircle className={`h-5 w-5 ${
          showMessages || !hasUnreadMessages ? "text-primary" : "text-red-500"
        }`} />
        <div className="text-left">
          <p className={`font-semibold text-sm ${
            showMessages || !hasUnreadMessages ? "text-foreground" : "text-red-600"
          }`}>Messages CDL</p>
          <p className={`text-xs ${
            showMessages || !hasUnreadMessages ? "text-muted-foreground" : "text-red-500"
          }`}>Discussion avec l'admin</p>
        </div>
      </button>

      {showMessages && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-semibold mb-3">💬 Discussion avec l'Administration CDL</p>
            <ChatAdmin userEmail={user.email} userRole="partenaire" currentUser={user} />
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{partenaire.nom_commerce}</h1>
          <span className="text-xs text-muted-foreground">{partenaire.type_commerce} · {partenaire.quartier}</span>
        </div>
        <button onClick={toggleOuvert} className="flex items-center gap-1.5">
          {partenaire.ouvert
            ? <ToggleRight className="h-7 w-7 text-green-500" />
            : <ToggleLeft className="h-7 w-7 text-muted-foreground" />}
          <span className={`text-xs font-semibold ${partenaire.ouvert ? "text-green-600" : "text-muted-foreground"}`}>
            {partenaire.ouvert ? "Ouvert" : "Fermé"}
          </span>
        </button>
      </div>

      {abonnExpire && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
          ⚠️ Votre abonnement a expiré. Contactez CDL pour renouveler (30 000 FCFA/mois).
        </div>
      )}

      {partenaire.statut === "en_attente" && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700">
          ⏳ Votre compte est en attente de validation par l'équipe CDL.
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="text-center">
          <CardContent className="p-3">
            <p className="text-xl font-bold text-primary">{partenaire.nombre_vues || 0}</p>
            <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5"><Eye className="h-3 w-3" /> Vues</p>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="p-3">
            <p className="text-xl font-bold text-accent">{partenaire.nombre_clics_commander || 0}</p>
            <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5"><ShoppingBag className="h-3 w-3" /> Clics</p>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="p-3">
            <p className="text-xl font-bold text-green-600">{partenaire.nombre_commandes || 0}</p>
            <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5"><TrendingUp className="h-3 w-3" /> Cmdes</p>
          </CardContent>
        </Card>
      </div>

      {/* Abonnement */}
      <Card className={abonnExpire ? "border-red-200" : "border-green-200"}>
        <CardContent className="p-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold">Abonnement mensuel</p>
            <p className="text-xs text-muted-foreground">
              Expire : {partenaire.date_expiration_abonnement ? moment(partenaire.date_expiration_abonnement).format("DD/MM/YYYY") : "—"}
            </p>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full font-semibold ${abonnExpire ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
            {partenaire.statut_abonnement || "Actif"}
          </span>
        </CardContent>
      </Card>

      {/* Visiteurs récents */}
      {visiteurs.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">Visiteurs récents</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {visiteurs.slice(0, 5).map(v => (
              <div key={v.id} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{v.visiteur_nom || v.visiteur_email || "Anonyme"}</span>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full ${v.type_action === "commander_click" ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                    {v.type_action === "vue" ? "👁 Vue" : "🛒 Commander"}
                  </span>
                  <span className="text-muted-foreground">{moment(v.created_date).fromNow()}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Catalogue */}
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Catalogue / Menu</h2>
        <Button size="sm" onClick={() => setShowAddProduit(!showAddProduit)}>
          <Plus className="h-4 w-4 mr-1" />Ajouter
        </Button>
      </div>

      {showAddProduit && (
        <Card className="border-primary/30">
          <CardContent className="p-4 space-y-3">
            <p className="font-semibold text-sm">Nouveau produit</p>
            <div><Label className="text-xs">Nom *</Label>
              <Input placeholder="Ex: Poulet braisé" value={newProduit.nom} onChange={e => setNewProduit(p => ({ ...p, nom: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Prix (FCFA) *</Label>
                <Input type="number" placeholder="1500" value={newProduit.prix} onChange={e => setNewProduit(p => ({ ...p, prix: e.target.value }))} /></div>
              <div><Label className="text-xs">Catégorie</Label>
                <Input placeholder="Ex: Plats" value={newProduit.categorie} onChange={e => setNewProduit(p => ({ ...p, categorie: e.target.value }))} /></div>
            </div>
            <div><Label className="text-xs">Description</Label>
              <Input placeholder="Détails..." value={newProduit.description} onChange={e => setNewProduit(p => ({ ...p, description: e.target.value }))} /></div>
            <div>
              <Label className="text-xs">Photo</Label>
              <input type="file" accept="image/*" className="hidden" id="photo_produit" onChange={e => setPhotoFile(e.target.files[0])} />
              <label htmlFor="photo_produit" className={`mt-1 flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-xs transition-colors ${photoFile ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted"}`}>
                <Upload className="h-3 w-3" />{photoFile ? photoFile.name : "Choisir une photo"}
              </label>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowAddProduit(false)}>Annuler</Button>
              <Button size="sm" className="flex-1" onClick={ajouterProduit} disabled={savingProduit}>
                {savingProduit ? "..." : "Ajouter"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {produits.length === 0 && !showAddProduit && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Aucun produit. Ajoutez votre catalogue !
          </div>
        )}
        {produits.map(prod => (
          <Card key={prod.id}>
            <CardContent className="p-3 flex items-center gap-3">
              {prod.photo && <img src={prod.photo} alt={prod.nom} className="h-12 w-12 rounded-lg object-cover flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{prod.nom}</p>
                {prod.categorie && <p className="text-[10px] text-muted-foreground">{prod.categorie}</p>}
                <p className="text-sm font-bold text-primary">{(prod.prix || 0).toLocaleString()} FCFA</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => toggleProduit(prod)} className="p-1.5">
                  {prod.disponible
                    ? <ToggleRight className="h-5 w-5 text-green-500" />
                    : <ToggleLeft className="h-5 w-5 text-muted-foreground" />}
                </button>
                <button onClick={() => supprimerProduit(prod.id)} className="p-1.5 text-red-400 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}