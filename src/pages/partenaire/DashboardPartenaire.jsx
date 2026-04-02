import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import PubliciteHomeBanner from "@/components/PubliciteHomeBanner";
import { useMessageNotification } from "@/hooks/useMessageNotification";
import { useMessageCount } from "@/hooks/useMessageCount";
import MessageAlert from "@/components/MessageAlert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, ShoppingBag, TrendingUp, Plus, ToggleLeft, ToggleRight, Trash2, Upload, Bell, MessageCircle, BarChart2, Settings2, ImageIcon, Package } from "lucide-react";
import ChatAdmin from "@/components/ChatAdmin";
import { toast } from "sonner";
import { vibrateLight } from "@/lib/vibration";
import moment from "moment";

const TABS = [
  { key: "stats", label: "📊 Stats", icon: BarChart2 },
  { key: "produits", label: "🛍️ Catalogue", icon: Package },
  { key: "commandes", label: "📦 Commandes", icon: ShoppingBag },
  { key: "photos", label: "🖼️ Photos", icon: ImageIcon },
  { key: "messages", label: "💬 Messages", icon: MessageCircle },
];

export default function DashboardPartenaire({ user }) {
  const navigate = useNavigate();
  const [partenaire, setPartenaire] = useState(null);
  const [produits, setProduits] = useState([]);
  const [commandes, setCommandes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("stats");
  const [showAddProduit, setShowAddProduit] = useState(false);
  const [newProduit, setNewProduit] = useState({ nom: "", prix: "", categorie: "", description: "" });
  const [photoFile, setPhotoFile] = useState(null);
  const [savingProduit, setSavingProduit] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const newMsg = useMessageNotification(user.email);
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

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;

  if (!partenaire) return <div className="text-center py-16 space-y-3"><p className="text-muted-foreground">Profil partenaire introuvable</p></div>;

  if (partenaire.statut === "suspendu") return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="border-red-200 bg-red-50 max-w-sm mx-auto"><CardContent className="p-8 text-center space-y-3"><div className="text-4xl">🚫</div><h2 className="font-bold text-red-700">Compte suspendu</h2><p className="text-sm text-red-600">Votre compte est suspendu. Veuillez contacter CDL.</p>
        <a href="https://wa.me/message/EH7SMNHNHL7RN1" target="_blank" rel="noopener noreferrer"><Button className="bg-green-600 hover:bg-green-700 w-full">Contacter CDL via WhatsApp</Button></a>
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
        <a href="https://wa.me/message/EH7SMNHNHL7RN1" target="_blank" rel="noopener noreferrer">
          <Button className="bg-green-600 hover:bg-green-700 w-full">📱 Contacter CDL</Button>
        </a>
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{partenaire.nom_commerce}</h1>
          <span className="text-xs text-muted-foreground">{partenaire.type_commerce} · {partenaire.quartier}</span>
        </div>
        <button onClick={toggleOuvert} className="flex items-center gap-1.5">
          {partenaire.ouvert ? <ToggleRight className="h-7 w-7 text-green-500" /> : <ToggleLeft className="h-7 w-7 text-muted-foreground" />}
          <span className={`text-xs font-semibold ${partenaire.ouvert ? "text-green-600" : "text-muted-foreground"}`}>
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
              <p className="text-xs text-red-600">{nbAttente} commande(s) en attente de validation</p>
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

      {/* ─── STATS ─── */}
      {activeTab === "stats" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-primary">{partenaire.nombre_vues || 0}</p><p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><Eye className="h-3 w-3" />Vues</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-green-600">{partenaire.nombre_commandes || 0}</p><p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><ShoppingBag className="h-3 w-3" />Commandes</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-accent">{partenaire.nombre_clics_commander || 0}</p><p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><TrendingUp className="h-3 w-3" />Clics panier</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><p className="text-sm font-bold text-primary">{caTotal.toLocaleString()}</p><p className="text-xs text-muted-foreground">CA total (FCFA)</p></CardContent></Card>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs text-center">
            <div className="p-2 rounded-xl bg-amber-50 border border-amber-200"><p className="font-bold text-amber-600">{commandes.filter(c => c.statut === "en_attente_partenaire").length}</p><p className="text-amber-700">En attente</p></div>
            <div className="p-2 rounded-xl bg-green-50 border border-green-200"><p className="font-bold text-green-600">{commandes.filter(c => c.statut === "livree").length}</p><p className="text-green-700">Livrées</p></div>
            <div className="p-2 rounded-xl bg-red-50 border border-red-200"><p className="font-bold text-red-600">{commandes.filter(c => c.statut === "annulee" || c.statut === "refusee").length}</p><p className="text-red-700">Annulées</p></div>
          </div>
          {partenaire.nombre_vues > 0 && (
            <Card className="bg-muted/50">
              <CardContent className="p-3 text-sm">
                <p className="text-xs text-muted-foreground">Taux de conversion</p>
                <p className="text-2xl font-bold">{Math.round((partenaire.nombre_commandes || 0) / partenaire.nombre_vues * 100)}%</p>
              </CardContent>
            </Card>
          )}
          <Card className={(partenaire.statut_abonnement === 'Expiré') ? 'border-red-300 bg-red-50' : 'border-green-200'}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold">Abonnement mensuel</p>
                  <p className="text-xs text-muted-foreground">Expire : {partenaire.date_expiration_abonnement ? moment(partenaire.date_expiration_abonnement).format('DD/MM/YYYY') : '—'}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-semibold ${partenaire.statut_abonnement === 'Expiré' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{partenaire.statut_abonnement || 'Actif'}</span>
              </div>
              {partenaire.statut_abonnement === 'Expiré' && (
                <div className="p-3 rounded-xl bg-red-100 border border-red-300 text-sm text-red-800 font-medium">
                  🚫 Votre boutique est masquée du marketplace. Renouvelez votre abonnement pour être visible.
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 text-xs text-center pt-1">
                <div className="p-2 rounded-lg bg-muted/50 border">
                  <p className="font-bold text-primary">10 000 F</p>
                  <p className="text-muted-foreground">1er mois</p>
                </div>
                <div className="p-2 rounded-lg bg-muted/50 border">
                  <p className="font-bold text-primary">30 000 F</p>
                  <p className="text-muted-foreground">Mois suivants</p>
                </div>
              </div>
              <a href="https://wa.me/message/EH7SMNHNHL7RN1" target="_blank" rel="noopener noreferrer">
                <button className="w-full py-2 mt-1 rounded-xl bg-green-600 text-white text-sm font-semibold">
                  💬 Payer via WhatsApp CDL
                </button>
              </a>
            </CardContent>
          </Card>
          <Button variant="outline" className="w-full" onClick={() => navigate('/commandes-partenaire')}>
            <ShoppingBag className="h-4 w-4 mr-2" />Voir toutes les commandes
          </Button>
        </div>
      )}

      {/* ─── CATALOGUE ─── */}
      {activeTab === "produits" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{produits.length} produit(s)</p>
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