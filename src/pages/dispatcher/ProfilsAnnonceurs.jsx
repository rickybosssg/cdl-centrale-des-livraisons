/**
 * CDL — Page unique Annonceurs
 */
import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Search, RefreshCw, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export default function ProfilsAnnonceurs() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [annonceurs, setAnnonceurs] = useState([]);
  const [pubs, setPubs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [aRes, pRes] = await Promise.allSettled([
        base44.entities.Annonceur.list("-created_date", 200),
        base44.entities.Publicite.filter({ deleted: false }),
      ]);
      if (aRes.status === "fulfilled") setAnnonceurs(aRes.value || []);
      if (pRes.status === "fulfilled") setPubs(pRes.value || []);
      setLoading(false);
    };
    load();
  }, []);

  const filtered = annonceurs.filter(a => {
    const q = search.toLowerCase();
    return !search || a.nom_entreprise?.toLowerCase().includes(q) || a.user_email?.toLowerCase().includes(q);
  });

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/profils")}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Annonceurs</h1>
          <p className="text-xs text-muted-foreground">{annonceurs.length} annonceurs</p>
        </div>
        <Button variant="ghost" size="icon" onClick={async () => { setLoading(true); const d = await base44.entities.Annonceur.list(); setAnnonceurs(d||[]); setLoading(false); }}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-1.5 text-center">
        <div className="px-2 py-2 rounded-xl border bg-pink-50 border-pink-200 text-pink-700">
          <p className="text-lg font-extrabold leading-none">{annonceurs.length}</p>
          <p className="text-[10px] mt-0.5">Annonceurs</p>
        </div>
        <div className="px-2 py-2 rounded-xl border bg-purple-50 border-purple-200 text-purple-700">
          <p className="text-lg font-extrabold leading-none">{pubs.filter(p => p.active).length}</p>
          <p className="text-[10px] mt-0.5">Pubs actives</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Nom entreprise, email..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">Aucun annonceur trouvé</p>
        ) : filtered.map(a => {
          const annonceurPubs = pubs.filter(p => p.created_by === a.user_email);
          return (
            <Card key={a.id}>
              <CardContent className="p-3">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl bg-pink-100 flex items-center justify-center flex-shrink-0">
                    <Megaphone className="h-5 w-5 text-pink-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{a.nom_entreprise || a.user_email}</p>
                    <p className="text-[10px] text-muted-foreground">{a.user_email}</p>
                    <div className="flex gap-2 mt-0.5 text-[10px] text-muted-foreground">
                      <span>📢 {annonceurPubs.length} pub(s)</span>
                      <span>· {annonceurPubs.filter(p => p.active).length} actives</span>
                    </div>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full inline-block mt-1 ${a.statut === "actif" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                      {a.statut || "—"}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 mt-2">
                  <Link to="/gerer-publicites" className="flex-1">
                    <Button size="sm" variant="outline" className="w-full h-7 text-[11px]">Voir publicités</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}