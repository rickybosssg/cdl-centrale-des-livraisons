import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { User } from "lucide-react";
import { Button } from "@/components/ui/button";
import RoleSetup from "../components/RoleSetup";
import ClientHome from "./client/ClientHome";
import LivreurHome from "./client/LivreurHome";
import DispatcherDashboard from "./dispatcher/DispatcherDashboard";
import DashboardPartenaire from "./partenaire/DashboardPartenaire";
import DashboardCommercial from "./commercial/DashboardCommercial";
import AttentePage from "./AttentePage";

const ADMIN_EMAILS = ["weezyh2@gmail.com", "admin@cdl.local"];

export default function Home() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUser = async () => {
    const me = await base44.auth.me();
    setUser(me);
    setLoading(false);
  };

  useEffect(() => { 
    if (isAuthenticated) loadUser();
    else { navigate('/'); setLoading(false); }
  }, [isAuthenticated, navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // 1. Admin → dashboard admin directement
  const isAdmin = user?.role === 'admin' || user?.user_type === 'admin' || ADMIN_EMAILS.includes(user?.email);
  if (isAdmin) {
    return (
      <div className="space-y-0">
        <div className="flex justify-end items-center pb-3 px-4 pt-4">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate('/settings')}>
            <User className="h-4 w-4" /> Mon compte
          </Button>
        </div>
        <DispatcherDashboard />
      </div>
    );
  }

  // 2. Pas encore de profil → inscription
  if (!user?.user_type) {
    return <RoleSetup onComplete={loadUser} />;
  }

  // 3. Compte bloqué
  if (user.livreur_bloque || user.statut_compte === 'bloque') {
    return <AttentePage profile={user.user_type} isBlocked={true} blockReason={user.motif_blocage || ''} />;
  }

  // 4. En attente de validation (livreur, partenaire, commercial)
  const needsValidation = ['livreur', 'partenaire', 'commercial'].includes(user.user_type);
  const isValidated =
    user.profil_valide ||
    user.statut_validation_livreur === 'valide' ||
    user.statut_validation_commercial === 'valide' ||
    user.statut_validation_partenaire === 'valide';

  if (needsValidation && !isValidated) {
    return <AttentePage profile={user.user_type} />;
  }

  // 5. Dashboard selon le profil
  const renderDashboard = () => {
    if (!user) return null;
    switch (user.user_type) {
      case 'client':     return <ClientHome user={user} />;
      case 'livreur':    return <LivreurHome user={user} />;
      case 'partenaire': return <DashboardPartenaire user={user} />;
      case 'commercial': return <DashboardCommercial user={user} />;
      default:           return <ClientHome user={user} />;
    }
  };

  return (
    <div className="space-y-0">
      <div className="flex justify-between items-center pb-3 px-4 pt-4">
        <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate('/settings')}>
          <User className="h-4 w-4" /> Mon compte
        </Button>
      </div>
      {renderDashboard()}
    </div>
  );
}