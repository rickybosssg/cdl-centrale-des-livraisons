import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { User } from "lucide-react";
import { Button } from "@/components/ui/button";
import RoleSetup from "../components/RoleSetup";
import LivreurDocuments from "../components/LivreurDocuments";
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
  const [allProfiles, setAllProfiles] = useState([]);
  const [showSwitch, setShowSwitch] = useState(false);
  const [switching, setSwitching] = useState(null);

  const loadUser = async () => {
    const me = await base44.auth.me();
    setUser(me);
    // Charger tous les profils actifs pour le switcher
    try {
      const profs = await base44.entities.UserProfile.filter({ user_email: me.email, deleted: false });
      setAllProfiles(profs.filter(p => p.status === 'actif'));
    } catch (_) {}
    setLoading(false);
  };

  const handleSwitch = async (profileType) => {
    if (switching) return;
    setSwitching(profileType);
    const result = await base44.functions.invoke('switchActiveProfile', { profile_type: profileType });
    setSwitching(null);
    if (result.data?.success) {
      setShowSwitch(false);
      setTimeout(() => { window.location.href = '/'; }, 300);
    }
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

  // Profil actif = active_profile_type (multi-profils) ou fallback user_type
  const activeProfile = user?.active_profile_type || user?.user_type;

  // 2. Pas encore de profil → inscription
  if (!activeProfile) {
    return <RoleSetup onComplete={loadUser} />;
  }

  // 3. Livreur inscrit mais n'a pas encore envoyé ses documents
  if (activeProfile === 'livreur' && !user.docs_envoyes) {
    return <LivreurDocuments onComplete={loadUser} />;
  }

  // 4. Compte bloqué
  if (user.livreur_bloque || user.statut_compte === 'bloque') {
    return <AttentePage profile={activeProfile} isBlocked={true} blockReason={user.motif_blocage || ''} />;
  }

  // 5. En attente de validation du profil actif
  const needsValidation = ['livreur', 'partenaire', 'commercial'].includes(activeProfile);
  const isValidated =
    user.profil_valide ||
    user.statut_validation_livreur === 'valide' ||
    user.statut_validation_commercial === 'valide' ||
    user.statut_validation_partenaire === 'valide';

  if (needsValidation && !isValidated) {
    return <AttentePage profile={activeProfile} docsEnvoyes={user.docs_envoyes} motifRefus={user.motif_refus} />;
  }

  // 6. Dashboard selon le profil actif
  const renderDashboard = () => {
    if (!user) return null;
    switch (activeProfile) {
      case 'client':     return <ClientHome user={user} />;
      case 'livreur':    return <LivreurHome user={user} />;
      case 'partenaire': return <DashboardPartenaire user={user} />;
      case 'commercial': return <DashboardCommercial user={user} />;
      default:           return <ClientHome user={user} />;
    }
  };

  const PROFILE_CFG = {
    client:     { label: 'Client',      emoji: '👤', color: '#3b82f6' },
    livreur:    { label: 'Livreur',     emoji: '🛵', color: '#22c55e' },
    partenaire: { label: 'Partenaire',  emoji: '🏪', color: '#a855f7' },
    commercial: { label: 'Commercial',  emoji: '📣', color: '#f97316' },
    admin:      { label: 'Admin',       emoji: '🛡️', color: '#ef4444' },
  };

  return (
    <div className="space-y-0">
      <div className="flex justify-between items-center pb-3 px-4 pt-4">
        {/* Badge profil actif + switch rapide */}
        {allProfiles.length > 1 && activeProfile && PROFILE_CFG[activeProfile] && (
          <button
            onClick={() => setShowSwitch(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full border-2 text-sm font-bold transition-all active:scale-95"
            style={{ borderColor: PROFILE_CFG[activeProfile].color, color: PROFILE_CFG[activeProfile].color, background: PROFILE_CFG[activeProfile].color + '15' }}
          >
            <span>{PROFILE_CFG[activeProfile].emoji}</span>
            <span>{PROFILE_CFG[activeProfile].label}</span>
            <span className="text-xs opacity-60">▼</span>
          </button>
        )}
        <Button variant="outline" size="sm" className="gap-2 ml-auto" onClick={() => navigate('/settings')}>
          <User className="h-4 w-4" /> Mon compte
        </Button>
      </div>

      {renderDashboard()}

      {/* Modal switch profil */}
      <Dialog open={showSwitch} onOpenChange={setShowSwitch}>
        <DialogContent className="max-w-xs">
          <p className="font-bold text-base mb-3">Changer de profil</p>
          <div className="space-y-2">
            {allProfiles.map(p => {
              const cfg = PROFILE_CFG[p.profile_type];
              if (!cfg) return null;
              const isActive = p.profile_type === activeProfile;
              return (
                <button
                  key={p.id}
                  disabled={isActive || !!switching}
                  onClick={() => handleSwitch(p.profile_type)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all active:scale-95 disabled:opacity-60"
                  style={{ borderColor: isActive ? cfg.color : '#e5e7eb', background: isActive ? cfg.color + '15' : 'white' }}
                >
                  <span className="text-2xl">{cfg.emoji}</span>
                  <div className="flex-1 text-left">
                    <p className="font-semibold text-sm" style={{ color: cfg.color }}>{cfg.label}</p>
                    {isActive && <p className="text-xs text-muted-foreground">Profil actuel</p>}
                  </div>
                  {switching === p.profile_type && (
                    <span className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                  )}
                  {isActive && <span className="text-xs font-bold" style={{ color: cfg.color }}>✓</span>}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}