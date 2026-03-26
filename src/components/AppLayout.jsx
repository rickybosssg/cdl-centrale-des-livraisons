import { Link, useLocation } from "react-router-dom";
import { Package, Home, Clock, Users, BarChart3, Truck, Plus, LogOut, TrendingUp, MessageCircle } from "lucide-react";
import { motion } from "framer-motion";
import PageTransition from "./PageTransition";
import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = {
  client: [
    { path: "/", icon: Home, label: "Accueil" },
    { path: "/commander", icon: Plus, label: "Commander" },
    { path: "/mes-courses", icon: Clock, label: "Mes courses" },
  ],
  livreur: [
    { path: "/", icon: Home, label: "Accueil" },
    { path: "/courses-disponibles", icon: Package, label: "Disponibles" },
    { path: "/mes-livraisons", icon: Truck, label: "Livraisons" },
    { path: "/mes-gains", icon: TrendingUp, label: "Gains" },
  ],
  dispatcher: [
    { path: "/", icon: Home, label: "Accueil" },
    { path: "/gerer-courses", icon: Package, label: "Courses" },
    { path: "/gerer-livreurs", icon: Users, label: "Livreurs" },
    { path: "/suivi-commissions", icon: BarChart3, label: "Commissions" },
    { path: "whatsapp", icon: MessageCircle, label: "WhatsApp", external: true },
  ],
};

export default function AppLayout({ userRole }) {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const items = NAV_ITEMS[userRole] || NAV_ITEMS.client;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b shadow-sm">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src="https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg" alt="CDL" className="h-8 w-8 rounded-lg object-cover" />
            <span className="font-bold text-lg">CDL APP</span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium capitalize">
              {userRole}
            </span>
            <motion.button
              whileTap={{ scale: 0.9 }}
              transition={{ duration: 0.16, ease: [0.4,0,0.2,1] }}
              className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted"
              onClick={() => base44.auth.logout()}
            >
              <LogOut className="h-4 w-4" />
            </motion.button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-4 overflow-hidden">
        <PageTransition />
      </main>

      {/* Bottom Nav */}
      <nav className="sticky bottom-0 z-50 bg-card border-t shadow-lg">
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