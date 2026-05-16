import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin, Phone, Clock, ShoppingCart, MessageCircle, ArrowLeft, Plus, Minus, Trash2, X, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { vibrateLight, vibrateSuccess } from "@/lib/vibration";
import QuartierSelect from "../../components/QuartierSelect";

const TYPE_EMOJI = {
  Restaurant: "🍽️", Pharmacie: "💊", Boutique: "🛍️", Alimentation: "🥗", Boissons: "🥤", Vitrine: "✨"
};

const IS_LIVRABLE = ["Restaurant", "Pharmacie", "Boutique", "Alimentation", "Boissons"];
const FRAIS_LIVRAISON = 1500;

export default function PagePartenaire() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [partenaire, setPartenaire] = useState(null);
  const [produits, setProduits] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [panier, setPanier] = useState([]);
  const [showPanier, setShowPanier] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [form, setForm] = useState({ quartier_arrivee: "", adresse: "", telephone: "", note: "", mode_paiement: "Paiement à la livraison" });
  const [ordering, setOrdering] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);

  useEffect(() => {
    const load = async () => {
      const me = await base44.auth.me();
      setUser(me);
      if (me.telephone) setForm(f => ({ ...f, telephone: me.telephone }));
      const parts = await base44.entities.Partenaire.filter({ id });
      if (parts.length > 0) {
        const p = parts[0];
        setPartenaire(p);
        const prods = await base44.entities.ProduitPartenaire.filter({ partenaire_id: p.id, disponible: true }, "nom", 100);
        setProduits(prods);
        base44.entities.VisitePartenaire.create({ partenaire_id: p.id, visiteur_email: me.email, visiteur_nom: me.full_name, type_action: "vue", date_visite: new Date().toISOString() });
        base44.entities.Partenaire.update(p.id, { nombre_vues: (p.nombre_vues || 0) + 1 });
      }
      setLoading(false);
    };
    load();
  }, [id]);

  const addToCart = (prod) => {
    vibrateLight();
    setPanier(prev => {
      const existing = prev.find(i => i.id === prod.id);
      if (existing) return prev.map(i => i.id === prod.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { ...prod, qty: 1 }];
    });
    toast.success(`${prod.nom} ajouté au panier`);
  };

  const updateQty = (id, delta) => {
    setPanier(prev => prev.map(i => i.id === id ? { ...i, qty: Math.max(0, i.qty + delta) } : i).filter(i => i.qty > 0));
  };

  const totalProduits = panier.reduce((s, i) => s + i.prix * i.qty, 0);
  const totalCommande = totalProduits + FRAIS_LIVRAISON;
  const nbArticles = panier.reduce((s, i) => s + i.qty, 0);

  const handleCommander = async () => {
    if (!form.quartier_arrivee || !form.telephone) { toast.error("Veuillez remplir tous les champs requis"); return; }
    if (panier.length === 0) { toast.error("Votre panier est vide"); return; }
    setOrdering(true);

    base44.entities.Partenaire.update(partenaire.id, {
      nombre_clics_commander: (partenaire.nombre_clics_commander || 0) + 1,
      nombre_commandes: (partenaire.nombre_commandes || 0) + 1,
      chiffre_affaires: (partenaire.chiffre_affaires || 0) + totalProduits,
    });
    base44.entities.VisitePartenaire.create({ partenaire_id: partenaire.id, visiteur_email: user.email, visiteur_nom: user.full_name, type_action: "commander_click", date_visite: new Date().toISOString() });

    const cmd = await base44.entities.CommandePartenaire.create({
      partenaire_id: partenaire.id,
      partenaire_email: partenaire.user_email,
      partenaire_nom: partenaire.nom_commerce,
      client_email: user.email,
      client_nom: user.full_name,
      client_telephone: form.telephone,
      quartier_livraison: form.quartier_arrivee,
      adresse_livraison: form.adresse,
      note_client: form.note,
      items_json: JSON.stringify(panier.map(i => ({ id: i.id, nom: i.nom, prix: i.prix, qty: i.qty, photo: i.photo || "" }))),
      total_produits: totalProduits,
      frais_livraison: FRAIS_LIVRAISON,
      total_commande: totalCommande,
      mode_paiement: form.mode_paiement,
      montant_livraison: FRAIS_LIVRAISON,
      statut: "en_attente_partenaire",
    });

    vibrateSuccess();
    toast.success("🛒 Commande envoyée ! En attente de confirmation du partenaire.", { duration: 5000 });
    setPanier([]);
    setShowCheckout(false);
    setShowPanier(false);
    setOrdering(false);
  };

  const galerie = (() => {
    const photos = [];
    if (partenaire?.photo_principale) photos.push(partenaire.photo_principale);
    if (partenaire?.photo_couverture && partenaire.photo_couverture !== partenaire.photo_principale) photos.push(partenaire.photo_couverture);
    if (partenaire?.galerie_photos) { try { const arr = JSON.parse(partenaire.galerie_photos); arr.forEach(u => { if (u && !photos.includes(u)) photos.push(u); }); } catch (_) {} }
    if (partenaire?.photos) { try { const arr = JSON.parse(partenaire.photos); arr.forEach(u => { if (u && !photos.includes(u)) photos.push(u); }); } catch (_) {} }
    return photos;
  })();

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;

  if (!partenaire) return (
    <div className="text-center py-12">
      <p className="text-muted-foreground">Commerce introuvable</p>
      <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>Retour</Button>
    </div>
  );

  if (partenaire.statut === "suspendu") return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="border-red-200 bg-red-50 max-w-sm mx-auto"><CardContent className="p-8 text-center space-y-3"><div className="text-4xl">🚫</div><h2 className="font-bold text-red-700">Commerce suspendu</h2><p className="text-sm text-red-600">Ce commerce n'est plus disponible pour le moment.</p></CardContent></Card>
    </div>
  );

  const categories = [...new Set(produits.map(p => p.categorie).filter(Boolean))];

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
      </div>

      {/* Hero galerie */}
      <div className="relative rounded-2xl overflow-hidden">
        {galerie.length > 0 ? (
          <div className="relative">
            <img src={galerie[photoIndex]} alt={partenaire.nom_commerce} className="w-full h-52 object-cover" />
            {galerie.length > 1 && (
              <>
                <button onClick={() => setPhotoIndex(i => (i - 1 + galerie.length) % galerie.length)} className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 text-white rounded-full w-7 h-7 flex items-center justify-center text-xs">‹</button>
                <button onClick={() => setPhotoIndex(i => (i + 1) % galerie.length)} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 text-white rounded-full w-7 h-7 flex items-center justify-center text-xs">›</button>
                <div className="absolute bottom-14 left-1/2 -translate-x-1/2 flex gap-1">
                  {galerie.map((_, i) => <div key={i} className={`w-1.5 h-1.5 rounded-full ${i === photoIndex ? "bg-white" : "bg-white/40"}`} />)}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="w-full h-52 bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
            <span className="text-6xl">{TYPE_EMOJI[partenaire.type_commerce] || "🏪"}</span>
          </div>
        )}
        {partenaire.logo && (
          <div className="absolute bottom-0 left-4 translate-y-1/2 h-14 w-14 rounded-xl border-2 border-background overflow-hidden bg-white shadow-lg">
            <img src={partenaire.logo} alt="logo" className="w-full h-full object-cover" />
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-8">
          <h1 className="text-white font-bold text-xl">{partenaire.nom_commerce}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-white/80 text-xs">{TYPE_EMOJI[partenaire.type_commerce]} {partenaire.type_commerce}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${partenaire.ouvert ? "bg-green-500 text-white" : "bg-gray-500 text-white"}`}>
              {partenaire.ouvert ? "Ouvert" : "Fermé"}
            </span>
          </div>
        </div>
      </div>

      {partenaire.logo && <div className="h-6" />}

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
        {partenaire.telephone && (
          <>
            <a href={`https://wa.me/${partenaire.telephone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="flex-1"
              onClick={() => { base44.entities.Partenaire.update(partenaire.id, { nombre_contacts: (partenaire.nombre_contacts || 0) + 1 }); }}>
              <Button className="w-full bg-green-600 hover:bg-green-700"><MessageCircle className="h-4 w-4 mr-1" />WhatsApp</Button>
            </a>
            <a href={`tel:${partenaire.telephone}`}><Button variant="outline" size="icon"><Phone className="h-4 w-4" /></Button></a>
          </>
        )}
      </div>

      {/* Catalogue vitrine */}
      {partenaire.type_commerce === "Vitrine" && partenaire.catalogue_url && (
        <div>
          <a href={partenaire.catalogue_url} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="w-full">📋 Voir le catalogue</Button>
          </a>
        </div>
      )}

      {/* Vidéo */}
      {partenaire.video_presentation && (
        <div className="rounded-xl overflow-hidden">
          <p className="text-sm font-semibold mb-2">🎥 Présentation</p>
          <video src={partenaire.video_presentation} controls className="w-full rounded-xl" />
        </div>
      )}

      {/* Catalogue produits */}
      {produits.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-bold text-base">
            {partenaire.type_commerce === "Restaurant" ? "🍽️ Menu" : partenaire.type_commerce === "Vitrine" ? "✨ Nos services" : "🛍️ Catalogue"}
          </h2>
          {(categories.length > 0 ? categories : [null]).map(cat => (
            <div key={cat || "all"}>
              {cat && <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 mt-3">{cat}</p>}
              <div className="space-y-2">
                {produits.filter(p => cat ? p.categorie === cat : true).map(prod => {
                  const qtyInCart = panier.find(i => i.id === prod.id)?.qty || 0;
                  return (
                    <Card key={prod.id}>
                      <CardContent className="p-3 flex items-center gap-3">
                        {prod.photo
                          ? <img src={prod.photo} alt={prod.nom} className="h-16 w-16 rounded-xl object-cover flex-shrink-0" />
                          : <div className="h-16 w-16 rounded-xl bg-muted flex items-center justify-center text-2xl flex-shrink-0">{TYPE_EMOJI[partenaire.type_commerce] || "🍱"}</div>
                        }
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm">{prod.nom}</p>
                          {prod.description && <p className="text-xs text-muted-foreground line-clamp-2">{prod.description}</p>}
                          <p className="font-bold text-primary text-sm mt-0.5">{(prod.prix || 0).toLocaleString()} FCFA</p>
                        </div>
                        {IS_LIVRABLE.includes(partenaire.type_commerce) && (
                          <div className="flex-shrink-0">
                            {qtyInCart === 0 ? (
                              <Button size="icon" className="h-8 w-8 rounded-full" onClick={() => addToCart(prod)}>
                                <Plus className="h-4 w-4" />
                              </Button>
                            ) : (
                              <div className="flex items-center gap-1">
                                <Button size="icon" variant="outline" className="h-7 w-7 rounded-full" onClick={() => updateQty(prod.id, -1)}>
                                  <Minus className="h-3 w-3" />
                                </Button>
                                <span className="text-sm font-bold w-5 text-center">{qtyInCart}</span>
                                <Button size="icon" className="h-7 w-7 rounded-full" onClick={() => addToCart(prod)}>
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bouton panier flottant */}
      {IS_LIVRABLE.includes(partenaire.type_commerce) && nbArticles > 0 && !showPanier && (
        <div className="fixed bottom-20 left-4 right-4 z-40">
          <Button className="w-full h-12 shadow-xl text-base" onClick={() => setShowPanier(true)}>
            <ShoppingCart className="h-5 w-5 mr-2" />
            Voir mon panier ({nbArticles}) — {totalProduits.toLocaleString()} FCFA
          </Button>
        </div>
      )}

      {/* Panneau panier */}
      {showPanier && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end" onClick={() => setShowPanier(false)}>
          <div className="bg-background w-full rounded-t-2xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-background border-b px-4 py-3 flex items-center justify-between">
              <h2 className="font-bold text-lg">🛒 Mon panier</h2>
              <Button size="icon" variant="ghost" onClick={() => setShowPanier(false)}><X className="h-5 w-5" /></Button>
            </div>
            <div className="p-4 space-y-3">
              {panier.map(item => (
                <div key={item.id} className="flex items-center gap-3">
                  {item.photo
                    ? <img src={item.photo} alt={item.nom} className="h-12 w-12 rounded-lg object-cover flex-shrink-0" />
                    : <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center text-xl flex-shrink-0">🍱</div>
                  }
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{item.nom}</p>
                    <p className="text-xs text-muted-foreground">{item.prix.toLocaleString()} FCFA</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button size="icon" variant="outline" className="h-7 w-7 rounded-full" onClick={() => updateQty(item.id, -1)}>
                      {item.qty === 1 ? <Trash2 className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                    </Button>
                    <span className="text-sm font-bold w-5 text-center">{item.qty}</span>
                    <Button size="icon" className="h-7 w-7 rounded-full" onClick={() => updateQty(item.id, 1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="font-bold text-sm text-primary w-20 text-right flex-shrink-0">{(item.prix * item.qty).toLocaleString()} F</p>
                </div>
              ))}

              <div className="border-t pt-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Sous-total</span><span>{totalProduits.toLocaleString()} FCFA</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Livraison CDL</span><span>{FRAIS_LIVRAISON.toLocaleString()} FCFA</span></div>
                <div className="flex justify-between font-bold text-base border-t pt-2"><span>Total</span><span className="text-primary">{totalCommande.toLocaleString()} FCFA</span></div>
              </div>

              <Button className="w-full h-12 text-base" onClick={() => { setShowPanier(false); setShowCheckout(true); }}>
                Commander <ChevronRight className="h-5 w-5 ml-1" />
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setPanier([])}>
                <Trash2 className="h-4 w-4 mr-2" />Vider le panier
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Checkout */}
      {showCheckout && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end" onClick={() => setShowCheckout(false)}>
          <div className="bg-background w-full rounded-t-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-background border-b px-4 py-3 flex items-center justify-between">
              <h2 className="font-bold text-lg">📍 Finaliser la commande</h2>
              <Button size="icon" variant="ghost" onClick={() => setShowCheckout(false)}><X className="h-5 w-5" /></Button>
            </div>
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <Label>Quartier de livraison *</Label>
                <QuartierSelect value={form.quartier_arrivee} onValueChange={v => setForm(f => ({ ...f, quartier_arrivee: v }))} placeholder="Où livrer ?" />
              </div>
              <div className="space-y-2">
                <Label>Adresse précise</Label>
                <Input placeholder="Ex: Rue 12.45, maison bleue..." value={form.adresse} onChange={e => setForm(f => ({ ...f, adresse: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Téléphone *</Label>
                <Input placeholder="+226 XX XX XX XX" value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Instructions / Note</Label>
                <Input placeholder="Ex: Sans piment, sonner 2 fois..." value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Mode de paiement</Label>
                <div className="grid grid-cols-2 gap-2">
                  {["Paiement à la livraison","Orange Money","Moov Money","Telecel Money"].map(m => (
                    <button key={m} onClick={() => setForm(f => ({ ...f, mode_paiement: m }))}
                      className={`p-2.5 rounded-lg border text-xs font-medium transition-all ${form.mode_paiement === m ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Récap */}
              <div className="bg-muted/50 rounded-xl p-3 space-y-1.5 text-sm">
                <p className="font-semibold">Récapitulatif</p>
                {panier.map(i => (
                  <div key={i.id} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{i.nom} × {i.qty}</span>
                    <span>{(i.prix * i.qty).toLocaleString()} F</span>
                  </div>
                ))}
                <div className="border-t pt-1.5 flex justify-between font-bold">
                  <span>Total</span><span className="text-primary">{totalCommande.toLocaleString()} FCFA</span>
                </div>
              </div>

              <Button className="w-full h-12 text-base" onClick={handleCommander} disabled={ordering}>
                {ordering ? "Envoi en cours..." : `✅ Confirmer — ${totalCommande.toLocaleString()} FCFA`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}