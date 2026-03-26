import { Outlet, Link, useLocation } from "react-router-dom";
import WhatsAppButton from "./WhatsAppButton";
import { Package, Home, Clock, Users, BarChart3, Truck, Plus, LogOut, TrendingUp } from "lucide-react";
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
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => base44.auth.logout()}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-4">
        <Outlet />
      </main>

      {/* Bottom Nav */}
      <nav className="sticky bottom-0 z-50 bg-card border-t shadow-lg">
        <div className="max-w-lg mx-auto flex">
          {items.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex-1 flex flex-col items-center py-2 gap-0.5 transition-colors ${
                  active 
                    ? "text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
      <WhatsAppButton />
    </div>
  );
}