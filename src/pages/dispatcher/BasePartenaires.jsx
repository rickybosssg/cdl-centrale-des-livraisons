import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Search, Store, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import moment from "moment";

const STATUT_CONFIG = {
  "en_attente": { color: "bg-amber-100 text-amber-700" },
  "actif": { color: "bg-green-100 text-green-700" },
  "suspendu": { color: "bg-red-100 text-red-700" },
};

export default function BasePartenaires() {
  const navigate = useNavigate();
  const [partenaires, setPartenaires] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedPartenaire, setSelectedPartenaire] = useState(null);

  const loadPartenaires = async () => {
    setLoading(true);
    const users = await base44.entities.User.filter({ user_type: "partenaire" });
    const profiles = await base44.entities.Partenaire.list("-created_date", 500);
    
    // Combiner User partenaire avec profil Partenaire
    const combined = users.map(u => {
      const profile = profiles.find(p => p.user_email === u.email);
      return { ...u, ...profile };
    });
    
    setPartenaires(combined.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
    setLoading(false);
  };

  useEffect(() => { loadPartenaires(); }, []);

  const filtered = partenaires.filter(p => {
    const q = search.toLowerCase();
    return !q || p.full_name?.toLowerCase().includes(q) || p.nom_commerce?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q);
  });

  const stats = {
    total: partenaires.length,
    actifs: partenaires.filter(p => p.ouvert || p.statut === "actif").length,
    attente: partenaires.filter(p => p.statut === "en_attente").length,
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4 pb-3 border-b">
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center text-white font-bold">CDL</div>
          <div>
            <p className="font-bold text-lg">CDL APP</p>
            <p className="text-[10px] text-muted-foreground">Centrale des Livraisons</p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold flex-1">Base partenaires</h1>
        <Button variant="outline" size="icon" onClick={loadPartenaires}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Card className="text-center"><CardContent className="p-3"><p className="text-2xl font-bold text-primary">{stats.total}</p><p className="text-[10px] text-muted-foreground">Total</p></CardContent></Card>
        <Card className="text-center"><CardContent className="p-3"><p className="text-2xl font-bold text-green-600">{stats.actifs}</p><p className="text-[10px] text-muted-foreground">Actifs</p></CardContent></Card>
        <Card className="text-center"><CardContent className="p-3"><p className="text-2xl font-bold text-amber-600">{stats.attente}</p><p className="text-[10px] text-muted-foreground">En attente</p></CardContent></Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Rechercher par nom, commerce..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} partenaire(s)</p>
      <div className="space-y-2">
        {filtered.map(partenaire => {
          const statut = partenaire.statut || "en_attente";
          const cfg = STATUT_CONFIG[statut] || STATUT_CONFIG.en_attente;
          return (
            <Card key={partenaire.id} className="cursor-pointer hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm truncate">{partenaire.nom_commerce || partenaire.full_name}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>{statut}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{partenaire.type_commerce || "—"}</p>
                    <p className="text-xs text-muted-foreground">{partenaire.quartier || "—"}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-primary">{(partenaire.nombre_vues || 0).toLocaleString()} vues</p>
                    <p className="text-[10px] text-muted-foreground">{moment(partenaire.created_date).fromNow()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && <div className="text-center py-12"><Store className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" /><p className="text-sm text-muted-foreground">Aucun partenaire trouvé</p></div>}
      </div>
    </div>
  );
}