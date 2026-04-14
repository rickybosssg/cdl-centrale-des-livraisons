/**
 * CDL — Page unique Partenaires
 */
import { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Search, RefreshCw, Phone, Store, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

const TABS = [
  { key: "tous",       label: "Tous" },
  { key: "actif",      label: "Actifs" },
  { key: "en_attente", label: "En attente" },
  { key: "suspendu",   label: "Suspendus" },
];

export default function ProfilsPartenaires() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("tous");
  const [search, setSearch] = useState("");
  const [partenaires, setPartenaires] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await base44.entities.Partenaire.list("-created_date", 500);
    setPartenaires((data || []).filter(p => !p.deleted));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, []);

  const filtered = partenaires.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !search || p.nom_boutique?.toLowerCase().includes(q) || p.user_email?.toLowerCase().includes(q);
    let matchTab = true;
    if (tab !== "tous") matchTab = p.statut === tab;
    return matchSearch && matchTab;
  });

  const handleValidate = async (p) => {
    await base44.entities.Partenaire.update(p.id, { statut: "actif" });
    setPartenaires(prev => prev.map(x => x.id === p.id ? { ...x, statut: "actif" } : x));
    toast.success("Partenaire validé ✅");
  };
  const handleSuspend = async (p) => {
    await base44.entities.Partenaire.update(p.id, { statut: "suspendu" });
    setPartenaires(prev => prev.map(x => x.id === p.id ? { ...x, statut: "suspendu" } : x));
    toast.success("Partenaire suspendu");
  };

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/profils")}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Partenaires</h1>
          <p className="text-xs text-muted-foreground">{partenaires.length} partenaires</p>
        </div>
        <Button variant="ghost" size="icon" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      <div className="grid grid-cols-3 gap-1.5 text-center">
        {[
          { label: "Total", value: partenaires.length, cls: "bg-green-50 border-green-200 text-green-700" },
          { label: "Actifs", value: partenaires.filter(p => p.statut === "actif").length, cls: "bg-cyan-50 border-cyan-200 text-cyan-700" },
          { label: "En attente", value: partenaires.filter(p => p.statut === "en_attente").length, cls: "bg-amber-50 border-amber-200 text-amber-700" },
        ].map(s => (
          <div key={s.label} className={`px-2 py-2 rounded-xl border ${s.cls}`}>
            <p className="text-lg font-extrabold leading-none">{s.value}</p>
            <p className="text-[10px] mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Nom boutique, email..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${tab === t.key ? "bg-primary text-white border-primary" : "bg-card border-border text-muted-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">Aucun partenaire trouvé</p>
        ) : filtered.map(p => (
          <Card key={p.id}>
            <CardContent className="p-3">
              <div className="flex items-start gap-3">
                {p.logo_url ? (
                  <img src={p.logo_url} alt="" className="h-10 w-10 rounded-xl object-cover flex-shrink-0" />
                ) : (
                  <div className="h-10 w-10 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
                    <Store className="h-5 w-5 text-green-600" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{p.nom_boutique || p.user_email}</p>
                  <p className="text-[10px] text-muted-foreground">{p.user_email}</p>
                  {p.categorie && <p className="text-[10px] text-muted-foreground">{p.categorie}</p>}
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full inline-block mt-1 ${
                    p.statut === "actif" ? "bg-green-100 text-green-700" :
                    p.statut === "en_attente" ? "bg-amber-100 text-amber-700" :
                    "bg-gray-100 text-gray-600"
                  }`}>{p.statut || "—"}</span>
                </div>
              </div>
              <div className="flex gap-2 mt-2">
                <Link to={`/gerer-partenaires`} className="flex-1">
                  <Button size="sm" variant="outline" className="w-full h-7 text-[11px]">Détails</Button>
                </Link>
                {p.statut === "en_attente" && (
                  <Button size="sm" className="h-7 text-[11px] bg-green-600 hover:bg-green-700" onClick={() => handleValidate(p)}>
                    <CheckCircle2 className="h-3 w-3 mr-0.5" />Valider
                  </Button>
                )}
                {p.statut === "actif" && (
                  <Button size="sm" variant="outline" className="h-7 text-[11px] border-amber-300 text-amber-600" onClick={() => handleSuspend(p)}>Suspendre</Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}