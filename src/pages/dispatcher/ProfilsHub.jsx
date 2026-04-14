/**
 * CDL — Hub central des Profils (admin)
 * Sous-navigation vers chaque type de profil.
 */
import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Users, Truck, Store, Tag, Megaphone, ShieldCheck, ChevronRight, ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const SECTIONS = [
  { path: "/profils/livreurs",    label: "Livreurs",     icon: Truck,      color: "text-blue-600",   bg: "bg-blue-50 border-blue-200",   type: "livreur" },
  { path: "/profils/clients",     label: "Clients",      icon: Users,      color: "text-orange-600", bg: "bg-orange-50 border-orange-200", type: "client" },
  { path: "/profils/commerciaux", label: "Commerciaux",  icon: Tag,        color: "text-purple-600", bg: "bg-purple-50 border-purple-200", type: "commercial" },
  { path: "/profils/partenaires", label: "Partenaires",  icon: Store,      color: "text-green-600",  bg: "bg-green-50 border-green-200",  type: "partenaire" },
  { path: "/profils/annonceurs",  label: "Annonceurs",   icon: Megaphone,  color: "text-pink-600",   bg: "bg-pink-50 border-pink-200",    type: "annonceur" },
];

export default function ProfilsHub() {
  const navigate = useNavigate();
  const [counts, setCounts] = useState({});
  const [pending, setPending] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const profiles = await base44.entities.UserProfile.filter({ deleted: false });
        const c = {};
        const p = {};
        SECTIONS.forEach(s => {
          c[s.type] = profiles.filter(pr => pr.profile_type === s.type).length;
          p[s.type] = profiles.filter(pr => pr.profile_type === s.type && pr.status === "en_attente").length;
        });
        setCounts(c);
        setPending(p);
      } catch (_) {}
      setLoading(false);
    };
    load();
  }, []);

  const totalPending = Object.values(pending).reduce((s, v) => s + v, 0);

  return (
    <div className="space-y-4 pb-16">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
        <div>
          <h1 className="text-xl font-bold">Profils</h1>
          <p className="text-xs text-muted-foreground">Gestion centralisée des profils CDL</p>
        </div>
      </div>

      {totalPending > 0 && (
        <Link to="/gestion-profils">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 border-2 border-amber-300 animate-pulse">
            <ShieldCheck className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-bold text-amber-800">⏳ {totalPending} demande(s) en attente de validation</p>
              <p className="text-[10px] text-amber-600">Cliquez pour traiter</p>
            </div>
            <ChevronRight className="h-4 w-4 text-amber-600" />
          </div>
        </Link>
      )}

      <div className="space-y-2">
        {SECTIONS.map(s => {
          const Icon = s.icon;
          const count = counts[s.type] ?? "—";
          const pend = pending[s.type] ?? 0;
          return (
            <Link key={s.path} to={s.path}>
              <Card className={`border ${s.bg} hover:shadow-md transition-all active:scale-95 cursor-pointer`}>
                <CardContent className="p-4 flex items-center gap-4">
                  <div className={`h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0 ${s.bg}`}>
                    <Icon className={`h-5 w-5 ${s.color}`} />
                  </div>
                  <div className="flex-1">
                    <p className={`font-bold text-sm ${s.color}`}>{s.label}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {loading ? "Chargement..." : `${count} profil(s)`}
                      {pend > 0 && ` · ${pend} en attente`}
                    </p>
                  </div>
                  {pend > 0 && (
                    <span className="h-6 min-w-6 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center">
                      {pend}
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card className="border-l-4 border-l-primary">
        <CardContent className="p-4 flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-primary flex-shrink-0" />
          <div className="flex-1">
            <p className="font-bold text-sm text-primary">Gestion des validations</p>
            <p className="text-[11px] text-muted-foreground">Valider, refuser, bloquer les profils en attente</p>
          </div>
          <Link to="/gestion-profils"><ChevronRight className="h-4 w-4 text-muted-foreground" /></Link>
        </CardContent>
      </Card>
    </div>
  );
}