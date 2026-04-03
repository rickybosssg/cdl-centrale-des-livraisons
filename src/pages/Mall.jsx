import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Search, Store, Package, ShoppingBag, BarChart3, MapPin, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import moment from "moment";

const CATEGORIES = ["Tous", "Restaurant", "Pharmacie", "Boutique", "Alimentation", "Boissons", "Vitrine"];

const STATUT_COLORS = {
  en_attente_partenaire: "bg-amber-100 text-amber-700",
  acceptee: "bg-blue-100 text-blue-700",
  en_preparation: "bg-purple-100 text-purple-700",
  prete: "bg-indigo-100 text-indigo-700",
  en_livraison: "bg-cyan-100 text-cyan-700",
  livree: "bg-green-100 text-green-700",
  annulee: "bg-red-100 text-red-700",
  refusee: "bg-red-100 text-red-700",
};

const STATUT_LABELS = {
  en_attente_partenaire: "En attente",
  acceptee: "Acceptée",
  en_preparation: "En préparation",
  prete: "Prête",
  en_livraison: "En livraison",
  livree: "Livrée ✅",
  annulee: "Annulée",
  refusee: "Refusée",
};

// ─── Mes commandes Mall (client / livreur / commercial) ─────────────────────
function MesCommandesMall({ userEmail }) {
  const [commandes, setCommandes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState("tous");

  useEffect(() => {
    base44.entities.CommandePartenaire.filter({ client_email: userEmail }, "-created_date", 100)
      .then(d => { setCommandes(d || []); setLoading(false); });
  }, [userEmail]);

  const FILTRES = [
    { val: "tous", label: "Toutes" },
    { val: "en_cours", label: "🔄 En cours" },
    { val: "livree", label: "✅ Livrées" },
    { val: "annulee", label: "❌ Annulées" },
  ];

  const filtered = commandes.filter(c => {
    if (filtre === "tous") return true;
    if (filtre === "en_cours") return !["livree", "annulee", "refusee"].includes(c.statut);
    return c.statut === filtre;
  });

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTRES.map(f => (
          <button key={f.val} onClick={() => setFiltre(f.val)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-all ${filtre === f.val ? "bg-primary text-white border-primary" : "border-border"}`}>
            {f.label}
          </button>
        ))}
      </div>
      {loading && <div className="flex justify-center py-8"><div className="w-6 h-6 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>}
      {!loading && filtered.length === 0 && (
        <div className="text-center py-12 space-y-2">
          <ShoppingBag className="h-10 w-10 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">Aucune commande Mall</p>
        </div>
      )}
      <div className="space-y-2">
        {filtered.map(cmd => (
          <Card key={cmd.id}>
            <CardContent className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold">🏪</span>
                    <p className="font-semibold text-sm">{cmd.partenaire_nom}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">📍 {cmd.quartier_livraison}</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUT_COLORS[cmd.statut] || "bg-muted text-muted-foreground"}`}>
                  {STATUT_LABELS[cmd.statut] || cmd.statut}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">{moment(cmd.created_date).format("DD/MM/YY HH:mm")}</span>
                <span className="font-bold text-primary">{(cmd.total_commande || 0).toLocaleString()} FCFA</span>
              </div>
              {cmd.course_id && (
                <div className="text-[10px] text-blue-600 font-medium">🛵 Course CDL en cours · ID: {cmd.course_id.slice(0,8)}…</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Vue boutiques ──────────────────────────────────────────────────────────
function MallBoutiques({ isAdmin }) {
  const navigate = useNavigate();
  const [partenaires, setPartenaires] = useState([]);
  const [search, setSearch] = useState("");
  const [categorie, setCategorie] = useState("Tous");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.Partenaire.filter({ deleted: false }).then(d => {
      setPartenaires(d || []);
      setLoading(false);
    });
  }, []);

  const filtered = partenaires.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !q || p.nom_commerce?.toLowerCase().includes(q) || p.quartier?.toLowerCase().includes(q);
    const matchCat = categorie === "Tous" || p.type_commerce === categorie;
    const matchStatus = isAdmin ? true : p.statut === "actif";
    return matchSearch && matchCat && matchStatus;
  });

  const toggleActif = async (p) => {
    const newStatut = p.statut === "actif" ? "suspendu" : "actif";
    await base44.entities.Partenaire.update(p.id, { statut: newStatut });
    setPartenaires(prev => prev.map(x => x.id === p.id ? { ...x, statut: newStatut } : x));
    toast.success(`Boutique ${newStatut === "actif" ? "activée" : "suspendue"}`);
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Rechercher une boutique..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {CATEGORIES.map(c => (
          <button key={c} onClick={() => setCategorie(c)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-all ${categorie === c ? "bg-primary text-white border-primary" : "border-border"}`}>
            {c}
          </button>
        ))}
      </div>
      {loading && <div className="flex justify-center py-8"><div className="w-6 h-6 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>}
      <div className="grid grid-cols-2 gap-3">
        {filtered.map(p => (
          <Card key={p.id} className={`overflow-hidden cursor-pointer hover:shadow-md transition-all ${p.statut !== "actif" && isAdmin ? "opacity-60 border-dashed" : ""}`}>
            <div className="relative" onClick={() => navigate(`/commerce/${p.id}`)}>
              {p.photo_principale || p.photo_couverture ? (
                <img src={p.photo_principale || p.photo_couverture} alt={p.nom_commerce} className="w-full h-24 object-cover" />
              ) : (
                <div className="h-24 bg-gradient-to-br from-primary/10 to-primary/20 flex items-center justify-center">
                  <Store className="h-10 w-10 text-primary/40" />
                </div>
              )}
              {p.ouvert !== undefined && (
                <span className={`absolute top-1.5 right-1.5 text-[9px] px-1.5 py-0.5 rounded-full font-bold ${p.ouvert ? "bg-green-500 text-white" : "bg-gray-500 text-white"}`}>
                  {p.ouvert ? "Ouvert" : "Fermé"}
                </span>
              )}
            </div>
            <CardContent className="p-2 space-y-1">
              <p className="font-semibold text-xs truncate">{p.nom_commerce}</p>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <MapPin className="h-2.5 w-2.5" />
                <span className="truncate">{p.quartier || "—"}</span>
              </div>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{p.type_commerce}</span>
              {isAdmin && (
                <div className="flex gap-1 pt-1">
                  <button onClick={() => navigate(`/commerce/${p.id}`)}
                    className="flex-1 text-[10px] py-1 rounded border text-center hover:bg-muted">Voir</button>
                  <button onClick={() => toggleActif(p)}
                    className={`flex-1 text-[10px] py-1 rounded border text-center ${p.statut === "actif" ? "text-amber-600 border-amber-300" : "text-green-600 border-green-300"}`}>
                    {p.statut === "actif" ? "Suspendre" : "Activer"}
                  </button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      {!loading && filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">Aucune boutique trouvée</div>
      )}
    </div>
  );
}

// ─── Admin : produits ───────────────────────────────────────────────────────
function AdminProduits() {
  const [produits, setProduits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    base44.entities.ProduitPartenaire.list("-created_date", 200).then(d => { setProduits(d || []); setLoading(false); });
  }, []);

  const filtered = produits.filter(p => {
    const q = search.toLowerCase();
    return !q || p.nom?.toLowerCase().includes(q) || p.categorie?.toLowerCase().includes(q);
  });

  const toggleDispo = async (prod) => {
    const newVal = !prod.disponible;
    await base44.entities.ProduitPartenaire.update(prod.id, { disponible: newVal });
    setProduits(prev => prev.map(x => x.id === prod.id ? { ...x, disponible: newVal } : x));
    toast.success(`Produit ${newVal ? "activé" : "désactivé"}`);
  };

  const supprimerProduit = async (prod) => {
    if (!window.confirm(`Supprimer "${prod.nom}" ?`)) return;
    await base44.entities.ProduitPartenaire.delete(prod.id);
    setProduits(prev => prev.filter(x => x.id !== prod.id));
    toast.success("Produit supprimé");
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Rechercher un produit..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <p className="text-xs text-muted-foreground">{filtered.length} produit(s)</p>
      {loading && <div className="flex justify-center py-8"><div className="w-6 h-6 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>}
      <div className="space-y-2">
        {filtered.map(prod => (
          <Card key={prod.id}>
            <CardContent className="p-3 flex items-center gap-3">
              {prod.image_url ? (
                <img src={prod.image_url} alt={prod.nom} className="h-12 w-12 rounded-lg object-cover flex-shrink-0" />
              ) : (
                <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                  <Package className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{prod.nom}</p>
                <p className="text-xs text-muted-foreground">{prod.categorie} · {(prod.prix || 0).toLocaleString()} FCFA</p>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => toggleDispo(prod)}
                  className={`text-[10px] px-2 py-1 rounded-full font-medium ${prod.disponible ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                  {prod.disponible ? "✅" : "❌"}
                </button>
                <button onClick={() => supprimerProduit(prod)} className="text-[10px] px-2 py-1 rounded-full bg-red-50 text-red-600">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Admin : commandes ──────────────────────────────────────────────────────
function AdminCommandes() {
  const [commandes, setCommandes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState("tous");

  useEffect(() => {
    base44.entities.CommandePartenaire.list("-created_date", 200).then(d => { setCommandes(d || []); setLoading(false); });
  }, []);

  const STATUTS = [
    { val: "tous", label: "Toutes" },
    { val: "en_attente_partenaire", label: "⏳ Attente" },
    { val: "en_preparation", label: "🍳 Prépa" },
    { val: "en_livraison", label: "🛵 Livraison" },
    { val: "livree", label: "✅ Livrées" },
    { val: "annulee", label: "❌ Annulées" },
  ];

  const STATUT_COLORS = {
    en_attente_partenaire: "bg-amber-100 text-amber-700",
    acceptee: "bg-blue-100 text-blue-700",
    en_preparation: "bg-purple-100 text-purple-700",
    en_livraison: "bg-cyan-100 text-cyan-700",
    livree: "bg-green-100 text-green-700",
    annulee: "bg-red-100 text-red-700",
    refusee: "bg-red-100 text-red-700",
  };

  const filtered = commandes.filter(c => filtre === "tous" || c.statut === filtre);

  const annulerCommande = async (cmd) => {
    if (!window.confirm("Annuler cette commande ?")) return;
    await base44.entities.CommandePartenaire.update(cmd.id, { statut: "annulee" });
    setCommandes(prev => prev.map(x => x.id === cmd.id ? { ...x, statut: "annulee" } : x));
    toast.success("Commande annulée");
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {STATUTS.map(s => (
          <button key={s.val} onClick={() => setFiltre(s.val)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-all ${filtre === s.val ? "bg-primary text-white border-primary" : "border-border"}`}>
            {s.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{filtered.length} commande(s)</p>
      {loading && <div className="flex justify-center py-8"><div className="w-6 h-6 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>}
      <div className="space-y-2">
        {filtered.map(cmd => (
          <Card key={cmd.id}>
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm">{cmd.partenaire_nom}</p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUT_COLORS[cmd.statut] || "bg-muted text-muted-foreground"}`}>{cmd.statut}</span>
              </div>
              <p className="text-xs text-muted-foreground">Client : {cmd.client_nom} · {cmd.client_telephone}</p>
              <p className="text-xs text-muted-foreground">Zone : {cmd.quartier_livraison}</p>
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-primary">{(cmd.total_commande || 0).toLocaleString()} FCFA</span>
                <span className="text-[10px] text-muted-foreground">{moment(cmd.created_date).format("DD/MM/YY HH:mm")}</span>
              </div>
              {!["livree", "annulee", "refusee"].includes(cmd.statut) && (
                <Button size="sm" variant="outline" className="w-full h-7 text-xs border-red-300 text-red-600" onClick={() => annulerCommande(cmd)}>
                  Annuler la commande
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
        {!loading && filtered.length === 0 && <p className="text-center py-8 text-sm text-muted-foreground">Aucune commande</p>}
      </div>
    </div>
  );
}

// ─── Admin : statistiques ───────────────────────────────────────────────────
function AdminStats() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const load = async () => {
      const [partenaires, produits, commandes] = await Promise.all([
        base44.entities.Partenaire.filter({ deleted: false }),
        base44.entities.ProduitPartenaire.list("-created_date", 500),
        base44.entities.CommandePartenaire.list("-created_date", 500),
      ]);
      const actifs = (partenaires || []).filter(p => p.statut === "actif").length;
      const livrees = (commandes || []).filter(c => c.statut === "livree");
      const caTotal = livrees.reduce((s, c) => s + (c.total_commande || 0), 0);
      setStats({
        boutiques: (partenaires || []).length,
        boutiquesActives: actifs,
        produits: (produits || []).length,
        commandes: (commandes || []).length,
        commandesLivrees: livrees.length,
        caTotal,
      });
    };
    load();
  }, []);

  if (!stats) return <div className="flex justify-center py-8"><div className="w-6 h-6 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;

  const CARDS = [
    { label: "Boutiques", value: stats.boutiques, sub: `${stats.boutiquesActives} actives`, color: "text-primary", bg: "bg-primary/10" },
    { label: "Produits", value: stats.produits, sub: "référencés", color: "text-purple-600", bg: "bg-purple-50" },
    { label: "Commandes", value: stats.commandes, sub: `${stats.commandesLivrees} livrées`, color: "text-green-600", bg: "bg-green-50" },
    { label: "CA Total", value: `${Math.round(stats.caTotal / 1000)}K F`, sub: "commandes livrées", color: "text-amber-600", bg: "bg-amber-50" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {CARDS.map(c => (
        <Card key={c.label}>
          <CardContent className={`p-4 ${c.bg} rounded-xl`}>
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
            <p className="text-xs font-semibold text-foreground">{c.label}</p>
            <p className="text-[10px] text-muted-foreground">{c.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Page principale Mall ───────────────────────────────────────────────────
export default function Mall() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.auth.me().then(u => { setUser(u); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  const isAdmin = user?.role === "admin";

  if (isAdmin) {
    return (
      <div className="space-y-4 pb-20">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Store className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">CDL Mall</h1>
            <p className="text-xs text-muted-foreground">Administration — Contrôle total</p>
          </div>
          <span className="ml-auto text-[10px] px-2 py-1 rounded-full bg-red-100 text-red-700 font-bold">Admin</span>
        </div>

        <Tabs defaultValue="boutiques">
          <TabsList className="w-full grid grid-cols-4 text-[10px]">
            <TabsTrigger value="boutiques">Boutiques</TabsTrigger>
            <TabsTrigger value="produits">Produits</TabsTrigger>
            <TabsTrigger value="commandes">Commandes</TabsTrigger>
            <TabsTrigger value="stats">Stats</TabsTrigger>
          </TabsList>
          <TabsContent value="boutiques" className="mt-4"><MallBoutiques isAdmin={true} /></TabsContent>
          <TabsContent value="produits" className="mt-4"><AdminProduits /></TabsContent>
          <TabsContent value="commandes" className="mt-4"><AdminCommandes /></TabsContent>
          <TabsContent value="stats" className="mt-4"><AdminStats /></TabsContent>
        </Tabs>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Store className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">CDL Mall</h1>
          <p className="text-xs text-muted-foreground">Boutiques & livraisons</p>
        </div>
      </div>
      <Tabs defaultValue="boutiques">
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="boutiques"><Store className="h-3.5 w-3.5 mr-1.5" />Boutiques</TabsTrigger>
          <TabsTrigger value="commandes"><ShoppingBag className="h-3.5 w-3.5 mr-1.5" />Mes commandes</TabsTrigger>
        </TabsList>
        <TabsContent value="boutiques" className="mt-4"><MallBoutiques isAdmin={false} /></TabsContent>
        <TabsContent value="commandes" className="mt-4"><MesCommandesMall userEmail={user?.email} /></TabsContent>
      </Tabs>
    </div>
  );
}