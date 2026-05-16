import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { getActiveProfileType, isAdminUser, logProfileSwitch } from "@/lib/activeProfile";
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

// ADMIN_EMAILS conservé uniquement pour UI cosmétique (badge)
// La vérification d'accès utilise exclusivement isAdminUser(user) → user.role === 'admin'
const ADMIN_EMAILS = ["weezyh2@gmail.com", "admin@cdl.local"];

/**
 * Résoudre le profil actif depuis la liste des profils.
 * Source unique : user.active_profile_type
 * Fallback localStorage UNIQUEMENT pour les switches récents en cours de persistance BDD.
 */
function resolveActiveProfile(profiles, storedId, activeProfileTypeFromUser) {
  if (!Array.isArray(profiles) || profiles.length === 0) return null;

  // Priorité 1 : active_profile_type BDD (source officielle)
  if (activeProfileTypeFromUser) {
    const byActive = profiles.find(p => p?.profile_type === activeProfileTypeFromUser && !p?.deleted);
    if (byActive) {
      if (byActive.id !== storedId) localStorage.setItem('activeProfileId', byActive.id);
      return byActive;
    }
  }
  // Priorité 2 : localStorage (switch récent, avant que BDD soit à jour)
  if (storedId) {
    const byId = profiles.find(p => p?.id === storedId && !p?.deleted);
    if (byId) return byId;
    localStorage.removeItem('activeProfileId');
  }
  // Priorité 3 : premier profil actif (nouvel utilisateur)
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

      const isAdmin = isAdminUser(me);
      console.log(`[PROFILE_SOURCE] loadUser | email=${me.email} | role=${me.role} | active_profile_type=${me.active_profile_type} | isAdmin=${isAdmin}`);

      if (!isAdmin && profsArray.length > 0) {
        // ── RÉSOLUTION DU PROFIL ACTIF ──────────────────────────────────
        // P1 : active_profile_type BDD (SOURCE UNIQUE officielle)
        // P2 : localStorage (switch récent non encore persisté en BDD)
        // P3 : premier profil actif (fallback nouvel utilisateur)
        const currentStoredId = localStorage.getItem('activeProfileId');
        const storedId = activeProfileId || currentStoredId;

        const resolved = resolveActiveProfile(profsArray, storedId, me.active_profile_type);

        if (resolved?.id) {
          localStorage.setItem('activeProfileId', resolved.id);
          setActiveProfileId(resolved.id);
          // Synchroniser active_profile_type en BDD si absent (première connexion)
          if (resolved.profile_type && !me.active_profile_type) {
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

    // 1. Mettre à jour le state local IMMÉDIATEMENT — reflète active_profile_type avant BDD
    localStorage.setItem('activeProfileId', profileId);
    setActiveProfileId(profileId);
    // Mettre à jour active_profile_type localement (sera confirmé par BDD via switchActiveProfile)
    setUser(prev => prev ? { ...prev, active_profile_type: newRole } : prev);
    logProfileSwitch(user?.email, getActiveProfileType(user), newRole, 'Home.switchProfile');

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

  // Admin — source unique: user.role === 'admin'
  const isAdmin = isAdminUser(user);
  console.log('[HOME] IS ADMIN?', isAdmin, '| source=user.role | value=', user?.role);
  if (isAdmin) {
    console.log('[HOME] Rendering AdminDashboardPro');
    return <AdminDashboardPro />;
  }

  const profilesArray = Array.isArray(allProfiles) ? allProfiles : [];

  // ── SOURCE DE VÉRITÉ POUR LE RENDU ──────────────────────────────────────────
  // P1 : activeProfileId local (switch récent, avant BDD à jour)
  // P2 : user.active_profile_type BDD (source officielle)
  // P3 : premier profil actif (fallback)
  const activeUserProfile = (() => {
    // P1 : par ID local (mis à jour instantanément au switch, avant BDD)
    if (activeProfileId) {
      const byId = profilesArray.find(p => p?.id === activeProfileId && !p?.deleted);
      if (byId) return byId;
    }
    // P2 : par active_profile_type BDD (SOURCE UNIQUE officielle)
    if (user?.active_profile_type) {
      const byActive = profilesArray.find(p => p?.profile_type === user.active_profile_type && !p?.deleted);
      if (byActive) return byActive;
    }
    // P3 : fallback premier profil actif (nouvel utilisateur)
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

  // ── DÉCISION ROUTING PROFIL — SOURCE UNIQUE BDD ──────────────────────────────
  // Priorité : activeProfileId local > user.active_profile_type BDD > premier profil actif
  // JAMAIS forcer client par défaut si profil actif = livreur
  const renderDashboard = () => {
    console.log(
      `[PROFILE_ROUTE_DECISION] activeProfileType=${activeProfileType} | activeProfileId=${activeProfileId} | user.active_profile_type=${user?.active_profile_type} | user.email=${user?.email}`
    );
    switch (activeProfileType) {
      case 'client':     
        console.log('[PROFILE_ROUTE_DECISION] → ClientHome');
        return <ClientHome user={user} />;
      case 'livreur':    
        console.log('[PROFILE_ROUTE_DECISION] → LivreurHome');
        return <LivreurHome user={user} />;
      case 'partenaire': 
        console.log('[PROFILE_ROUTE_DECISION] → DashboardPartenaire');
        return <DashboardPartenaire user={user} />;
      case 'commercial': 
        console.log('[PROFILE_ROUTE_DECISION] → DashboardCommercial');
        return <DashboardCommercial user={user} />;
      case 'annonceur':  
        console.log('[PROFILE_ROUTE_DECISION] → DashboardAnnonceur');
        return <DashboardAnnonceur user={user} />;
      default:
        // ⚠️ JAMAIS forcer client si profil BDD dit autrement
        // Si user.active_profile_type est défini, tenter de l'utiliser en fallback
        if (user?.active_profile_type && user.active_profile_type !== activeProfileType) {
          console.warn(`[PROFILE_ROUTE_DECISION] activeProfileType inconnu (${activeProfileType}) mais user.active_profile_type=${user.active_profile_type} — re-résolution`);
          // Re-résoudre depuis BDD
          const byBdd = profilesArray.find(p => p?.profile_type === user.active_profile_type && !p?.deleted);
          if (byBdd) {
            console.log(`[PROFILE_ROUTE_DECISION] Re-résolu depuis BDD → ${user.active_profile_type}`);
            localStorage.setItem('activeProfileId', byBdd.id);
            setActiveProfileId(byBdd.id);
          }
        }
        console.warn(`[PROFILE_ROUTE_DECISION] activeProfileType inconnu: "${activeProfileType}" — FALLBACK client uniquement si aucun profil livreur`);
        // Ne retourner ClientHome que s'il n'y a vraiment pas de profil livreur actif
        const hasLivreurProfile = profilesArray.find(p => p?.profile_type === 'livreur' && p?.status === 'actif' && !p?.deleted);
        if (hasLivreurProfile) {
          console.warn('[PROFILE_ROUTE_DECISION] Profil livreur actif trouvé — routing vers LivreurHome au lieu de client');
          return <LivreurHome user={user} />;
        }
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