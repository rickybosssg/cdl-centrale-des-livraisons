/**
 * CDL — Page unique Clients
 * Source : User + UserProfile(type=client)
 */
import { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Search, RefreshCw, Phone, XCircle, CheckCircle2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

const TABS = [
  { key: "tous",       label: "Tous" },
  { key: "actifs",     label: "Actifs" },
  { key: "en_attente", label: "En attente" },
  { key: "bloques",    label: "Bloqués" },
];

export default function ProfilsClients() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("tous");
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [usersRes, profilesRes] = await Promise.allSettled([
      base44.entities.User.list("-updated_date", 500),
      base44.entities.UserProfile.filter({ profile_type: "client", deleted: false }),
    ]);
    if (usersRes.status === "fulfilled") setUsers(usersRes.value || []);
    if (profilesRes.status === "fulfilled") setProfiles(profilesRes.value || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, []);

  const clientEmails = new Set(profiles.map(p => p.user_email));
  const clients = users.filter(u => clientEmails.has(u.email));

  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !search || c.full_name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.telephone?.includes(q);
    const profile = profiles.find(p => p.user_email === c.email);
    let matchTab = true;
    if (tab === "actifs")     matchTab = profile?.status === "actif";
    if (tab === "en_attente") matchTab = profile?.status === "en_attente";
    if (tab === "bloques")    matchTab = ["bloque","suspendu"].includes(profile?.status);
    return matchSearch && matchTab;
  });

  const handleBlock = async (user, block) => {
    const profile = profiles.find(p => p.user_email === user.email);
    if (profile) {
      await base44.entities.UserProfile.update(profile.id, { status: block ? "bloque" : "actif" });
      setProfiles(p => p.map(pr => pr.id === profile.id ? { ...pr, status: block ? "bloque" : "actif" } : pr));
    }
    toast.success(block ? "Client bloqué" : "Client débloqué");
  };

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;

  const actifs    = profiles.filter(p => p.status === "actif").length;
  const enAttente = profiles.filter(p => p.status === "en_attente").length;
  const bloques   = profiles.filter(p => ["bloque","suspendu"].includes(p.status)).length;

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/profils")}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Clients</h1>
          <p className="text-xs text-muted-foreground">{clients.length} profils clients</p>
        </div>
        <Button variant="ghost" size="icon" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      <div className="grid grid-cols-4 gap-1.5 text-center">
        {[
          { label: "Total", value: clients.length, cls: "bg-orange-50 border-orange-200 text-orange-700" },
          { label: "Actifs", value: actifs, cls: "bg-green-50 border-green-200 text-green-700" },
          { label: "En attente", value: enAttente, cls: "bg-amber-50 border-amber-200 text-amber-700" },
          { label: "Bloqués", value: bloques, cls: "bg-red-50 border-red-200 text-red-700" },
        ].map(s => (
          <div key={s.label} className={`px-2 py-2 rounded-xl border ${s.cls}`}>
            <p className="text-lg font-extrabold leading-none">{s.value}</p>
            <p className="text-[10px] mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Nom, email, téléphone..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${tab === t.key ? "bg-primary text-white border-primary" : "bg-card border-border text-muted-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} client(s)</p>
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">Aucun client trouvé</p>
        ) : (
          filtered.map(c => {
            const profile = profiles.find(p => p.user_email === c.email);
            const isBloque = ["bloque","suspendu"].includes(profile?.status);
            return (
              <Card key={c.id} className={isBloque ? "opacity-60" : ""}>
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center font-bold text-orange-700 text-sm flex-shrink-0">
                      {c.full_name?.charAt(0) || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">{c.full_name || c.email}</p>
                      <p className="text-[10px] text-muted-foreground">{c.email}</p>
                      {c.telephone && <p className="text-[10px] text-muted-foreground">{c.telephone}</p>}
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full inline-block mt-1 ${
                        profile?.status === "actif" ? "bg-green-100 text-green-700" :
                        profile?.status === "en_attente" ? "bg-amber-100 text-amber-700" :
                        isBloque ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"
                      }`}>{profile?.status || "—"}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <Link to={`/admin/profil/${c.id}`} className="flex-1">
                      <Button size="sm" variant="outline" className="w-full h-7 text-[11px]">Voir profil</Button>
                    </Link>
                    {c.telephone && <a href={`tel:${c.telephone}`}><Button size="sm" variant="outline" className="h-7 w-7 p-0"><Phone className="h-3 w-3" /></Button></a>}
                    {!isBloque ? (
                      <Button size="sm" variant="outline" className="h-7 text-[11px] border-red-300 text-red-600" onClick={() => handleBlock(c, true)}>Bloquer</Button>
                    ) : (
                      <Button size="sm" className="h-7 text-[11px]" onClick={() => handleBlock(c, false)}>Débloquer</Button>
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