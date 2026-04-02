import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Search, Phone, MessageCircle, RefreshCw, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import FicheProfilAdmin from "@/components/FicheProfilAdmin";
import moment from "moment";

const TABS = [
  { key: "client", label: "👤 Clients", color: "border-blue-500 text-blue-600" },
  { key: "livreur", label: "🛵 Livreurs", color: "border-green-500 text-green-600" },
  { key: "partenaire", label: "🏪 Partenaires", color: "border-purple-500 text-purple-600" },
  { key: "commercial", label: "💼 Commerciaux", color: "border-amber-500 text-amber-600" },
];

const FILTERS = ["Tous", "Validés", "En attente", "Bloqués", "Refusés"];

function getStatut(type, item) {
  if (type === "client") return item.statut_client || "Actif";
  if (type === "livreur") return item.statut_validation_livreur || "en_attente";
  if (type === "partenaire") return item.statut || "en_attente";
  if (type === "commercial") return item.statut_validation_commercial || "en_attente";
  return "—";
}

function matchFilter(filter, type, item) {
  if (filter === "Tous") return true;
  const s = getStatut(type, item).toLowerCase();
  if (filter === "Validés") return s === "valide" || s === "actif";
  if (filter === "En attente") return s === "en_attente";
  if (filter === "Bloqués") return s === "suspendu" || s === "bloqué" || item.livreur_bloque || item.suspended;
  if (filter === "Refusés") return s === "refuse";
  return true;
}

const STATUT_COLORS = {
  "valide": "bg-green-100 text-green-700", "actif": "bg-green-100 text-green-700",
  "Actif": "bg-green-100 text-green-700", "Fidèle": "bg-blue-100 text-blue-700",
  "VIP": "bg-amber-100 text-amber-700",
  "en_attente": "bg-amber-100 text-amber-700",
  "refuse": "bg-red-100 text-red-700", "suspendu": "bg-red-100 text-red-700",
  "Bloqué": "bg-red-100 text-red-700", "Inactif": "bg-orange-100 text-orange-700",
  "Nouveau": "bg-gray-100 text-gray-700",
};

export default function ProfilsAdmin() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("client");
  const [filter, setFilter] = useState("Tous");
  const [search, setSearch] = useState("");
  const [data, setData] = useState({ client: [], livreur: [], partenaire: [], commercial: [] });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [codePromos, setCodePromos] = useState([]);

  const load = async () => {
    setLoading(true);
    const [clients, livreurs, partenaires, commerciaux, codes] = await Promise.allSettled([
      base44.entities.Client.list("-created_date", 500),
      base44.entities.User.filter({ user_type: "livreur" }),
      base44.entities.Partenaire.filter({ deleted: false }),
      base44.entities.User.filter({ user_type: "commercial" }),
      base44.entities.CodePromo.list("-created_date", 500),
    ]).then(r => r.map(x => x.status === "fulfilled" ? x.value : []));

    setData({ client: clients, livreur: livreurs, partenaire: partenaires, commercial: commerciaux });
    setCodePromos(codes);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const getCodePromo = (email) => codePromos.find(c => c.commercial_email === email);

  const items = (data[activeTab] || []).filter(item => {
    const q = search.toLowerCase();
    const nom = item.nom_complet || item.full_name || item.nom_responsable || item.nom_commerce || "";
    const tel = item.telephone || item.numero_telephone || "";
    const act = item.nom_commerce || "";
    const cp = activeTab === "commercial" ? (getCodePromo(item.email || item.user_email)?.code || "") : "";
    const matchSearch = !q || nom.toLowerCase().includes(q) || tel.includes(q) ||
      act.toLowerCase().includes(q) || cp.toLowerCase().includes(q) ||
      (item.email || "").toLowerCase().includes(q);
    return matchSearch && matchFilter(filter, activeTab, item);
  });

  const stats = TABS.reduce((acc, t) => {
    acc[t.key] = data[t.key].length;
    return acc;
  }, {});

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 sticky top-0 bg-background/95 backdrop-blur z-10 py-2 border-b">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Centre de contrôle profils</h1>
          <p className="text-xs text-muted-foreground">Visibilité complète CDL</p>
        </div>
        <Button variant="outline" size="icon" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Compteurs globaux */}
      <div className="grid grid-cols-4 gap-2">
        {TABS.map(t => (
          <button key={t.key} onClick={() => { setActiveTab(t.key); setFilter("Tous"); setSearch(""); }}
            className={`p-2 rounded-xl border-2 text-center transition-all ${activeTab === t.key ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
            <p className="text-lg font-bold text-primary">{stats[t.key]}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">{t.label}</p>
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => { setActiveTab(t.key); setFilter("Tous"); setSearch(""); }}
            className={`whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t.key ? t.color + " border-b-2" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Recherche */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder={
          activeTab === "partenaire" ? "Nom activité, téléphone..." :
          activeTab === "commercial" ? "Nom, téléphone, code promo..." :
          "Nom, téléphone, e-mail..."
        } value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Filtres */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              filter === f ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground"
            }`}>
            {f}
          </button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">{items.length} résultat(s)</p>

      {/* Liste */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => {
            const email = item.email || item.user_email;
            const nom = item.nom_complet || item.full_name || item.nom_responsable || "—";
            const tel = item.telephone || item.numero_telephone;
            const statut = getStatut(activeTab, item);
            const statutColor = STATUT_COLORS[statut] || "bg-gray-100 text-gray-600";
            const cp = activeTab === "commercial" ? getCodePromo(email) : null;

            return (
              <Card key={item.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary flex-shrink-0">
                      {(nom).charAt(0).toUpperCase()}
                    </div>

                    {/* Infos */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-semibold text-sm">{nom}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statutColor}`}>{statut}</span>
                      </div>

                      {activeTab === "partenaire" && item.nom_commerce && (
                        <p className="text-xs font-medium text-primary">{item.nom_commerce} · {item.type_commerce}</p>
                      )}
                      <p className="text-xs text-muted-foreground">{tel || "—"} {email ? `· ${email}` : ""}</p>

                      {activeTab === "client" && (
                        <p className="text-xs text-muted-foreground">{item.nombre_total_courses || 0} courses · {(item.total_depense || 0).toLocaleString()} F</p>
                      )}
                      {activeTab === "livreur" && (
                        <p className="text-xs text-muted-foreground">{item.quartier || "—"}</p>
                      )}
                      {activeTab === "partenaire" && (
                        <p className={`text-xs font-medium ${item.statut_abonnement === 'Actif' ? 'text-green-600' : 'text-red-500'}`}>
                          Abonnement : {item.statut_abonnement || "—"}
                          {item.date_expiration_abonnement && ` (exp. ${moment(item.date_expiration_abonnement).format("DD/MM/YY")})`}
                        </p>
                      )}
                      {activeTab === "commercial" && cp && (
                        <p className="text-xs font-mono text-primary font-bold">{cp.code} · {cp.nombre_utilisations || 0} utilisations</p>
                      )}
                    </div>

                    {/* Actions rapides */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {tel && (
                        <a href={`https://wa.me/${tel.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer">
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600">
                            <MessageCircle className="h-4 w-4" />
                          </Button>
                        </a>
                      )}
                      {tel && (
                        <a href={`tel:${tel}`}>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600">
                            <Phone className="h-4 w-4" />
                          </Button>
                        </a>
                      )}
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setSelected({ type: activeTab, data: item })}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {items.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">Aucun résultat</p>
            </div>
          )}
        </div>
      )}

      {/* Fiche détail */}
      {selected && (
        <FicheProfilAdmin
          type={selected.type}
          data={selected.data}
          onClose={() => setSelected(null)}
          onUpdated={() => { load(); setSelected(null); }}
        />
      )}
    </div>
  );
}