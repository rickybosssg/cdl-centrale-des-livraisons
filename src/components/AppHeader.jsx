import { Link, useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, LogOut, Settings } from "lucide-react";
import NotificationBell from "./NotificationBell";
import { base44 } from "@/api/base44Client";
import { useMessageCount } from "@/hooks/useMessageCount";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

const ROOT_PATHS = ['/', '/courses-disponibles', '/mes-livraisons', '/vitrines', '/dashboard-partenaire', '/gerer-courses', '/gerer-livreurs', '/statistiques', '/suivi-commissions', '/validation-livreurs', '/parametres', '/mes-gains', '/mes-messages', '/messages-admin', '/base-clients', '/gerer-partenaires', '/gerer-publicites', '/gerer-commerciaux', '/commandes-partenaire'];

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
          <a
            href="https://wa.me/message/EH7SMNHNHL7RN1?text=Bonjour%20CDL%2C%20j%27ai%20besoin%20d%27assistance."
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500 hover:bg-green-600 text-white text-xs font-semibold transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            WhatsApp
          </a>
          <NotificationBell userEmail={userEmail} hasUnread={hasUnread} />
          <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize hidden sm:inline transition-colors ${
            hasUnread ? "bg-red-100 text-red-700" : "bg-primary/10 text-primary"
          }`}>
            {userRole === 'dispatcher' ? 'Administrateur' : userRole}
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
  );
}