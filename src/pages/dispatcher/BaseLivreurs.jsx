import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Search, Truck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import FicheLivreur from "../../components/FicheLivreur";
import moment from "moment";

const STATUT_CONFIG = {
  "en_attente": { color: "bg-amber-100 text-amber-700" },
  "valide": { color: "bg-green-100 text-green-700" },
  "refuse": { color: "bg-red-100 text-red-700" },
};

export default function BaseLivreurs() {
  const navigate = useNavigate();
  const [livreurs, setLivreurs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedLivreur, setSelectedLivreur] = useState(null);

  const loadLivreurs = async () => {
    setLoading(true);
    const data = await base44.entities.User.filter({ user_type: "livreur" });
    setLivreurs(data.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
    setLoading(false);
  };

  useEffect(() => { loadLivreurs(); }, []);

  const filtered = livreurs.filter(l => {
    const q = search.toLowerCase();
    return !q || l.full_name?.toLowerCase().includes(q) || l.telephone?.includes(q) || l.email?.toLowerCase().includes(q);
  });

  const stats = {
    total: livreurs.length,
    valides: livreurs.filter(l => l.statut_validation_livreur === "valide").length,
    attente: livreurs.filter(l => !l.statut_validation_livreur || l.statut_validation_livreur === "en_attente").length,
    actifs: livreurs.filter(l => l.disponible).length,
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
        <h1 className="text-xl font-bold flex-1">Base livreurs</h1>
        <Button variant="outline" size="icon" onClick={loadLivreurs}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <Card className="text-center"><CardContent className="p-3"><p className="text-2xl font-bold text-primary">{stats.total}</p><p className="text-[10px] text-muted-foreground">Total</p></CardContent></Card>
        <Card className="text-center"><CardContent className="p-3"><p className="text-2xl font-bold text-green-600">{stats.valides}</p><p className="text-[10px] text-muted-foreground">Validés</p></CardContent></Card>
        <Card className="text-center"><CardContent className="p-3"><p className="text-2xl font-bold text-amber-600">{stats.attente}</p><p className="text-[10px] text-muted-foreground">En attente</p></CardContent></Card>
        <Card className="text-center"><CardContent className="p-3"><p className="text-2xl font-bold text-blue-600">{stats.actifs}</p><p className="text-[10px] text-muted-foreground">Actifs</p></CardContent></Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Rechercher par nom, téléphone..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} livreur(s)</p>
      <div className="space-y-2">
        {filtered.map(livreur => {
          const statut = livreur.statut_validation_livreur || "en_attente";
          const cfg = STATUT_CONFIG[statut] || STATUT_CONFIG.en_attente;
          return (
            <Card key={livreur.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedLivreur(livreur)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm truncate">{livreur.full_name}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>{statut === "en_attente" ? "En attente" : statut === "valide" ? "Validé" : "Refusé"}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{livreur.telephone}</p>
                    <p className="text-xs text-muted-foreground">{livreur.quartier || "—"}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-xs font-medium ${livreur.disponible ? "text-green-600" : "text-gray-500"}`}>{livreur.disponible ? "🟢 Actif" : "⚪ Inactif"}</p>
                    <p className="text-[10px] text-muted-foreground">{moment(livreur.created_date).fromNow()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && <div className="text-center py-12"><Truck className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" /><p className="text-sm text-muted-foreground">Aucun livreur trouvé</p></div>}
      </div>

      {selectedLivreur && (
        <FicheLivreur livreur={selectedLivreur} onClose={() => setSelectedLivreur(null)} onUpdated={(updated) => { setLivreurs(prev => prev.map(l => l.id === updated.id ? updated : l)); setSelectedLivreur(updated); }} />
      )}
    </div>
  );
}