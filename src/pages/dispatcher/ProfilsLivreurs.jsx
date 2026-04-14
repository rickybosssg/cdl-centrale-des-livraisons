/**
 * CDL — Page unique Livreurs (fusion Base Livreurs + Gérer Livreurs)
 * Source : User + UserProfile(type=livreur)
 * Règle dispatch : profil_valide + driver_online (SANS current_role)
 */
import { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { isDriverDispatchable, getDriverDispatchReason } from "@/lib/dispatch";
import { ArrowLeft, Search, RefreshCw, Phone, CheckCircle2, XCircle, Zap, MapPin, Star, Users, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import moment from "moment";

const TABS = [
  { key: "tous",       label: "Tous" },
  { key: "en_ligne",   label: "En ligne" },
  { key: "valides",    label: "Validés" },
  { key: "en_attente", label: "En attente" },
  { key: "bloques",    label: "Bloqués" },
  { key: "hors_ligne", label: "Hors ligne" },
];

function StatPill({ label, value, color }) {
  return (
    <div className={`text-center px-3 py-2 rounded-xl border ${color}`}>
      <p className="text-lg font-extrabold leading-none">{value}</p>
      <p className="text-[10px] mt-0.5 leading-tight">{label}</p>
    </div>
  );
}

function DispatchBadge({ driver }) {
  const ok = isDriverDispatchable(driver);
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${ok ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
      {ok ? "⚡ Dispatch" : getDriverDispatchReason(driver)}
    </span>
  );
}

export default function ProfilsLivreurs() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("tous");
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  const load = useCallback(async () => {
    const [usersRes, profilesRes] = await Promise.allSettled([
      base44.entities.User.list("-updated_date", 500),
      base44.entities.UserProfile.filter({ profile_type: "livreur", deleted: false }),
    ]);
    if (usersRes.status === "fulfilled") setUsers(usersRes.value || []);
    if (profilesRes.status === "fulfilled") setProfiles(profilesRes.value || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const unsub = base44.entities.User.subscribe(ev => {
      if (ev.type === "update") setUsers(p => p.map(u => u.id === ev.id ? ev.data : u));
      if (ev.type === "create") setUsers(p => [ev.data, ...p]);
    });
    const unsubP = base44.entities.UserProfile.subscribe(ev => {
      if (ev.data?.profile_type !== "livreur") return;
      if (ev.type === "update") setProfiles(p => p.map(pr => pr.id === ev.id ? ev.data : pr));
      if (ev.type === "create" && !ev.data?.deleted) setProfiles(p => [ev.data, ...p]);
    });
    return () => { unsub(); unsubP(); };
  }, []);

  // Construire la liste : un user par email livreur
  const livreurEmails = new Set(profiles.map(p => p.user_email));
  const livreurs = users.filter(u => livreurEmails.has(u.email));

  // Stats
  const enLigne       = livreurs.filter(l => l.driver_online);
  const valides       = profiles.filter(p => p.status === "actif");
  const enAttente     = profiles.filter(p => p.status === "en_attente");
  const bloques       = profiles.filter(p => ["bloque","suspendu"].includes(p.status));
  const dispatchables = livreurs.filter(l => isDriverDispatchable(l));

  // Filtres
  const filtered = livreurs.filter(l => {
    const q = search.toLowerCase();
    const matchSearch = !search ||
      l.full_name?.toLowerCase().includes(q) ||
      l.email?.toLowerCase().includes(q) ||
      l.telephone?.includes(q) ||
      l.quartier?.toLowerCase().includes(q);

    const profile = profiles.find(p => p.user_email === l.email);
    let matchTab = true;
    if (tab === "en_ligne")   matchTab = l.driver_online === true;
    if (tab === "hors_ligne") matchTab = !l.driver_online;
    if (tab === "valides")    matchTab = profile?.status === "actif";
    if (tab === "en_attente") matchTab = profile?.status === "en_attente";
    if (tab === "bloques")    matchTab = ["bloque","suspendu"].includes(profile?.status);

    return matchSearch && matchTab;
  });

  const handleBlock = async (user, block) => {
    setActionLoading(user.id);
    const profile = profiles.find(p => p.user_email === user.email);
    if (profile) {
      await base44.entities.UserProfile.update(profile.id, { status: block ? "bloque" : "actif" });
      setProfiles(p => p.map(pr => pr.id === profile.id ? { ...pr, status: block ? "bloque" : "actif" } : pr));
    }
    await base44.entities.User.update(user.id, { livreur_bloque: block });
    setUsers(p => p.map(u => u.id === user.id ? { ...u, livreur_bloque: block } : u));
    toast.success(block ? "Livreur bloqué" : "Livreur débloqué");
    setActionLoading(null);
  };

  const handleValidate = async (user) => {
    setActionLoading(user.id);
    const profile = profiles.find(p => p.user_email === user.email);
    if (profile) {
      await base44.entities.UserProfile.update(profile.id, { status: "actif", validated_at: new Date().toISOString() });
      setProfiles(p => p.map(pr => pr.id === profile.id ? { ...pr, status: "actif" } : pr));
    }
    await base44.entities.User.update(user.id, { profil_valide: true });
    setUsers(p => p.map(u => u.id === user.id ? { ...u, profil_valide: true } : u));
    toast.success("Profil validé ✅");
    setActionLoading(null);
  };

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/profils")}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Livreurs</h1>
          <p className="text-xs text-muted-foreground">{livreurs.length} profils livreurs</p>
        </div>
        <Button variant="ghost" size="icon" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-1.5">
        <StatPill label="Total" value={livreurs.length} color="bg-blue-50 border-blue-200 text-blue-700" />
        <StatPill label="En ligne" value={enLigne.length} color="bg-green-50 border-green-200 text-green-700" />
        <StatPill label="Validés" value={valides.length} color="bg-cyan-50 border-cyan-200 text-cyan-700" />
        <StatPill label="Dispatch" value={dispatchables.length} color="bg-primary/10 border-primary/20 text-primary" />
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <StatPill label="En attente" value={enAttente.length} color="bg-amber-50 border-amber-200 text-amber-700" />
        <StatPill label="Bloqués" value={bloques.length} color="bg-red-50 border-red-200 text-red-700" />
        <StatPill label="Hors ligne" value={livreurs.length - enLigne.length} color="bg-gray-50 border-gray-200 text-gray-600" />
      </div>

      {/* Recherche */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Nom, email, téléphone, zone..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Onglets */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              tab === t.key ? "bg-primary text-white border-primary" : "bg-card border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Liste */}
      <p className="text-xs text-muted-foreground">{filtered.length} livreur(s) affiché(s)</p>
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">Aucun livreur trouvé</p>
        ) : (
          filtered.map(l => {
            const profile = profiles.find(p => p.user_email === l.email);
            const isBloque = l.livreur_bloque || profile?.status === "bloque";
            const isValide = l.profil_valide || profile?.status === "actif";
            const isOnline = l.driver_online;
            const isPending = profile?.status === "en_attente";
            return (
              <Card key={l.id} className={`border ${isOnline ? "border-l-4 border-l-green-400" : ""} ${isBloque ? "opacity-60" : ""}`}>
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <div className="relative flex-shrink-0">
                      <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-700 text-sm">
                        {l.full_name?.charAt(0) || "?"}
                      </div>
                      {isOnline && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 border-2 border-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-bold text-sm truncate">{l.full_name || l.email}</p>
                        {isValide && !isBloque && <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />}
                        {isBloque && <XCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap mt-0.5">
                        {l.quartier && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{l.quartier}</span>}
                        {l.telephone && <span className="text-[10px] text-muted-foreground">{l.telephone}</span>}
                        {l.note_moyenne > 0 && <span className="text-[10px] text-amber-600 flex items-center gap-0.5"><Star className="h-2.5 w-2.5" />{l.note_moyenne?.toFixed(1)}</span>}
                        {(l.nombre_courses_actives || 0) > 0 && <span className="text-[10px] text-primary font-medium">{l.nombre_courses_actives} actives</span>}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                          profile?.status === "actif" ? "bg-green-100 text-green-700" :
                          profile?.status === "en_attente" ? "bg-amber-100 text-amber-700" :
                          profile?.status === "bloque" ? "bg-red-100 text-red-700" :
                          "bg-gray-100 text-gray-600"
                        }`}>
                          {profile?.status || "—"}
                        </span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${isOnline ? "bg-green-100 text-green-700 font-bold" : "bg-gray-100 text-gray-500"}`}>
                          {isOnline ? "En ligne" : "Hors ligne"}
                        </span>
                        <DispatchBadge driver={l} />
                      </div>
                    </div>
                  </div>
                  {/* Actions */}
                  <div className="flex gap-2 mt-2.5 flex-wrap">
                    <Link to={`/admin/profil/${l.id}`} className="flex-1">
                      <Button size="sm" variant="outline" className="w-full h-7 text-[11px]">Voir profil</Button>
                    </Link>
                    {l.telephone && (
                      <a href={`tel:${l.telephone}`}>
                        <Button size="sm" variant="outline" className="h-7 w-7 p-0"><Phone className="h-3 w-3" /></Button>
                      </a>
                    )}
                    {isPending && (
                      <Button size="sm" className="h-7 text-[11px] bg-green-600 hover:bg-green-700"
                        disabled={actionLoading === l.id}
                        onClick={() => handleValidate(l)}>
                        <CheckCircle2 className="h-3 w-3 mr-0.5" />Valider
                      </Button>
                    )}
                    {!isBloque ? (
                      <Button size="sm" variant="outline" className="h-7 text-[11px] border-red-300 text-red-600 hover:bg-red-50"
                        disabled={actionLoading === l.id}
                        onClick={() => handleBlock(l, true)}>
                        Bloquer
                      </Button>
                    ) : (
                      <Button size="sm" className="h-7 text-[11px]"
                        disabled={actionLoading === l.id}
                        onClick={() => handleBlock(l, false)}>
                        Débloquer
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}