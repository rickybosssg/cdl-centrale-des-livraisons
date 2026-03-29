import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Search, Users, Star, TrendingUp, UserX, UserCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import FicheClient from "../../components/FicheClient";
import moment from "moment";

const STATUT_CONFIG = {
  Nouveau: { color: "bg-gray-100 text-gray-700 border-gray-200" },
  Actif: { color: "bg-green-100 text-green-700 border-green-200" },
  Fidèle: { color: "bg-blue-100 text-blue-700 border-blue-200" },
  VIP: { color: "bg-amber-100 text-amber-700 border-amber-200" },
  Inactif: { color: "bg-orange-100 text-orange-700 border-orange-200" },
  Bloqué: { color: "bg-red-100 text-red-700 border-red-200" },
};

const SORT_OPTIONS = [
  { value: "date_derniere_course", label: "Dernière course" },
  { value: "nombre_total_courses", label: "Nb courses" },
  { value: "total_depense", label: "Total dépensé" },
  { value: "date_inscription", label: "Date inscription" },
  { value: "date_inscription", label: "Plus récent" },
];

export default function BaseClients() {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatut, setFilterStatut] = useState("Tous");
  const [sortBy, setSortBy] = useState("date_derniere_course");
  const [selectedClient, setSelectedClient] = useState(null);

  const loadClients = async () => {
    setLoading(true);
    const [clientsEntity, allUsers] = await Promise.all([
      base44.entities.Client.list("-date_derniere_course", 500),
      base44.entities.User.list("-created_date", 1000),
    ]);
    // Combiner et dédupliquer par email
    const emailSet = new Set();
    const combined = [];
    clientsEntity.forEach(c => {
      if (!emailSet.has(c.email)) {
        emailSet.add(c.email);
        combined.push(c);
      }
    });
    allUsers.forEach(u => {
      if (!emailSet.has(u.email) && (u.user_type === "client" || u.role === "user")) {
        emailSet.add(u.email);
        combined.push({
          id: u.id,
          nom_complet: u.full_name,
          numero_telephone: u.telephone,
          email: u.email,
          quartier_principal: u.quartier,
          statut_client: "Actif",
          nombre_total_courses: 0,
          total_depense: 0,
          date_inscription: u.created_date,
          date_derniere_course: null,
          source: "user",
        });
      }
    });
    setClients(combined.sort((a, b) => new Date(b.date_derniere_course || b.date_inscription || 0) - new Date(a.date_derniere_course || a.date_inscription || 0)));
    setLoading(false);
  };

  useEffect(() => { loadClients(); }, []);

  const filtered = clients
    .filter(c => {
      const q = search.toLowerCase();
      const matchSearch = !q ||
        (c.nom_complet || "").toLowerCase().includes(q) ||
        (c.numero_telephone || "").includes(q) ||
        (c.email || "").toLowerCase().includes(q);
      const matchStatut = filterStatut === "Tous" || c.statut_client === filterStatut;
      return matchSearch && matchStatut;
    })
    .sort((a, b) => {
      if (sortBy === "date_derniere_course" || sortBy === "date_inscription") {
        return new Date(b[sortBy] || 0) - new Date(a[sortBy] || 0);
      }
      return (b[sortBy] || 0) - (a[sortBy] || 0);
    });

  // Stats
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const stats = {
    total: clients.length,
    nouveaux: clients.filter(c => new Date(c.date_inscription) >= startOfMonth).length,
    actifs: clients.filter(c => c.statut_client === "Actif").length,
    fideles: clients.filter(c => c.statut_client === "Fidèle").length,
    vip: clients.filter(c => c.statut_client === "VIP").length,
    inactifs: clients.filter(c => c.statut_client === "Inactif").length,
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold flex-1">Base clients</h1>
        <Button variant="outline" size="icon" onClick={loadClients}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="text-center">
          <CardContent className="p-3">
            <p className="text-2xl font-bold text-primary">{stats.total}</p>
            <p className="text-[10px] text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="p-3">
            <p className="text-2xl font-bold text-green-600">{stats.nouveaux}</p>
            <p className="text-[10px] text-muted-foreground">Ce mois</p>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="p-3">
            <p className="text-2xl font-bold text-amber-600">{stats.vip}</p>
            <p className="text-[10px] text-muted-foreground">VIP</p>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="p-3">
            <p className="text-xl font-bold text-blue-600">{stats.fideles}</p>
            <p className="text-[10px] text-muted-foreground">Fidèles</p>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="p-3">
            <p className="text-xl font-bold">{stats.actifs}</p>
            <p className="text-[10px] text-muted-foreground">Actifs</p>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="p-3">
            <p className="text-xl font-bold text-gray-500">{stats.inactifs}</p>
            <p className="text-[10px] text-muted-foreground">Inactifs</p>
          </CardContent>
        </Card>
      </div>

      {/* Recherche */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Rechercher par nom, téléphone..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Filtres statut */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {["Tous", "Nouveau", "Actif", "Fidèle", "VIP", "Inactif", "Bloqué"].map(s => (
          <button
            key={s}
            onClick={() => setFilterStatut(s)}
            className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              filterStatut === s ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Tri */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {SORT_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setSortBy(opt.value)}
            className={`whitespace-nowrap px-3 py-1 rounded-full text-xs border transition-colors ${
              sortBy === opt.value ? "bg-secondary text-secondary-foreground border-secondary" : "bg-background border-border text-muted-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Liste */}
      <p className="text-xs text-muted-foreground">{filtered.length} client(s)</p>
      <div className="space-y-2">
        {filtered.map(client => {
          const cfg = STATUT_CONFIG[client.statut_client] || STATUT_CONFIG.Actif;
          return (
            <Card
              key={client.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setSelectedClient(client)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm truncate">{client.nom_complet || "—"}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${cfg.color}`}>
                        {client.statut_client || "Actif"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{client.numero_telephone}</p>
                    {client.quartier_principal && (
                      <p className="text-xs text-muted-foreground">{client.quartier_principal}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-primary">{(client.nombre_total_courses || 0)} courses</p>
                    <p className="text-xs text-muted-foreground">{(client.total_depense || 0).toLocaleString()} FCFA</p>
                    {client.date_derniere_course && (
                      <p className="text-[10px] text-muted-foreground">{moment(client.date_derniere_course).fromNow()}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center py-12">
            <Users className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Aucun client trouvé</p>
          </div>
        )}
      </div>

      {/* Fiche client */}
      {selectedClient && (
        <FicheClient
          client={selectedClient}
          source={selectedClient.source || "client"}
          onClose={() => setSelectedClient(null)}
          onUpdated={(updated) => {
            setClients(prev => prev.map(c => c.id === updated.id ? updated : c));
            setSelectedClient(updated);
          }}
        />
      )}
    </div>
  );
}