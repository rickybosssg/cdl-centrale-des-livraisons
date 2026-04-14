/**
 * CDL — Page unique Commerciaux
 */
import { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Search, RefreshCw, Phone, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export default function ProfilsCommerciaux() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [usersRes, profilesRes] = await Promise.allSettled([
      base44.entities.User.list("-updated_date", 500),
      base44.entities.UserProfile.filter({ profile_type: "commercial", deleted: false }),
    ]);
    if (usersRes.status === "fulfilled") setUsers(usersRes.value || []);
    if (profilesRes.status === "fulfilled") setProfiles(profilesRes.value || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, []);

  const emails = new Set(profiles.map(p => p.user_email));
  const commerciaux = users.filter(u => emails.has(u.email));

  const filtered = commerciaux.filter(c => {
    const q = search.toLowerCase();
    return !search || c.full_name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q);
  });

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/profils")}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Commerciaux</h1>
          <p className="text-xs text-muted-foreground">{commerciaux.length} commerciaux</p>
        </div>
        <Button variant="ghost" size="icon" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      <div className="grid grid-cols-3 gap-1.5 text-center">
        {[
          { label: "Total", value: commerciaux.length, cls: "bg-purple-50 border-purple-200 text-purple-700" },
          { label: "Actifs", value: profiles.filter(p => p.status === "actif").length, cls: "bg-green-50 border-green-200 text-green-700" },
          { label: "En attente", value: profiles.filter(p => p.status === "en_attente").length, cls: "bg-amber-50 border-amber-200 text-amber-700" },
        ].map(s => (
          <div key={s.label} className={`px-2 py-2 rounded-xl border ${s.cls}`}>
            <p className="text-lg font-extrabold leading-none">{s.value}</p>
            <p className="text-[10px] mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Nom, email..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">Aucun commercial trouvé</p>
        ) : filtered.map(c => {
          const profile = profiles.find(p => p.user_email === c.email);
          let data = {};
          try { data = profile?.data_json ? JSON.parse(profile.data_json) : {}; } catch (_) {}
          return (
            <Card key={c.id}>
              <CardContent className="p-3">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center font-bold text-purple-700 text-sm flex-shrink-0">
                    {c.full_name?.charAt(0) || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{c.full_name || c.email}</p>
                    <p className="text-[10px] text-muted-foreground">{c.email}</p>
                    {data.code_promo && <p className="text-[10px] font-mono font-bold text-purple-600 mt-0.5">Code : {data.code_promo}</p>}
                    <div className="flex gap-2 mt-0.5 text-[10px] text-muted-foreground">
                      {c.nombre_filleuls != null && <span>👥 {c.nombre_filleuls} filleuls</span>}
                    </div>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full inline-block mt-1 ${
                      profile?.status === "actif" ? "bg-green-100 text-green-700" :
                      profile?.status === "en_attente" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"
                    }`}>{profile?.status || "—"}</span>
                  </div>
                </div>
                <div className="flex gap-2 mt-2">
                  <Link to={`/admin/profil/${c.id}`} className="flex-1">
                    <Button size="sm" variant="outline" className="w-full h-7 text-[11px]">Voir profil</Button>
                  </Link>
                  {c.telephone && <a href={`tel:${c.telephone}`}><Button size="sm" variant="outline" className="h-7 w-7 p-0"><Phone className="h-3 w-3" /></Button></a>}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}