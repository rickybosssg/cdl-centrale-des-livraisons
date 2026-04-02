import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { User, Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import RoleSetup from "../components/RoleSetup";
import LivreurDocuments from "../components/LivreurDocuments";
import PendingProfiles from "../components/PendingProfiles";
import ClientHome from "./client/ClientHome";
import LivreurHome from "./client/LivreurHome";
import DispatcherDashboard from "./dispatcher/DispatcherDashboard";
import DashboardPartenaire from "./partenaire/DashboardPartenaire";
import DashboardCommercial from "./commercial/DashboardCommercial";
import AttentePage from "./AttentePage";

const ADMIN_EMAILS = ["weezyh2@gmail.com", "admin@cdl.local"];

const isUserAdmin = (user) => {
  if (!user) return false;
  // Vérifier rôle: role='admin' ou user_type='admin'
  if (user.role === 'admin' || user.user_type === 'admin') return true;
  // Fallback: vérifier email
  if (ADMIN_EMAILS.includes(user.email)) return true;
  return false;
};

export default function Home() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [allProfiles, setAllProfiles] = useState([]);
  const [showSwitch, setShowSwitch] = useState(false);
  const [switching, setSwitching] = useState(null);
  const [pendingProfiles, setPendingProfiles] = useState([]);
  const [cancelingProfile, setCancelingProfile] = useState(null);

  const loadUser = async () => {
    console.log('[Home] Chargement utilisateur et profils...');
    // Invalider le cache pour forcer un refetch
    queryClient.invalidateQueries({ queryKey: ['auth'] });
    queryClient.invalidateQueries({ queryKey: ['user'] });
    
    // Forcer refetch via base44.auth.me()
    const me = await base44.auth.me();
    console.log('[Home.loadUser] User fetched fresh:', {
      email: me?.email,
      role: me?.role,
      user_type: me?.user_type,
      active_profile_type: me?.active_profile_type,
    });
    setUser(me);
    // Charger tous les profils pour le switcher
    try {
      const profs = await base44.entities.UserProfile.filter({ user_email: me.email, deleted: false });
      console.log('[Home] Profils chargés:', profs.length);
      setAllProfiles(profs);
      // Extraire les profils en attente
      const pending = profs.filter(p => p.status === 'en_attente');
      console.log('[Home] Profils en attente:', pending.length);
      setPendingProfiles(pending);
    } catch (err) {
      console.error('[Home] Erreur chargement profils:', err);
    }
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
    if (isAuthenticated) {
      // Vider TOUT le cache React Query au démarrage
      // Cela force un refetch complet depuis le serveur
      console.log('[Home.useEffect] Clearing React Query cache on mount...');
      queryClient.clear();
      // Attendre un tick, puis charger
      setTimeout(() => loadUser(), 100);
    } else { 
      navigate('/'); 
      setLoading(false); 
    }
  }, [isAuthenticated, navigate, queryClient]);

  // Subscription aux changements de profil utilisateur SANS relancer loadUser (éviter boucle)
  useEffect(() => {
    if (!user) return;
    console.log('[Home] Setup subscription UserProfile pour:', user.email);
    const unsubscribe = base44.entities.UserProfile.subscribe((event) => {
      console.log('[Home] Event UserProfile:', event.type, '- profile_type:', event.data?.profile_type, '- status:', event.data?.status);
      if (event.data?.user_email === user.email && !event.data?.deleted) {
        // ⚠️ Mettre à jour localement SANS relancer loadUser() pour éviter boucle infinie
        if (event.type === 'create' || event.type === 'update') {
          setPendingProfiles(prev => {
            const exists = prev.find(p => p.id === event.id);
            if (exists) return prev.map(p => p.id === event.id ? event.data : p);
            if (event.data.status === 'en_attente') return [event.data, ...prev];
            return prev.filter(p => p.id !== event.id);
          });
        }
      }
    });
    return unsubscribe;
  }, [user?.email]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // 1. Admin → dashboard admin directement
  const isAdmin = isUserAdmin(user);
  console.log('[Home] ════════════════════════════════════════');
  console.log('[Home] ADMIN CHECK:');
  console.log('[Home]   user.email =', user?.email);
  console.log('[Home]   user.role =', user?.role);
  console.log('[Home]   user.user_type =', user?.user_type);
  console.log('[Home]   isUserAdmin() returned =', isAdmin);
  console.log('[Home] ════════════════════════════════════════');
  
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

  // Profil actif déterminé depuis les données user
  const activeProfile = user?.active_profile_type || user?.user_type;
  // Profil UserProfile correspondant au type actif
  const activeUserProfile = allProfiles.find(p => p.profile_type === activeProfile);
  // Profil livreur + détection docs
  const livreurProfile = allProfiles.find(p => p.profile_type === 'livreur');
  const livreurHasDocs = !!(livreurProfile?.documents_json && (() => {
    try { const d = JSON.parse(livreurProfile.documents_json); return d.photo_profil && d.photo_identite_recto; } catch { return false; }
  })());

  // 2. Pas encore de profil → inscription
  if (!activeProfile) {
    return <RoleSetup onComplete={loadUser} />;
  }

  // 3. Livreur sans docs
  if (activeProfile === 'livreur' && !user.docs_envoyes && !livreurHasDocs) {
    return <LivreurDocuments onComplete={loadUser} />;
  }

  // 4. Compte bloqué
  const isAccountBlocked = activeUserProfile?.status === 'bloque' || user.livreur_bloque || user.statut_compte === 'bloque';
  if (isAccountBlocked) {
    return <AttentePage profile={activeProfile} isBlocked={true} blockReason={activeUserProfile?.blocked_reason || user.motif_blocage || ''} />;
  }

  // 5. En attente de validation du profil actif
  const needsValidation = ['livreur', 'partenaire', 'commercial'].includes(activeProfile);
  const isValidated =
    activeUserProfile?.status === 'actif' ||
    user.profil_valide ||
    user.statut_validation_livreur === 'valide' ||
    user.statut_validation_commercial === 'valide' ||
    user.statut_validation_partenaire === 'valide';

  const motifRefus = activeUserProfile?.refusal_reason || user.motif_refus;
  const docsOk = livreurHasDocs || user.docs_envoyes;

  if (needsValidation && !isValidated) {
    return <AttentePage profile={activeProfile} docsEnvoyes={docsOk} motifRefus={motifRefus} status={activeUserProfile?.status} />;
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
    admin:      { label: 'Administrateur', emoji: '🛡️', color: '#1e40af', bgGradient: 'from-blue-900 to-blue-700' },
    client:     { label: 'Client',         emoji: '👤', color: '#3b82f6' },
    livreur:    { label: 'Livreur',        emoji: '🛵', color: '#22c55e' },
    partenaire: { label: 'Partenaire',     emoji: '🏪', color: '#a855f7' },
    commercial: { label: 'Commercial',     emoji: '📣', color: '#f97316' },
  };

  return (
    <div className="space-y-0">
      {/* Afficher les profils en attente en haut */}
      {pendingProfiles.length > 0 && (
        <div className="px-4 pt-4 pb-2">
          <PendingProfiles pendingProfiles={pendingProfiles} onProfileChange={loadUser} />
        </div>
      )}

      <div className="flex justify-between items-center pb-3 px-4 pt-4">
        {/* Badge profil actif + switch rapide — toujours visible */}
        {activeProfile && PROFILE_CFG[activeProfile] && (
          isAdmin ? (
            /* Admin: badge spécial sans switch */
            <div className="flex items-center gap-2 px-4 py-2 rounded-full border-2 text-sm font-bold bg-gradient-to-r from-blue-900 to-blue-700 text-white border-blue-600 shadow-lg">
              <span>{PROFILE_CFG[activeProfile].emoji}</span>
              <span>{PROFILE_CFG[activeProfile].label}</span>
            </div>
          ) : (
            /* Non-admin: badge avec switch */
            <button
              onClick={() => setShowSwitch(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full border-2 text-sm font-bold transition-all active:scale-95"
              style={{ borderColor: PROFILE_CFG[activeProfile].color, color: PROFILE_CFG[activeProfile].color, background: PROFILE_CFG[activeProfile].color + '15' }}
            >
              <span>{PROFILE_CFG[activeProfile].emoji}</span>
              <span>{PROFILE_CFG[activeProfile].label}</span>
              <span className="text-xs opacity-60">▼</span>
            </button>
          )
        )}
        <Button variant="outline" size="sm" className="gap-2 ml-auto" onClick={() => navigate('/settings')}>
          <User className="h-4 w-4" /> Mon compte
        </Button>
      </div>

      {renderDashboard()}

      {/* Modal switch profil — MASQUÉ POUR ADMINS */}
      {!isAdmin && (
      <Dialog open={showSwitch} onOpenChange={setShowSwitch}>
        <DialogContent className="max-w-xs">
          <p className="font-bold text-base mb-1">Mes profils</p>
          <p className="text-xs text-muted-foreground mb-3">Profil actuel : <strong>{PROFILE_CFG[activeProfile]?.label}</strong></p>

          {/* Profils actifs — interchangeables */}
          <div className="space-y-2">
            {allProfiles.filter(p => p.status === 'actif').map(p => {
              console.log('[Home.Modal] Profil actif:', p.profile_type);
              const cfg = PROFILE_CFG[p.profile_type];
              if (!cfg) return null;
              const isActive = p.profile_type === activeProfile;
              return (
                <button
                  key={p.id}
                  disabled={isActive || !!switching}
                  onClick={() => handleSwitch(p.profile_type)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all active:scale-95"
                  style={{ borderColor: isActive ? cfg.color : '#e5e7eb', background: isActive ? cfg.color + '15' : 'white' }}
                >
                  <span className="text-2xl">{cfg.emoji}</span>
                  <div className="flex-1 text-left">
                    <p className="font-semibold text-sm" style={{ color: cfg.color }}>{cfg.label}</p>
                    <p className="text-xs" style={{ color: isActive ? cfg.color : '#6b7280' }}>{isActive ? '✓ Profil actuel' : 'Basculer vers ce profil'}</p>
                  </div>
                  {switching === p.profile_type && (
                    <span className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Profils non actifs avec actions */}
          {allProfiles.filter(p => p.status !== 'actif').length > 0 && (
            <div className="mt-3 space-y-2">
              {!isAdmin && (
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Autres profils</p>
        )}
              {!isAdmin && allProfiles.filter(p => p.status !== 'actif').map(p => {
                console.log('[Home.Modal] Profil non actif:', p.profile_type, '-', p.status);
                const cfg = PROFILE_CFG[p.profile_type];
                if (!cfg) return null;
                const statusCfg = {
                  en_attente: { label: '⏳ En attente', bg: '#fef3c7', color: '#92400e' },
                  refuse:     { label: '❌ Refusé',     bg: '#fee2e2', color: '#991b1b' },
                  suspendu:   { label: '🔒 Suspendu',   bg: '#f3f4f6', color: '#374151' },
                }[p.status] || { label: p.status, bg: '#f3f4f6', color: '#374151' };

                const canCancel = p.status === 'en_attente' || p.status === 'refuse';

                return (
                  <div key={p.id} className="flex items-center gap-2 p-3 rounded-xl border" style={{ borderColor: p.status === 'en_attente' ? '#fcd34d' : '#e5e7eb', background: p.status === 'en_attente' ? '#fffbeb' : '#f9fafb' }}>
                    <span className="text-xl">{cfg.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-700">{cfg.label}</p>
                      <p className="text-xs text-gray-500">{p.status === 'en_attente' ? 'Demande en cours...' : 'Non actif'}</p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: statusCfg.bg, color: statusCfg.color }}>
                        {statusCfg.label}
                      </span>
                      {canCancel && (
                        <button
                          onClick={() => setCancelingProfile(p)}
                          disabled={cancelingProfile?.id === p.id}
                          className="p-1.5 rounded-lg hover:bg-red-100 text-red-600 transition-colors"
                          title="Annuler cette demande"
                        >
                          {cancelingProfile?.id === p.id ? (
                            <span className="w-3.5 h-3.5 border-2 border-red-200 border-t-red-600 rounded-full animate-spin inline-block" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Confirmation annulation inline */}
          {cancelingProfile && (
            <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-300 space-y-2">
              <p className="text-xs font-semibold text-red-700">
                Êtes-vous sûr d'annuler votre demande de {PROFILE_CFG[cancelingProfile.profile_type]?.label} ?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setCancelingProfile(null)}
                  className="flex-1 px-2 py-1.5 text-xs font-medium rounded-lg bg-white border border-red-300 text-red-600 hover:bg-red-50 transition-colors"
                >
                  Garder
                </button>
                <button
                  onClick={async () => {
                    console.log('[Home] Annulation du profil:', cancelingProfile.id);
                    try {
                      const result = await base44.functions.invoke('cancelProfileRequest', { profile_id: cancelingProfile.id });
                      console.log('[Home] Résultat annulation:', result.data);
                      if (result.data?.success) {
                        console.log('[Home] Profil annulé, rechargement...');
                        setCancelingProfile(null);
                        setShowSwitch(false);
                        await loadUser();
                      }
                    } catch (err) {
                      console.error('[Home] Erreur annulation:', err);
                    }
                  }}
                  className="flex-1 px-2 py-1.5 text-xs font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
                >
                  <Trash2 className="h-3 w-3 inline mr-1" /> Oui, annuler
                </button>
              </div>
            </div>
          )}

          {/* Créer un nouveau profil */}
          <button
            className="mt-4 w-full py-2.5 rounded-xl border-2 border-dashed border-primary/40 text-primary text-sm font-semibold hover:bg-primary/5 transition-colors"
            onClick={() => { setShowSwitch(false); navigate('/settings'); }}
          >
            + Créer un nouveau profil
          </button>
        </DialogContent>
      </Dialog>
      )}
    </div>
  );
}