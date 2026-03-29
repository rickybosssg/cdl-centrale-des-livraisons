import { Link, useLocation, useNavigate } from "react-router-dom";
import { vibrateLight } from "@/lib/vibration";
import { Package, Home, Clock, Users, BarChart3, Truck, Plus, TrendingUp, Database, Store, Sparkles, Megaphone, Tag, MessageCircle } from "lucide-react";
import { motion } from "framer-motion";
import PageTransition from "./PageTransition";
import { useState } from "react";
import { useTabNavigation } from "@/hooks/useTabNavigation";
import AppHeader from "./AppHeader";

const NAV_ITEMS = {
  client: [
    { path: "/", icon: Home, label: "Accueil" },
    { path: "/commander", icon: Plus, label: "Commander" },
    { path: "/mes-courses", icon: Clock, label: "Courses" },
    { path: "/vitrines", icon: Sparkles, label: "Vitrines" },
    { path: "/mes-messages", icon: MessageCircle, label: "Messages" },
  ],
  livreur: [
    { path: "/", icon: Home, label: "Accueil" },
    { path: "/courses-disponibles", icon: Package, label: "Disponibles" },
    { path: "/mes-livraisons", icon: Truck, label: "Livraisons" },
    { path: "/mes-gains", icon: TrendingUp, label: "Gains" },
    { path: "/mes-discussions", icon: MessageCircle, label: "Messages" },
  ],
  dispatcher: [
    { path: "/", icon: Home, label: "Accueil" },
    { path: "/gerer-courses", icon: Package, label: "Courses" },
    { path: "/gerer-livreurs", icon: Users, label: "Livreurs" },
    { path: "/gerer-partenaires", icon: Store, label: "Partenaires" },
    { path: "/messages-admin", icon: MessageCircle, label: "Messages" },
  ],
  admin: [
    { path: "/", icon: Home, label: "Accueil" },
    { path: "/gerer-courses", icon: Package, label: "Courses" },
    { path: "/gerer-livreurs", icon: Users, label: "Livreurs" },
    { path: "/gerer-partenaires", icon: Store, label: "Partenaires" },
    { path: "/messages-admin", icon: MessageCircle, label: "Messages" },
  ],
  commercial: [
    { path: "/", icon: Home, label: "Accueil" },
    { path: "/mes-messages", icon: MessageCircle, label: "Messages" },
  ],
  partenaire: [
    { path: "/", icon: Home, label: "Commerce" },
    { path: "/commandes-partenaire", icon: Package, label: "Commandes" },
    { path: "/mes-messages", icon: MessageCircle, label: "Messages" },
  ],
};

export default function AppLayout({ userRole, userEmail }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { scrollContainerRef, isRootTab } = useTabNavigation();
  const items = NAV_ITEMS[userRole] || NAV_ITEMS.client;

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
                  className={`flex flex-col items-center gap-0.5 transition-colors ${
                    active ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <motion.div
                    animate={active ? { scale: 1.12 } : { scale: 1 }}
                    transition={{ duration: 0.2, ease: [0.4,0,0.2,1] }}
                  >
                    <Icon className="h-5 w-5" />
                  </motion.div>
                  <span className={`text-[10px] font-semibold transition-all ${
                    active ? "text-primary" : ""
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