import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Wallet, Truck, Package, Headphones, Megaphone, Users, ArrowRight, Loader2, Shield } from "lucide-react";
import StaffStatCard from "@/components/StaffStatCard";
import { Card, CardContent } from "@/components/ui/card";

const MODULES = [
  { key: "canManageBedou",        label: "Gestion Bedou",              desc: "Recharges & retraits",           icon: Wallet,    route: "/staff/bedou",     color: "bg-green-50 border-green-200 text-green-700" },
  { key: "canValidateDrivers",    label: "Validation Livreurs",        desc: "Dossiers & validation",          icon: Truck,     route: "/staff/livreurs",  color: "bg-orange-50 border-orange-200 text-orange-700" },
  { key: "canManualDispatch",     label: "Dispatch Manuel",            desc: "Courses & assignation",          icon: Package,   route: "/staff/dispatch",  color: "bg-violet-50 border-violet-200 text-violet-700" },
  { key: "canViewComplaints",     label: "Support Client",             desc: "Réclamations & incidents",       icon: Headphones,route: "/staff/support",   color: "bg-red-50 border-red-200 text-red-700" },
  { key: "canManageAds",          label: "Publicités & Commerciaux",   desc: "Pubs & codes promo",             icon: Megaphone, route: "/staff/pubs",      color: "bg-yellow-50 border-yellow-200 text-yellow-700" },
];

export default function StaffDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [perm, setPerm] = useState(null);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const me = await base44.auth.me();
      setUser(me);
      const isAdmin = me?.role === "admin" || me?.email === "weezyh2@gmail.com";

      let p = null;
      if (!isAdmin) {
        const perms = await base44.entities.StaffPermission.filter({ userEmail: me.email, isActive: true });
        p = perms[0] || null;
      } else {
        p = { canManageBedou: true, canValidateDrivers: true, canManualDispatch: true, canViewComplaints: true, canManageAds: true };
      }
      setPerm(p);

      const [recharges, retraits, profiles, courses, complaints] = await Promise.allSettled([
        base44.entities.DemandeRecharge.filter({ statut: "en_attente" }),
        base44.entities.DemandeRetrait.filter({ statut: "en_attente" }),
        base44.entities.UserProfile.filter({ status: "en_attente" }),
        base44.entities.Course.filter({ statut: "en_attente" }),
        base44.entities.CourseIssue.filter({ status: "nouveau" }),
      ]).then(r => r.map(x => x.status === "fulfilled" ? x.value : []));

      setStats({
        recharges: recharges.length,
        retraits: retraits.length,
        livreurs: profiles.filter(p => p.profile_type === "livreur").length,
        courses: courses.length,
        complaints: complaints.length,
      });
      setLoading(false);
    };
    load().catch(() => setLoading(false));
  }, []);

  const visibleModules = MODULES.filter(m => perm && perm[m.key]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="space-y-5 pb-24">
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 rounded-2xl p-5 text-white mx-0 shadow-lg">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-indigo-200" />
          <div>
            <h1 className="text-xl font-bold">Espace Personnel CDL</h1>
            <p className="text-indigo-200 text-xs">{user?.full_name} · {perm?.roleLabel || "Staff"}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StaffStatCard label="Recharges en attente" value={stats.recharges} color="text-green-600" icon={Wallet} />
        <StaffStatCard label="Retraits en attente" value={stats.retraits} color="text-orange-600" icon={Wallet} />
        <StaffStatCard label="Livreurs à valider" value={stats.livreurs} color="text-blue-600" icon={Truck} />
        <StaffStatCard label="Courses en attente" value={stats.courses} color="text-violet-600" icon={Package} />
        <StaffStatCard label="Réclamations" value={stats.complaints} color="text-red-600" icon={Headphones} />
      </div>

      {visibleModules.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground text-sm">
            Aucun module disponible avec vos permissions actuelles.
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Mes modules</p>
        {visibleModules.map(m => {
          const Icon = m.icon;
          return (
            <button key={m.key} onClick={() => navigate(m.route)}
              className={`w-full flex items-center gap-4 p-4 rounded-2xl border text-left ${m.color} active:scale-95 transition-all`}>
              <Icon className="h-6 w-6 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-bold text-sm">{m.label}</p>
                <p className="text-xs opacity-70">{m.desc}</p>
              </div>
              <ArrowRight className="h-4 w-4 opacity-50" />
            </button>
          );
        })}
      </div>

      <div className="pt-2">
        <button onClick={() => navigate("/espaces")}
          className="w-full py-3 rounded-2xl border-2 border-dashed border-muted-foreground/30 text-muted-foreground text-sm font-medium hover:bg-muted/30">
          ↔ Basculer d'espace
        </button>
      </div>
    </div>
  );
}