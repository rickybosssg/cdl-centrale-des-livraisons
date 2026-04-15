import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import PubliciteHomeBanner from "@/components/PubliciteHomeBanner";
import BedouWidget from "@/components/BedouWidget";
import { useMessageNotification } from "@/hooks/useMessageNotification";
import { useMessageCount } from "@/hooks/useMessageCount";
import MessageAlert from "@/components/MessageAlert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, ShoppingBag, TrendingUp, Plus, ToggleLeft, ToggleRight, Trash2, Upload, Bell, MessageCircle, BarChart2, ImageIcon, Package, DollarSign } from "lucide-react";
import ChatAdmin from "@/components/ChatAdmin";
import { toast } from "sonner";
import { vibrateLight } from "@/lib/vibration";
import moment from "moment";

const TABS = [
  { key: "accueil", label: "📊 Accueil" },
  { key: "produits", label: "🛍️ Catalogue" },
  { key: "commandes", label: "📦 Commandes" },
  { key: "photos", label: "🖼️ Photos" },
  { key: "messages", label: "💬 Messages" },
];

export default function DashboardPartenaire({ user }) {
  const navigate = useNavigate();
  const [partenaire, setPartenaire] = useState(null);
  const [produits, setProduits] = useState([]);
  const [commandes, setCommandes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("accueil");
  const [showAddProduit, setShowAddProduit] = useState(false);
  const [newProduit, setNewProduit] = useState({ nom: "", prix: "", categorie: "", description: "" });
  const [photoFile, setPhotoFile] = useState(null);
  const [savingProduit, setSavingProduit] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const newMsg = useMessageNotification(user?.email);
  const hasUnreadMessages = useMessageCount(user?.email, "partenaire");

  useEffect(() => {
    const load = async () => {
      const parts = await base44.entities.Partenaire.filter({ user_email: user.email });
      if (parts.length > 0) {
        const p = parts[0];
        setPartenaire(p);
        const [prods, cmds] = await Promise.all([
          base44.entities.ProduitPartenaire.filter({ partenaire_id: p.id }, "-created_date", 100),
          base44.entities.CommandePartenaire.filter({ partenaire_id: p.id }, "-created_date", 100),
        ]);
        setProduits(prods);
        setCommandes(cmds);
      }
      setLoading(false);
    };
    load();
  }, [user?.email]);

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

  const toggleProduit = async (prod) => {
    vibrateLight();
    await base44.entities.ProduitPartenaire.update(prod.id, { disponible: !prod.disponible });
    setProduits(p => p.map(pr => pr.id === prod.id ? { ...pr, disponible: !pr.disponible } : pr));
  };

  const supprimerProduit = async (id) => {
    await base44.entities.ProduitPartenaire.delete(id);
    setProduits(p => p.filter(pr => pr.id !== id));
    toast.success("Produit supprimé");
  };

  const uploadGaleriePhoto = async (file) => {
    setUploadingPhoto(true);
    const res = await base44.integrations.Core.UploadFile({ file });
    const currentGalerie = (() => { try { return JSON.parse(partenaire.galerie_photos || "[]"); } catch (_) { return []; } })();
    const newGalerie = [...currentGalerie, res.file_url];
    await base44.entities.Partenaire.update(partenaire.id, { galerie_photos: JSON.stringify(newGalerie) });
    setPartenaire(p => ({ ...p, galerie_photos: JSON.stringify(newGalerie) }));
    toast.success("Photo ajoutée !");
    setUploadingPhoto(false);
  };

  const supprimerPhotoGalerie = async (url) => {
    const current = (() => { try { return JSON.parse(partenaire.galerie_photos || "[]"); } catch (_) { return []; } })();
    const newArr = current.filter(u => u !== url);
    await base44.entities.Partenaire.update(partenaire.id, { galerie_photos: JSON.stringify(newArr) });
    setPartenaire(p => ({ ...p, galerie_photos: JSON.stringify(newArr) }));
    toast.success("Photo supprimée");
  };

  const updatePhotoPrincipale = async (file) => {
    setUploadingPhoto(true);
    const res = await base44.integrations.Core.UploadFile({ file });
    await base44.entities.Partenaire.update(partenaire.id, { photo_principale: res.file_url });
    setPartenaire(p => ({ ...p, photo_principale: res.file_url }));
    toast.success("Photo de couverture mise à jour !");
    setUploadingPhoto(false);
  };

  const updateLogo = async (file) => {
    setUploadingPhoto(true);
    const res = await base44.integrations.Core.UploadFile({ file });
    await base44.entities.Partenaire.update(partenaire.id, { logo: res.file_url });
    setPartenaire(p => ({ ...p, logo: res.file_url }));
    toast.success("Logo mis à jour !");
    setUploadingPhoto(false);
  };

  if (!user?.email) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-sm text-muted-foreground">Profil non chargé</p>
      </div>
    );
  }

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;

  if (!partenaire) return <div className="text-center py-16 space-y-3"><p className="text-muted-foreground">Profil partenaire introuvable</p></div>;

  if (partenaire.statut === "suspendu") return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="border-red-200 bg-red-50 max-w-sm mx-auto"><CardContent className="p-8 text-center space-y-3"><div className="text-4xl">🚫</div><h2 className="font-bold text-red-700">Compte suspendu</h2><p className="text-sm text-red-600">Votre compte est suspendu. Veuillez contacter CDL.</p>
        <Button className="bg-red-600 hover:bg-red-700 w-full">Contacter le support</Button>
      </CardContent></Card>
    </div>
  );

  if (partenaire.statut === "en_attente") return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <Card className="border-amber-200 bg-amber-50 max-w-sm mx-auto w-full"><CardContent className="p-8 text-center space-y-4">
        <div className="text-5xl">⏳</div>
        <h2 className="font-bold text-amber-700 text-xl">Validation en cours</h2>
        <p className="text-sm text-amber-700">Votre espace partenaire est en cours de validation par l'équipe CDL. Vous serez notifié dès que votre boutique sera activée.</p>
        <div className="bg-white rounded-xl p-3 text-left space-y-1 text-sm border border-amber-200">
          <p><span className="text-muted-foreground">Boutique :</span> <strong>{partenaire.nom_commerce}</strong></p>
          <p><span className="text-muted-foreground">Catégorie :</span> {partenaire.type_commerce}</p>
          <p><span className="text-muted-foreground">Téléphone :</span> {partenaire.telephone}</p>
          <p><span className="text-muted-foreground">Statut :</span> <span className="text-amber-600 font-semibold">En attente</span></p>
        </div>
        {partenaire.motif_refus && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-left text-sm text-red-700">
            <p className="font-semibold">Motif de refus :</p>
            <p>{partenaire.motif_refus}</p>
            <p className="text-xs mt-2">Corrigez les informations puis contactez l'administration CDL.</p>
          </div>
        )}
        <Button variant="outline" className="w-full">📱 Contacter le support</Button>
      </CardContent></Card>
    </div>
  );

  const nbAttente = commandes.filter(c => c.statut === "en_attente_partenaire").length;
  const caTotal = partenaire.chiffre_affaires || commandes.filter(c => c.statut === "livree").reduce((s, c) => s + (c.total_produits || 0), 0);
  const galerie = (() => { try { return JSON.parse(partenaire.galerie_photos || "[]"); } catch (_) { return []; } })();

  return (
    <div className="space-y-0">
      {user && <PubliciteHomeBanner userRole="partenaire" userId={user.id} userEmail={user.email} />}
      <div className="space-y-4 mt-4">
        <MessageAlert newMsg={newMsg} />
        {newMsg && <div className="h-24" />}

        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold truncate">{partenaire.nom_commerce}</h1>
            <span className="text-xs text-muted-foreground">{partenaire.type_commerce} · {partenaire.quartier}</span>
          </div>
          <button onClick={toggleOuvert} className="flex flex-col items-center gap-1">
            {partenaire.ouvert ? <ToggleRight className="h-7 w-7 text-green-500" /> : <ToggleLeft className="h-7 w-7 text-muted-foreground" />}
            <span className={`text-[10px] font-semibold ${partenaire.ouvert ? "text-green-600" : "text-muted-foreground"}`}>
              {partenaire.ouvert ? "Ouvert" : "Fermé"}
            </span>
          </button>
        </div>

        {/* Alerte commandes */}
        {nbAttente > 0 && (
          <button onClick={() => navigate('/commandes-partenaire')} className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-red-300 bg-red-50 animate-pulse">
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5 text-red-500" />
              <div className="text-left">
                <p className="font-semibold text-sm text-red-700">Nouvelles commandes</p>
                <p className="text-xs text-red-600">{nbAttente} commande(s) à valider</p>
              </div>
            </div>
            <span className="h-7 min-w-7 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">{nbAttente}</span>
          </button>
        )}

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto pb-1">
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`whitespace-nowrap px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${activeTab === tab.key ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}>
              {tab.label}
              {tab.key === "messages" && hasUnreadMessages ? <span className="ml-1 w-2 h-2 rounded-full bg-red-500 inline-block" /> : null}
            </button>
          ))}
        </div>

        {/* ─── ACCUEIL ─── */}
        {activeTab === "accueil" && (
          <div className="space-y-4">
            {/* Stats principales */}
            <div className="grid grid-cols-2 gap-3">
              <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-primary">{nbAttente}</p><p className="text-xs text-muted-foreground mt-1">🔔 En attente</p></CardContent></Card>
              <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-green-600">{commandes.filter(c => c.statut === "livree").length}</p><p className="text-xs text-muted-foreground mt-1">✅ Livrées</p></CardContent></Card>
              <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-amber-600">{partenaire.nombre_vues || 0}</p><p className="text-xs text-muted-foreground mt-1">👁️ Vues</p></CardContent></Card>
              <Card><CardContent className="p-4 text-center"><p className="text-lg font-bold text-accent">{partenaire.nombre_commandes || 0}</p><p className="text-xs text-muted-foreground mt-1">📦 Commandes</p></CardContent></Card>
            </div>

            {/* Bloc financier Bedou */}
            <BedouWidget user={user} />

            {/* CA et conversion */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Performance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">CA total</span>
                  <span className="font-bold text-lg">{caTotal.toLocaleString()} FCFA</span>
                </div>
                {partenaire.nombre_vues > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Taux de conversion</span>
                    <span className="font-bold">{Math.round((partenaire.nombre_commandes || 0) / partenaire.nombre_vues * 100)}%</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Clics panier</span>
                  <span className="font-bold">{partenaire.nombre_clics_commander || 0}</span>
                </div>
              </CardContent>
            </Card>

            {/* Bouton commandes */}
            <Button className="w-full gap-2 py-6 text-base" onClick={() => navigate('/commandes-partenaire')}>
              <ShoppingBag className="h-5 w-5" />
              Voir toutes les commandes
            </Button>
          </div>
        )}

        {/* ─── CATALOGUE ─── */}
        {activeTab === "produits" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{produits.length} produit(s)</p>
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
                    <Button size="sm" className="flex-1" onClick={ajouterProduit} disabled={savingProduit}>{savingProduit ? "..." : "Ajouter"}</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {produits.length === 0 && !showAddProduit && (
              <div className="text-center py-8 text-muted-foreground text-sm">Aucun produit. Ajoutez votre catalogue !</div>
            )}
            {produits.map(prod => (
              <Card key={prod.id}>
                <CardContent className="p-3 flex items-center gap-3">
                  {prod.photo
                    ? <img src={prod.photo} alt={prod.nom} className="h-12 w-12 rounded-lg object-cover flex-shrink-0" />
                    : <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center text-xl flex-shrink-0">🍱</div>
                  }
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{prod.nom}</p>
                    {prod.categorie && <p className="text-[10px] text-muted-foreground">{prod.categorie}</p>}
                    <p className="text-sm font-bold text-primary">{(prod.prix || 0).toLocaleString()} FCFA</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => toggleProduit(prod)} className="p-1.5">
                      {prod.disponible ? <ToggleRight className="h-5 w-5 text-green-500" /> : <ToggleLeft className="h-5 w-5 text-muted-foreground" />}
                    </button>
                    <button onClick={() => supprimerProduit(prod.id)} className="p-1.5 text-red-400 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ─── COMMANDES ─── */}
        {activeTab === "commandes" && (
          <div className="space-y-3">
            <Button className="w-full" onClick={() => navigate('/commandes-partenaire')}>
              <ShoppingBag className="h-4 w-4 mr-2" />Gérer les commandes
              {nbAttente > 0 && <span className="ml-2 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">{nbAttente}</span>}
            </Button>
            {commandes.slice(0, 5).map(cmd => (
              <Card key={cmd.id} className={cmd.statut === "en_attente_partenaire" ? "border-amber-300" : ""}>
                <CardContent className="p-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">{cmd.client_nom || "Client"}</p>
                    <p className="text-xs text-muted-foreground">{moment(cmd.created_date).fromNow()}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm text-primary">{(cmd.total_commande || cmd.montant_livraison || 0).toLocaleString()} F</p>
                    <span className="text-[10px] text-muted-foreground">{cmd.statut?.replace(/_/g," ")}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ─── PHOTOS ─── */}
        {activeTab === "photos" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="font-semibold text-sm">Photo de couverture</p>
              {partenaire.photo_principale && (
                <img src={partenaire.photo_principale} alt="couverture" className="w-full h-32 rounded-xl object-cover" />
              )}
              <input type="file" accept="image/*" className="hidden" id="cover_upload" onChange={e => e.target.files[0] && updatePhotoPrincipale(e.target.files[0])} />
              <label htmlFor="cover_upload" className="flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-xs hover:bg-muted">
                <Upload className="h-3 w-3" />{uploadingPhoto ? "Upload..." : "Changer la couverture"}
              </label>
            </div>

            <div className="space-y-2">
              <p className="font-semibold text-sm">Logo</p>
              {partenaire.logo && <img src={partenaire.logo} alt="logo" className="h-20 w-20 rounded-xl object-cover" />}
              <input type="file" accept="image/*" className="hidden" id="logo_upload" onChange={e => e.target.files[0] && updateLogo(e.target.files[0])} />
              <label htmlFor="logo_upload" className="flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-xs hover:bg-muted">
                <Upload className="h-3 w-3" />{uploadingPhoto ? "Upload..." : "Changer le logo"}
              </label>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm">Galerie photos ({galerie.length})</p>
                <div>
                  <input type="file" accept="image/*" className="hidden" id="galerie_upload" onChange={e => e.target.files[0] && uploadGaleriePhoto(e.target.files[0])} />
                  <label htmlFor="galerie_upload" className="cursor-pointer">
                    <Button size="sm" variant="outline" disabled={uploadingPhoto} asChild><span><Plus className="h-3 w-3 mr-1" />Ajouter</span></Button>
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {galerie.map((url, i) => (
                  <div key={i} className="relative group">
                    <img src={url} alt={`photo ${i+1}`} className="w-full h-24 rounded-xl object-cover" />
                    <button onClick={() => supprimerPhotoGalerie(url)} className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                  </div>
                ))}
                {galerie.length === 0 && <p className="col-span-3 text-xs text-muted-foreground text-center py-4">Aucune photo dans la galerie</p>}
              </div>
            </div>
          </div>
        )}

        {/* ─── MESSAGES ─── */}
        {activeTab === "messages" && (
          <Card>
            <CardContent className="p-4">
              <p className="text-sm font-semibold mb-3">💬 Discussion avec l'Administration CDL</p>
              <ChatAdmin userEmail={user.email} userRole="partenaire" currentUser={user} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}