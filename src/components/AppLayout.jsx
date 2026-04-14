import { Link, useLocation, useNavigate } from "react-router-dom";
import { vibrateLight } from "@/lib/vibration";
import { Package, Home, Clock, Users, BarChart3, Truck, Plus, TrendingUp, Database, Store, Sparkles, Megaphone, Tag, MessageCircle, ShieldCheck, Zap, Wallet } from "lucide-react";
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import PageTransition from "./PageTransition";
import { useTabNavigation } from "@/hooks/useTabNavigation";
import { useMessageCount } from "@/hooks/useMessageCount";
import usePresence from "@/hooks/usePresence";
import AppHeader from "./AppHeader";

const NAV_ITEMS = {
  client: [
    { path: "/", icon: Home, label: "Accueil" },
    { path: "/commander", icon: Plus, label: "Commander" },
    { path: "/mes-courses", icon: Clock, label: "Courses" },
    { path: "/mall", icon: Store, label: "MALL" },
    { path: "/mes-messages", icon: MessageCircle, label: "Messages" },
  ],
  livreur: [
    { path: "/", icon: Home, label: "Accueil" },
    { path: "/courses-disponibles", icon: Package, label: "Disponibles" },
    { path: "/mes-livraisons", icon: Truck, label: "Livraisons" },
    { path: "/mall", icon: Store, label: "MALL" },
    { path: "/mes-discussions", icon: MessageCircle, label: "Messages" },
  ],
  admin: [
    { path: "/", icon: Home, label: "Dashboard" },
    { path: "/gerer-courses", icon: Package, label: "Courses" },
    { path: "/dispatch-monitor", icon: Zap, label: "Dispatch" },
    { path: "/profils", icon: Users, label: "Profils" },
    { path: "/messages-admin", icon: MessageCircle, label: "Messages" },
  ],
  commercial: [
    { path: "/", icon: Home, label: "Accueil" },
    { path: "/mall", icon: Store, label: "MALL" },
    { path: "/mes-messages", icon: MessageCircle, label: "Messages" },
  ],
  partenaire: [
    { path: "/", icon: Home, label: "Commerce" },
    { path: "/commandes-partenaire", icon: Package, label: "Commandes" },
    { path: "/mes-messages", icon: MessageCircle, label: "Messages" },
  ],
  annonceur: [
    { path: "/", icon: Home, label: "Accueil" },
    { path: "/dashboard-annonceur", icon: Megaphone, label: "Pubs" },
    { path: "/creer-publicite", icon: Plus, label: "Créer" },
    { path: "/mes-messages", icon: MessageCircle, label: "Messages" },
  ],
};

export default function AppLayout({ userRole, userEmail }) {
  // ⚠️ Tous les hooks TOUJOURS appelés en premier (Rules of Hooks)
  const location = useLocation();
  const navigate = useNavigate();
  const { scrollContainerRef, isRootTab } = useTabNavigation();
  const items = NAV_ITEMS[userRole] || NAV_ITEMS.client;
  const hasUnread = useMessageCount(userEmail, userRole) || false;

  // Présence temps réel — passer le rôle actuel pour que driver_online soit correct
  usePresence(userEmail, userRole);
  const [courseBadge, setCourseBadge] = useState(0);

  // Badge courses disponibles (livreur uniquement)
  useEffect(() => {
    if (userRole !== 'livreur') return;
    const load = async () => {
      try {
        const data = await base44.entities.Course.filter({ statut: 'en_attente' }, '-created_date', 20);
        setCourseBadge(Array.isArray(data) ? data.length : 0);
      } catch (_) {}
    };
    load();
    const interval = setInterval(load, 60000);
    const unsub = base44.entities.Course.subscribe((event) => {
      if (event.type === 'create' && event.data?.statut === 'en_attente') {
        setCourseBadge(prev => prev + 1);
      } else if (event.type === 'update') {
        // Recharger si statut change
        load();
      }
    });
    return () => { clearInterval(interval); if (unsub) unsub(); };
  }, [userRole]);

  // Guard post-hooks
  if (!userEmail || !userRole) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader userRole={userRole} userEmail={userEmail} />

      {/* Main */}
      <main 
        ref={scrollContainerRef}
        className="flex-1 max-w-lg mx-auto w-full px-4 py-4 overflow-y-auto pb-24 safe-bottom"
      >
        <PageTransition />
      </main>

      {/* Bottom Nav */}
      <nav className="sticky bottom-0 z-50 bg-card border-t shadow-lg bottom-nav safe-bottom">
        <div className="max-w-lg mx-auto flex relative">
          {items.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.path;
            if (item.external) {
              return (
                <a
                  key={item.path}
                  href="https://wa.me/message/EH7SMNHNHL7RN1?text=Bonjour%20CDL%2C%20j%27ai%20besoin%20d%27assistance."
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex flex-col items-center py-2 gap-0.5 text-green-600"
                >
                  <motion.div
                    whileTap={{ scale: 1.18 }}
                    transition={{ duration: 0.16, ease: [0.4,0,0.2,1] }}
                    className="flex flex-col items-center gap-0.5"
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-[10px] font-semibold">{item.label}</span>
                  </motion.div>
                </a>
              );
            }
            return (
              <Link
                key={item.path}
                to={item.path}
                className="flex-1 flex flex-col items-center py-2 gap-0.5"
                onClick={(e) => {
                  if (active) {
                    e.preventDefault();
                    navigate(item.path);
                    scrollContainerRef?.current?.scrollTo({ top: 0, behavior: 'smooth' });
                  } else {
                    vibrateLight();
                  }
                }}
              >
                <motion.div
                  whileTap={{ scale: 1.18 }}
                  transition={{ duration: 0.16, ease: [0.4,0,0.2,1] }}
                  className={`flex flex-col items-center gap-0.5 transition-colors relative ${
                    active ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <motion.div
                    animate={active ? { scale: 1.12 } : { scale: 1 }}
                    transition={{ duration: 0.2, ease: [0.4,0,0.2,1] }}
                  >
                    <Icon className="h-5 w-5" />
                    {userRole === 'livreur' && item.path === '/courses-disponibles' && courseBadge > 0 && (
                      <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center">
                        {courseBadge > 9 ? '9+' : courseBadge}
                      </span>
                    )}
                  </motion.div>
                  <span className={`text-[10px] font-semibold transition-all text-center leading-tight max-w-[50px] ${
                    active ? "text-primary" : item.label === "Messages" && hasUnread ? "text-red-500 font-black" : ""
                  }`}>{item.label}</span>
                  {active && (
                    <motion.div
                      layoutId="nav-indicator"
                      className="absolute -bottom-0 h-0.5 w-6 bg-primary rounded-full"
                      transition={{ duration: 0.22, ease: [0.4,0,0.2,1] }}
                    />
                  )}
                </motion.div>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}