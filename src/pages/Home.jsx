import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { User, Trash2, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import RoleSetup from "../components/RoleSetup";
import LivreurDocuments from "../components/LivreurDocuments";
import PendingProfiles from "../components/PendingProfiles";
import IncompleteProfileGuard from "../components/IncompleteProfileGuard";
import NotificationPermissionBanner from "../components/NotificationPermissionBanner";
import ClientHome from "./client/ClientHome";
import LivreurHome from "./client/LivreurHome.jsx";
import DispatcherDashboard from "./dispatcher/DispatcherDashboard";
import AdminDashboardPro from "./dispatcher/AdminDashboardPro";
import DashboardPartenaire from "./partenaire/DashboardPartenaire";
import DashboardCommercial from "./commercial/DashboardCommercial";
import DashboardAnnonceur from "./annonceur/DashboardAnnonceur";
import AttentePage from "./AttentePage";

const ADMIN_EMAILS = ["weezyh2@gmail.com", "admin@cdl.local"];

function resolveActiveProfile(profiles, storedId, currentRole) {
  if (!Array.isArray(profiles) || profiles.length === 0) return null;
  // Priorité 1 : le profil correspondant au current_role BDD (source de vérité)
  if (currentRole) {
    const byRole = profiles.find(p => p?.profile_type === currentRole && !p?.deleted);
    if (byRole) {
      if (byRole.id !== storedId) localStorage.setItem('activeProfileId', byRole.id);
      return byRole;
    }
  }
  // Priorité 2 : le profil mémorisé en localStorage
  if (storedId) {
    const byId = profiles.find(p => p?.id === storedId && !p?.deleted);
    if (byId) return byId;
    localStorage.removeItem('activeProfileId');
  }
  // Priorité 3 : premier profil actif
  const fallback = profiles.find(p => p?.status === 'actif' && !p?.deleted) || profiles.find(p => !p?.deleted);
  if (fallback?.id) localStorage.setItem('activeProfileId', fallback.id);
  return fallback || null;
}

const PROFILE_CFG = {
  admin:      { label: 'Administrateur', emoji: '🛡️', color: '#1e40af' },
  client:     { label: 'Client',         emoji: '👤', color: '#3b82f6' },
  livreur:    { label: 'Livreur',        emoji: '🛵', color: '#22c55e' },
  partenaire: { label: 'Partenaire',     emoji: '🏪', color: '#a855f7' },
  commercial: { label: 'Commercial',     emoji: '📣', color: '#f97316' },
  annonceur:  { label: 'Annonceur',      emoji: '📢', color: '#ec4899' },
};

export default function Home() {
  console.log('[HOME] Render start');
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [allProfiles, setAllProfiles] = useState([]);
  const [activeProfileId, setActiveProfileId] = useState(() => localStorage.getItem('activeProfileId'));
  const [showSwitch, setShowSwitch] = useState(false);
  const [cancelingProfile, setCancelingProfile] = useState(null);

  const loadUser = async () => {
    try {
      const me = await base44.auth.me();
      if (!me) {
        setUser(null);
        setAllProfiles([]);
        setLoading(false);
        return;
      }
      
      setUser(me);
      const profs = await base44.entities.UserProfile.filter({ user_email: me.email, deleted: false });
      const profsArray = Array.isArray(profs) ? profs : [];
      setAllProfiles(profsArray);

      const isAdminUser = me.role === 'admin' || ADMIN_EMAILS.includes(me.email);

      if (!isAdminUser && profsArray.length > 0) {
        // ── RÉSOLUTION DU PROFIL ACTIF (ordre de priorité) ──────────────
        // P1 : activeProfileId déjà dans le state (switch récent en cours)
        // P2 : localStorage (mis à jour par switchProfile)
        // P3 : current_role BDD
        // P4 : premier profil actif
        const currentStoredId = localStorage.getItem('activeProfileId');
        const storedId = activeProfileId || currentStoredId;

        let resolved = storedId ? profsArray.find(p => p.id === storedId && !p.deleted) : null;

        if (!resolved) {
          // P3 : current_role BDD
          const trueRole = me.current_role || me.active_profile_type;
          if (trueRole) resolved = profsArray.find(p => p.profile_type === trueRole && !p.deleted);
        }
        if (!resolved) {
          // P4 : fallback premier profil actif
          resolved = profsArray.find(p => p.status === 'actif' && !p.deleted) || profsArray.find(p => !p.deleted);
        }

        if (resolved?.id) {
          localStorage.setItem('activeProfileId', resolved.id);
          setActiveProfileId(resolved.id);
          // Synchroniser current_role en BDD uniquement si nécessaire et sans écraser un switch récent
          if (resolved.profile_type && resolved.profile_type !== me.current_role && !currentStoredId) {
            base44.functions.invoke('switchActiveProfile', { profile_type: resolved.profile_type }).catch(() => {});
          }
        }
      }
    } catch (err) {
      console.error('[Home] Erreur chargement:', err);
      setUser(null);
      setAllProfiles([]);
    } finally {
      setLoading(false);
    }
  };

  // Mount: charger user si authentifié
  useEffect(() => {
    console.log('[HOME] useEffect MOUNT - isAuth:', isAuthenticated);
    if (isAuthenticated) {
      loadUser();
    } else {
      setLoading(false);
    }
  }, [isAuthenticated]);

  // Souscription temps réel
  useEffect(() => {
    console.log('[HOME] useEffect SUBSCRIBE - user:', user?.email);
    if (!user?.email) return;
    
    const unsubscribe = base44.entities.UserProfile.subscribe((event) => {
      console.log('[HOME] UserProfile event:', event.type, event?.data?.id);
      if (event?.data?.user_email === user.email) {
        console.log('[HOME] setAllProfiles mutation triggered');
        setAllProfiles(prev => {
          const arr = Array.isArray(prev) ? prev : [];
          if (event.type === 'delete') {
            return arr.filter(p => p?.id !== event.id);
          }
          const exists = arr.find(p => p?.id === event.id);
          if (exists) {
            return arr.map(p => p?.id === event.id ? event.data : p);
          }
          return [...arr, event.data];
        });
      }
    });
    
    return () => { if (unsubscribe) unsubscribe(); };
  }, [user?.email]);

  // NOTE : Pas de resync automatique sur current_role ici.
  // Le changement de profil est géré UNIQUEMENT par switchProfile() qui est la source de vérité.
  // Un resync automatique causerait un retour arrière vers l'ancien profil si current_role BDD est en retard.

  const switchProfile = async (profileId) => {
    setShowSwitch(false);
    const prof = allProfiles?.find(p => p?.id === profileId);
    if (!prof?.profile_type) return;

    // Vérifier que le profil est bien validé avant de basculer
    if (prof.status !== 'actif') {
      alert(`Votre profil ${PROFILE_CFG[prof.profile_type]?.label || prof.profile_type} est en attente de validation. Vous ne pouvez pas encore l'utiliser.`);
      return;
    }

    const newRole = prof.profile_type;

    // 1. Mettre à jour le state local IMMÉDIATEMENT — source de vérité pour le rendu
    localStorage.setItem('activeProfileId', profileId);
    setActiveProfileId(profileId);
    setUser(prev => prev ? { ...prev, current_role: newRole, active_profile_type: newRole } : prev);

    // 2. Notifier AppLayoutWrapper (nav bas + header) du nouveau rôle
    window.dispatchEvent(new CustomEvent('cdl_profile_switch', { detail: { role: newRole } }));

    // 3. Persister en BDD en arrière-plan (sans bloquer l'UI)
    base44.functions.invoke('switchActiveProfile', { profile_type: newRole })
      .catch(err => {
        console.error('[Home] Erreur switchActiveProfile BDD:', err);
      });
  };

  if (loading) {
    console.log('[HOME] Still loading...');
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }
  console.log('[HOME] Loading done, user:', user?.email, 'profiles:', allProfiles.length);

  // Pas authentifié → redirection immédiate vers /connexion
  if (!user) {
    console.log('[HOME] NOT AUTHENTICATED - redirecting to /connexion');
    window.location.replace('/connexion');
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-b from-primary to-blue-700">
        <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  // Admin
  const isAdmin = user?.role === 'admin' || user?.user_type === 'admin' || ADMIN_EMAILS.includes(user?.email);
  console.log('[HOME] IS ADMIN?', isAdmin);
  if (isAdmin) {
    console.log('[HOME] Rendering AdminDashboardPro');
    return <AdminDashboardPro />;
  }

  const profilesArray = Array.isArray(allProfiles) ? allProfiles : [];

  // ── SOURCE DE VÉRITÉ POUR LE RENDU ──────────────────────────────────────────
  // activeProfileId (state local) est mis à jour IMMÉDIATEMENT lors d'un switch.
  // Il prime sur TOUT, y compris current_role BDD (qui peut avoir du retard).
  const activeUserProfile = (() => {
    // P1 : par ID local (mis à jour instantanément au switch)
    if (activeProfileId) {
      const byId = profilesArray.find(p => p?.id === activeProfileId && !p?.deleted);
      if (byId) return byId;
    }
    // P2 : par current_role du state user (déjà mis à jour localement par switchProfile)
    const localRole = user?.current_role || user?.active_profile_type;
    if (localRole) {
      const byRole = profilesArray.find(p => p?.profile_type === localRole && !p?.deleted);
      if (byRole) return byRole;
    }
    // P3 : fallback premier profil actif
    return profilesArray.find(p => p?.status === 'actif' && !p?.deleted) || profilesArray.find(p => !p?.deleted) || null;
  })();

  // Pas de profil
  if (!activeUserProfile) {
    console.log('[HOME] NO ACTIVE PROFILE - rendering RoleSetup');
    return <RoleSetup onComplete={loadUser} />;
  }

  const activeProfileType = activeUserProfile?.profile_type;
  const activeCfg = PROFILE_CFG[activeProfileType] || {};

  // Profil incomplet — forcer complétion
  if (activeUserProfile?.status === 'incomplet') {
    return <IncompleteProfileGuard user={user} profile={activeUserProfile} />;
  }

  // Livreur sans documents
  const livreurHasDocs = !!(activeUserProfile?.documents_json && (() => {
    try { 
      const d = JSON.parse(activeUserProfile.documents_json); 
      return d?.photo_profil && d?.photo_identite_recto; 
    } catch { 
      return false; 
    }
  })());
  if (activeProfileType === 'livreur' && !livreurHasDocs && !user?.docs_envoyes) {
    return <LivreurDocuments onComplete={loadUser} />;
  }

  // Bloqué
  if (activeUserProfile?.status === 'bloque') {
    return <AttentePage profile={activeProfileType} isBlocked={true} blockReason={activeUserProfile?.blocked_reason || ''} />;
  }

  // 🔴 REFUSÉ
  if (activeUserProfile?.status === 'refuse') {
    return <AttentePage profile={activeProfileType} motifRefus={activeUserProfile?.refusal_reason || 'Veuillez corriger votre dossier'} profileId={activeUserProfile?.id} />;
  }

  // En attente validation
  if (['livreur', 'partenaire', 'commercial'].includes(activeProfileType) && activeUserProfile?.status !== 'actif') {
    const hasDocs = !!(activeUserProfile?.documents_json && (() => {
      try { 
        const d = JSON.parse(activeUserProfile.documents_json); 
        return d?.photo_profil; 
      } catch { 
        return false; 
      }
    })());
    return <AttentePage profile={activeProfileType} docsEnvoyes={hasDocs || user?.docs_envoyes} motifRefus={activeUserProfile?.refusal_reason} status={activeUserProfile?.status} />;
  }

  // Render dashboard selon profil
  console.log('[HOME] renderDashboard — activeProfileId:', activeProfileId, '| activeProfileType:', activeProfileType, '| user.current_role:', user?.current_role);
  const renderDashboard = () => {
    console.log('[HOME] Dashboard switch → rendering:', activeProfileType);
    switch (activeProfileType) {
      case 'client':     return <ClientHome user={user} />;
      case 'livreur':    return <LivreurHome user={user} />;
      case 'partenaire': return <DashboardPartenaire user={user} />;
      case 'commercial': return <DashboardCommercial user={user} />;
      case 'annonceur':  return <DashboardAnnonceur user={user} />;
      default:
        console.warn('[HOME] activeProfileType inconnu, fallback client. Valeur:', activeProfileType);
        return <ClientHome user={user} />;
    }
  };

  const activeProfiles = profilesArray.filter(p => p?.status === 'actif');
  const pendingProfiles = profilesArray.filter(p => p?.status === 'en_attente');
  const incompleteProfiles = profilesArray.filter(p => p?.status === 'incomplet');
  console.log('[HOME] FINAL RENDER - active:', activeProfiles.length, 'pending:', pendingProfiles.length, 'incomplete:', incompleteProfiles.length);

  return (
    <div className="space-y-0">
      {/* Bannière notifications */}
      {user && (
        <div className="px-4 pt-4 pb-2">
          <NotificationPermissionBanner />
        </div>
      )}

      {/* Profils en attente */}
       {pendingProfiles.length > 0 && (
        <div className="px-4 pt-4 pb-2">
          <PendingProfiles pendingProfiles={pendingProfiles} onProfileChange={loadUser} />
        </div>
      )}

      {/* Barre profil actif */}
      <div className="flex justify-between items-center px-4 pt-4 pb-2">
        <button
          onClick={() => setShowSwitch(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full border-2 text-sm font-bold transition-all active:scale-95"
          style={{ borderColor: activeCfg.color, color: activeCfg.color, background: activeCfg.color + '15' }}
        >
          <span>{activeCfg.emoji}</span>
          <span>{activeCfg.label}</span>
          <span className="text-xs opacity-50">▼</span>
        </button>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate('/settings')}>
          <User className="h-4 w-4" /> Mon compte
        </Button>
      </div>

      {/* Alerte profil incomplet */}
      {incompleteProfiles.length > 0 && (
        <div className="mx-4 mb-1 flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-300">
          <span className="text-base flex-shrink-0">⚠️</span>
          <div className="flex-1">
            <p className="text-xs font-bold text-amber-800">Profil incomplet</p>
            <p className="text-xs text-amber-700">{incompleteProfiles.map(p => PROFILE_CFG[p?.profile_type]?.label).join(', ')}</p>
          </div>
          <button onClick={() => navigate('/settings')} className="text-xs font-bold text-amber-700 underline flex-shrink-0">Compléter</button>
        </div>
      )}

      {/* Dashboard */}
      {renderDashboard()}

      {/* Modal switch profil */}
      <Dialog open={showSwitch} onOpenChange={setShowSwitch}>
        <DialogContent className="max-w-sm">
          <div>
            <p className="font-bold text-base">Mes profils</p>
            <p className="text-xs text-muted-foreground">Actif: <strong style={{ color: activeCfg.color }}>{activeCfg.emoji} {activeCfg.label}</strong></p>
          </div>

          <div className="space-y-2">
            {profilesArray.map(p => {
              const cfg = PROFILE_CFG[p?.profile_type];
              if (!cfg) return null;
              
              const isCurrent = p?.id === activeProfileId;
              const isUsable = p?.status === 'actif';
              const STATUS_BADGE = {
                actif:      { label: '✓ Actif',      bg: cfg.color, text: 'white' },
                incomplet:  { label: '📋 Incomplet',  bg: '#fef9c3', text: '#92400e' },
                en_attente: { label: '⏳ En attente', bg: '#fef3c7', text: '#92400e' },
                refuse:     { label: '❌ Refusé',     bg: '#fee2e2', text: '#991b1b' },
                suspendu:   { label: '🔒 Suspendu',   bg: '#f3f4f6', text: '#374151' },
              }[p?.status] || { label: p?.status, bg: '#f3f4f6', text: '#374151' };

              return (
                <div
                  key={p?.id}
                  className="flex items-center gap-3 p-3 rounded-xl border-2 transition-all"
                  style={{ borderColor: isCurrent ? cfg.color : '#e5e7eb', background: isCurrent ? cfg.color + '10' : 'white' }}
                >
                  <span className="text-2xl flex-shrink-0">{cfg.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm" style={{ color: cfg.color }}>{cfg.label}</p>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mt-0.5" style={{ background: STATUS_BADGE.bg, color: STATUS_BADGE.text }}>
                      {STATUS_BADGE.label}
                    </span>
                    {p?.status === 'incomplet' && (
                      <p className="text-[10px] text-amber-700 mt-0.5">Documents manquants</p>
                    )}
                  </div>
                  <div className="flex-shrink-0 flex items-center gap-1">
                    {isCurrent && isUsable && (
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full text-white" style={{ background: cfg.color }}>Actif</span>
                    )}
                    {!isCurrent && isUsable && (
                      <button
                        onClick={() => switchProfile(p?.id)}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg border-2 transition-all active:scale-95"
                        style={{ borderColor: cfg.color, color: cfg.color }}
                      >
                        Utiliser
                      </button>
                    )}
                    {p?.status === 'incomplet' && (
                      <button onClick={() => { setShowSwitch(false); navigate(`/complete-profile/${p?.id}`); }} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-amber-500 text-white">
                        Compléter
                      </button>
                    )}
                    {(p?.status === 'en_attente') && (
                      <>
                        <span className="text-[10px] text-amber-600 max-w-[60px] text-center leading-tight">En validation</span>
                        <button onClick={() => setCancelingProfile(p)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                    {p?.status === 'refuse' && (
                      <button onClick={() => setCancelingProfile(p)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {p?.status === 'suspendu' && (
                      <span className="text-[10px] text-gray-500 px-2">Suspendu</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Confirmation annulation */}
          {cancelingProfile && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-300 space-y-2">
              <p className="text-xs font-semibold text-red-700">Annuler {PROFILE_CFG[cancelingProfile?.profile_type]?.label} ?</p>
              <div className="flex gap-2">
                <button onClick={() => setCancelingProfile(null)} className="flex-1 px-2 py-1.5 text-xs rounded-lg bg-white border border-red-300 text-red-600">Garder</button>
                <button
                  onClick={async () => {
                    try {
                      const result = await base44.functions.invoke('cancelProfileRequest', { profile_id: cancelingProfile?.id });
                      if (result?.data?.success) {
                        if (cancelingProfile?.id === activeProfileId) {
                          localStorage.removeItem('activeProfileId');
                          setActiveProfileId(null);
                        }
                        setCancelingProfile(null);
                        setShowSwitch(false);
                        await loadUser();
                      }
                    } catch (err) { 
                      console.error('[Home] Erreur annulation:', err); 
                    }
                  }}
                  className="flex-1 px-2 py-1.5 text-xs rounded-lg bg-red-600 text-white"
                >
                  <Trash2 className="h-3 w-3 inline mr-1" /> Oui
                </button>
              </div>
            </div>
          )}

          <button
            className="w-full py-3 rounded-xl border-2 border-dashed border-primary/40 text-primary text-sm font-bold hover:bg-primary/5"
            onClick={() => { setShowSwitch(false); navigate('/settings'); }}
          >
            ＋ Ajouter
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}