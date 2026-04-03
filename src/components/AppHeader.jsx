import { Link, useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, LogOut, Settings } from "lucide-react";
import NotificationBell from "./NotificationBell";
import { base44 } from "@/api/base44Client";
import { useMessageCount } from "@/hooks/useMessageCount";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

const ROOT_PATHS = ['/', '/courses-disponibles', '/mes-livraisons', '/vitrines', '/dashboard-partenaire', '/gerer-courses', '/gerer-livreurs', '/statistiques', '/suivi-commissions', '/validation-livreurs', '/parametres', '/mes-gains', '/mes-messages', '/messages-admin', '/base-clients', '/gerer-partenaires', '/gerer-publicites', '/gerer-commerciaux', '/commandes-partenaire', '/settings'];

export default function AppHeader({ userRole, userEmail }) {
  const navigate = useNavigate();
  const location = useLocation();
  const hasUnread = useMessageCount(userEmail, userRole);
  
  const isRootPath = ROOT_PATHS.includes(location.pathname);
  const showBackButton = !isRootPath;

  return (
    <header className="sticky top-0 z-50 bg-card border-b shadow-sm app-header safe-top">
      <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
        {showBackButton ? (
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
        ) : (
          <Link to="/" className="flex items-center gap-2">
            <img src="https://media.base44.com/images/public/69c3c74fc4b62396dca61751/1eb51398f_Screenshot_20260330_132434_WhatsApp.jpg" alt="CDL" className="h-10 w-10 rounded-2xl object-cover" />
            <span className="font-bold text-lg">CDL APP</span>
          </Link>
        )}
        
        <div className="flex items-center gap-2">
          <NotificationBell userEmail={userEmail} hasUnread={hasUnread} />
          <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize hidden sm:inline transition-colors ${
            hasUnread ? 'bg-red-100 text-red-700' : 'bg-primary/10 text-primary'
          }`}>
            {userRole === 'dispatcher' ? 'Administrateur' : userRole}
          </span>

          <Link to="/settings">
            <motion.button
              whileTap={{ scale: 0.9 }}
              transition={{ duration: 0.16, ease: [0.4,0,0.2,1] }}
              className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted"
            >
              <Settings className="h-4 w-4" />
            </motion.button>
          </Link>
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
  );
}