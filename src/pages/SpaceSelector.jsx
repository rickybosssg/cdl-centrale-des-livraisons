import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { User, Truck, Store, Megaphone, Settings, Shield, ChevronRight, Loader2 } from "lucide-react";

const SPACES = [
  { key: "client",     label: "Espace Client",         desc: "Commander et suivre vos courses",           icon: User,      color: "from-blue-500 to-blue-600",    route: "/" },
  { key: "livreur",    label: "Espace Livreur",         desc: "Recevoir et effectuer des courses",          icon: Truck,     color: "from-green-500 to-green-600",  route: "/" },
  { key: "partenaire", label: "Espace Partenaire",      desc: "Gérer votre boutique et vos commandes",     icon: Store,     color: "from-purple-500 to-purple-600", route: "/" },
  { key: "commercial", label: "Espace Commercial",      desc: "Suivre vos codes promo et vos gains",       icon: Megaphone, color: "from-orange-500 to-orange-600", route: "/" },
  { key: "staff",      label: "Espace Personnel CDL",   desc: "Accéder aux outils internes CDL",           icon: Settings,  color: "from-indigo-500 to-indigo-600", route: "/staff" },
  { key: "admin",      label: "Administration CDL",     desc: "Gestion complète de la plateforme",         icon: Shield,    color: "from-slate-700 to-slate-900",   route: "/admin-dashboard" },
];

export default function SpaceSelector() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [staffPerm, setStaffPerm] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const me = await base44.auth.me();
      setUser(me);
      const [profs, perms] = await Promise.allSettled([
        base44.entities.UserProfile.filter({ user_email: me.email, deleted: false }),
        base44.entities.StaffPermission.filter({ userEmail: me.email, isActive: true }),
      ]);
      setProfiles(profs.status === "fulfilled" ? profs.value : []);
      setStaffPerm(perms.status === "fulfilled" ? (perms.value[0] || null) : null);
      setLoading(false);
    };
    load();
  }, []);

  const isAdmin = user?.role === "admin" || user?.email === "weezyh2@gmail.com";
  const isStaff = !!(staffPerm?.isStaff && staffPerm?.isActive);
  const profileTypes = profiles.map(p => p.profile_type);

  const visibleSpaces = SPACES.filter(s => {
    if (s.key === "admin") return isAdmin;
    if (s.key === "staff") return isAdmin || isStaff;
    return isAdmin || profileTypes.includes(s.key);
  });

  const enter = (space) => {
    if (space.key !== "admin" && space.key !== "staff") {
      localStorage.setItem("activeProfileId", profiles.find(p => p.profile_type === space.key)?.id || "");
    }
    navigate(space.route);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex flex-col">
      <div className="p-6 pt-12 text-center text-white">
        <img
          src="https://media.base44.com/images/public/69c3c74fc4b62396dca61751/1eb51398f_Screenshot_20260330_132434_WhatsApp.jpg"
          alt="CDL"
          className="h-16 w-16 mx-auto rounded-2xl mb-4 shadow-lg"
        />
        <h1 className="text-2xl font-bold">Choisissez votre espace</h1>
        <p className="text-slate-300 text-sm mt-1">Accédez à votre interface selon votre rôle</p>
        {user && <p className="text-slate-400 text-xs mt-2">Connecté : {user.full_name}</p>}
      </div>

      <div className="flex-1 px-4 pb-8 space-y-3 max-w-lg mx-auto w-full">
        {visibleSpaces.length === 0 && (
          <div className="text-center text-slate-400 py-12">
            <p>Aucun espace disponible</p>
            <button onClick={() => navigate("/")} className="mt-4 text-primary underline text-sm">Retour</button>
          </div>
        )}
        {visibleSpaces.map(space => {
          const Icon = space.icon;
          return (
            <div
              key={space.key}
              onClick={() => enter(space)}
              className="bg-white/10 backdrop-blur border border-white/20 rounded-2xl p-4 flex items-center gap-4 cursor-pointer hover:bg-white/20 active:scale-95 transition-all"
            >
              <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${space.color} flex items-center justify-center flex-shrink-0`}>
                <Icon className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-white text-sm">{space.label}</p>
                <p className="text-slate-300 text-xs">{space.desc}</p>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-400 flex-shrink-0" />
            </div>
          );
        })}
      </div>
    </div>
  );
}