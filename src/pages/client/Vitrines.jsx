import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Search, MapPin, Phone, Store, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const TYPE_EMOJI = {
  Restaurant: "🍽️", Pharmacie: "💊", Boutique: "🛍️",
  Alimentation: "🥗", Boissons: "🥤", Vitrine: "✨"
};

const TYPES = ["Tous", "Restaurant", "Pharmacie", "Boutique", "Alimentation", "Boissons", "Vitrine"];

export default function Vitrines() {
  const [partenaires, setPartenaires] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("Tous");
  const [filterQuartier, setFilterQuartier] = useState("");

  const load = async () => {
    setLoading(true);
    const data = await base44.entities.Partenaire.filter({ statut: "actif" }, "-nombre_vues", 200);
    setPartenaires(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const quartiers = [...new Set(partenaires.map(p => p.quartier).filter(Boolean))].sort();

  const filtered = partenaires.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      (p.nom_commerce || "").toLowerCase().includes(q) ||
      (p.description || "").toLowerCase().includes(q) ||
      (p.type_activite || "").toLowerCase().includes(q);
    const matchType = filterType === "Tous" || p.type_commerce === filterType;
    const matchQ = !filterQuartier || p.quartier === filterQuartier;
    return matchSearch && matchType && matchQ;
  });

  const vitrines = filtered.filter(p => p.type_commerce === "Vitrine");
  const commerces = filtered.filter(p => p.type_commerce !== "Vitrine");

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Annuaire CDL</h1>
          <p className="text-xs text-muted-foreground">Commerces & Vitrines à Ouagadougou</p>
        </div>
        <Button variant="outline" size="icon" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {/* Recherche */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Rechercher une activité..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Filtre type */}
      <div className="grid grid-cols-3 gap-2">
        {TYPES.map(t => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={`flex flex-col items-center justify-center gap-1 p-3 rounded-xl border transition-all ${
              filterType === t
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-card border-border hover:bg-muted"
            }`}
          >
            <span className="text-2xl">{TYPE_EMOJI[t] || "🏪"}</span>
            <span className="text-xs font-medium leading-tight">{t}</span>
          </button>
        ))}
      </div>

      {/* Filtre quartier */}
      {quartiers.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <button
            onClick={() => setFilterQuartier("")}
            className={`whitespace-nowrap px-3 py-1 rounded-full text-xs border transition-colors ${
              !filterQuartier ? "bg-secondary text-secondary-foreground" : "bg-background border-border text-muted-foreground"
            }`}
          >
            📍 Tous quartiers
          </button>
          {quartiers.map(q => (
            <button
              key={q}
              onClick={() => setFilterQuartier(q === filterQuartier ? "" : q)}
              className={`whitespace-nowrap px-3 py-1 rounded-full text-xs border transition-colors ${
                filterQuartier === q ? "bg-secondary text-secondary-foreground" : "bg-background border-border text-muted-foreground"
              }`}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">{filtered.length} résultat(s)</p>

      {/* Section Vitrines */}
      {(filterType === "Tous" || filterType === "Vitrine") && vitrines.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-bold text-sm flex items-center gap-1.5">✨ Vitrines</h2>
          <div className="grid grid-cols-1 gap-3">
            {vitrines.map(p => (
              <VitrineCard key={p.id} p={p} />
            ))}
          </div>
        </div>
      )}

      {/* Section Commerces */}
      {commerces.length > 0 && (
        <div className="space-y-2">
          {(filterType === "Tous" || filterType === "Vitrine") && vitrines.length > 0 && (
            <h2 className="font-bold text-sm flex items-center gap-1.5">🏪 Commerces</h2>
          )}
          <div className="grid grid-cols-2 gap-2">
            {commerces.map(p => (
              <CommerceCard key={p.id} p={p} />
            ))}
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="text-center py-16 space-y-2">
          <Store className="h-10 w-10 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">Aucun résultat</p>
        </div>
      )}
    </div>
  );
}

function VitrineCard({ p }) {
  return (
    <Link to={`/commerce/${p.id}`}>
      <Card className="hover:shadow-md transition-shadow overflow-hidden">
        <CardContent className="p-0">
          <div className="flex">
            <div className="w-24 h-24 flex-shrink-0 bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center overflow-hidden">
              {p.photo_principale
                ? <img src={p.photo_principale} alt={p.nom_commerce} className="w-full h-full object-cover" />
                : <span className="text-4xl">✨</span>
              }
            </div>
            <div className="flex-1 p-3 min-w-0">
              <div className="flex items-start justify-between gap-1">
                <p className="font-bold text-sm truncate">{p.nom_commerce}</p>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium ${p.ouvert ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                  {p.ouvert ? "Actif" : "Inactif"}
                </span>
              </div>
              {p.type_activite && <p className="text-xs text-primary font-medium">{p.type_activite}</p>}
              {p.description && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{p.description}</p>}
              <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                {p.quartier && <span className="flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{p.quartier}</span>}
                {p.telephone && <span className="flex items-center gap-0.5"><Phone className="h-2.5 w-2.5" />{p.telephone}</span>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function CommerceCard({ p }) {
  return (
    <Link to={`/commerce/${p.id}`}>
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-3">
          <div className="h-20 rounded-xl overflow-hidden mb-2 bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center">
            {p.photo_principale
              ? <img src={p.photo_principale} alt={p.nom_commerce} className="w-full h-full object-cover" />
              : <span className="text-4xl">{TYPE_EMOJI[p.type_commerce] || "🏪"}</span>
            }
          </div>
          <p className="font-semibold text-xs truncate">{p.nom_commerce}</p>
          <p className="text-[10px] text-muted-foreground">{TYPE_EMOJI[p.type_commerce]} {p.type_commerce}</p>
          {p.quartier && <p className="text-[10px] text-muted-foreground flex items-center gap-0.5 mt-0.5"><MapPin className="h-2.5 w-2.5" />{p.quartier}</p>}
          <div className="flex items-center gap-1 mt-1.5">
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${p.ouvert ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
              {p.ouvert ? "Ouvert" : "Fermé"}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}