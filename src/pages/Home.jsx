import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { User, Trash2 } from "lucide-react";
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
  if (user.role === 'admin' || user.user_type === 'admin') return true;
  return ADMIN_EMAILS.includes(user.email);
};

// SOURCE DE VÉRITÉ : retourne toujours un profil valide
function resolveActiveProfile(profiles, storedId) {
  if (!profiles || profiles.length === 0) return null;
  if (storedId) {
    const byId = profiles.find(p => p.id === storedId);
    if (byId) return byId;
    // ID invalide → nettoyer localStorage
    localStorage.removeItem('activeProfileId');
  }
  // Fallback garanti : premier profil actif, sinon le premier disponible
  const fallback = profiles.find(p => p.status === 'actif') || profiles[0];
  if (fallback) localStorage.setItem('activeProfileId', fallback.id);
  return fallback;
}

const PROFILE_CFG = {
  admin:      { label: 'Administrateur', emoji: '🛡️', color: '#1e40af' },
  client:     { label: 'Client',         emoji: '👤', color: '#3b82f6' },
  livreur:    { label: 'Livreur',        emoji: '🛵', color: '#22c55e' },
  partenaire: { label: 'Partenaire',     emoji: '🏪', color: '#a855f7' },
  commercial: { label: 'Commercial',     emoji: '📣', color: '#f97316' },
};

export default function Home() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [allProfiles, setAllProfiles] = useState([]);
  const [activeProfileId, setActiveProfileId] = useState(() => localStorage.getItem('activeProfileId'));
  const [showSwitch, setShowSwitch] = useState(false);
  const [cancelingProfile, setCancelingProfile] = useState(null);

  const loadUser = async () => {
    const me = await base44.auth.me();
    setUser(me);
    try {
      const profs = await base44.entities.UserProfile.filter({ user_email: me.email, deleted: false });
      setAllProfiles(profs);
      // Initialiser activeProfileId si absent ou invalide
      const storedId = localStorage.getItem('activeProfileId');
      if (!storedId || !profs.find(p => p.id === storedId)) {
        const resolved = resolveActiveProfile(profs, null);
        if (resolved) {
          localStorage.setItem('activeProfileId', resolved.id);
          setActiveProfileId(resolved.id);
        }
      }
    } catch (err) {
      console.error('[Home] Erreur chargement profils:', err);
    }
    setLoading(false);
  };

  // Switch profil : sync serveur + reload pour rafraîchir nav bar
  const switchProfile = (profileId) => {
    localStorage.setItem('activeProfileId', profileId);
    setShowSwitch(false);
    const prof = allProfiles.find(p => p.id === profileId);
    if (prof) {
      base44.functions.invoke('switchActiveProfile', { profile_type: prof.profile_type }).catch(() => {});
    }
    // Reload pour que AppLayoutWrapper (nav bar) se mette à jour avec le nouveau profil
    setTimeout(() => { window.location.href = '/'; }, 200);
  };

  useEffect(() => {
    if (isAuthenticated) loadUser();
    else { navigate('/'); setLoading(false); }
  }, [isAuthenticated]);

  // Temps réel : mise à jour locale des profils
  useEffect(() => {
    if (!user) return;
    const unsubscribe = base44.entities.UserProfile.subscribe((event) => {
      if (event.data?.user_email === user.email && !event.data?.deleted) {
        setAllProfiles(prev => {
          if (event.type === 'delete') return prev.filter(p => p.id !== event.id);
          const exists = prev.find(p => p.id === event.id);
          if (exists) return prev.map(p => p.id === event.id ? event.data : p);
          return [...prev, event.data];
        });
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

  // Admin → dashboard admin
  const isAdmin = isUserAdmin(user);
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

  // SOURCE DE VÉRITÉ UNIQUE : profil via son ID
  const activeUserProfile = resolveActiveProfile(allProfiles, activeProfileId);

  // Sync localStorage si le profil résolu a changé (ex: profil supprimé)
  if (activeUserProfile && activeUserProfile.id !== activeProfileId) {
    localStorage.setItem('activeProfileId', activeUserProfile.id);
  }

  // Aucun profil → inscription
  if (!activeUserProfile) {
    return <RoleSetup onComplete={loadUser} />;
  }

  const activeProfileType = activeUserProfile.profile_type;
  const activeCfg = PROFILE_CFG[activeProfileType] || {};

  // Livreur sans documents
  const livreurHasDocs = !!(activeUserProfile.documents_json && (() => {
    try { const d = JSON.parse(activeUserProfile.documents_json); return d.photo_profil && d.photo_identite_recto; } catch { return false; }
  })());
  if (activeProfileType === 'livreur' && !livreurHasDocs && !user.docs_envoyes) {
    return <LivreurDocuments onComplete={loadUser} />;
  }

  // Compte bloqué
  if (activeUserProfile.status === 'bloque') {
    return <AttentePage profile={activeProfileType} isBlocked={true} blockReason={activeUserProfile.blocked_reason || ''} />;
  }

  // Profil nécessitant validation, non encore validé
  if (['livreur', 'partenaire', 'commercial'].includes(activeProfileType) && activeUserProfile.status !== 'actif') {
    const hasDocs = !!(activeUserProfile.documents_json && (() => {
      try { const d = JSON.parse(activeUserProfile.documents_json); return d.photo_profil; } catch { return false; }
    })());
    return <AttentePage profile={activeProfileType} docsEnvoyes={hasDocs || user.docs_envoyes} motifRefus={activeUserProfile.refusal_reason} status={activeUserProfile.status} />;
  }

  // Dashboard selon le profil actif
  const renderDashboard = () => {
    switch (activeProfileType) {
      case 'client':     return <ClientHome user={user} />;
      case 'livreur':    return <LivreurHome user={user} />;
      case 'partenaire': return <DashboardPartenaire user={user} />;
      case 'commercial': return <DashboardCommercial user={user} />;
      default:           return <ClientHome user={user} />;
    }
  };

  const activeProfiles = allProfiles.filter(p => p.status === 'actif');
  const otherProfiles = allProfiles.filter(p => p.status !== 'actif');
  const hasMultipleActive = activeProfiles.length > 1;
  const incompleteProfiles = allProfiles.filter(p => p.status === 'incomplet');

  return (
    <div className="space-y-0">
      {/* Profils en attente */}
      {allProfiles.filter(p => p.status === 'en_attente').length > 0 && (
        <div className="px-4 pt-4 pb-2">
          <PendingProfiles pendingProfiles={allProfiles.filter(p => p.status === 'en_attente')} onProfileChange={loadUser} />
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
            <p className="text-xs text-amber-700">{incompleteProfiles.map(p => PROFILE_CFG[p.profile_type]?.label).join(', ')} — complétez vos documents pour accéder aux fonctionnalités</p>
          </div>
          <button onClick={() => navigate('/settings')} className="text-xs font-bold text-amber-700 underline flex-shrink-0">Compléter</button>
        </div>
      )}

      {renderDashboard()}

      {/* Modal switch profil */}
      <Dialog open={showSwitch} onOpenChange={setShowSwitch}>
        <DialogContent className="max-w-sm">
          <div>
            <p className="font-bold text-base">Mes profils</p>
            <p className="text-xs text-muted-foreground">Profil actif : <strong style={{ color: activeCfg.color }}>{activeCfg.emoji} {activeCfg.label}</strong></p>
          </div>

          {/* Tous les profils */}
          <div className="space-y-2">
            {allProfiles.map(p => {
              const cfg = PROFILE_CFG[p.profile_type];
              if (!cfg) return null;
              const isCurrent = p.id === activeProfileId;
              const isUsable = p.status === 'actif';
              const STATUS_BADGE = {
                actif:      { label: '✓ Actif',      bg: cfg.color, text: 'white' },
                incomplet:  { label: '📋 Incomplet',  bg: '#fef9c3', text: '#92400e' },
                en_attente: { label: '⏳ En attente', bg: '#fef3c7', text: '#92400e' },
                refuse:     { label: '❌ Refusé',     bg: '#fee2e2', text: '#991b1b' },
                suspendu:   { label: '🔒 Suspendu',   bg: '#f3f4f6', text: '#374151' },
              }[p.status] || { label: p.status, bg: '#f3f4f6', text: '#374151' };
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-3 p-3 rounded-xl border-2 transition-all"
                  style={{ borderColor: isCurrent ? cfg.color : '#e5e7eb', background: isCurrent ? cfg.color + '10' : 'white' }}
                >
                  <span className="text-2xl flex-shrink-0">{cfg.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm" style={{ color: cfg.color }}>{cfg.label}</p>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mt-0.5" style={{ background: STATUS_BADGE.bg, color: STATUS_BADGE.text }}>
                      {STATUS_BADGE.label}
                    </span>
                    {p.status === 'incomplet' && (
                      <p className="text-[10px] text-amber-700 mt-0.5">Documents manquants — complétez pour activer</p>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    {isCurrent && isUsable && (
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full text-white" style={{ background: cfg.color }}>Actif</span>
                    )}
                    {!isCurrent && isUsable && (
                      <button
                        onClick={() => switchProfile(p.id)}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg border-2 transition-all active:scale-95"
                        style={{ borderColor: cfg.color, color: cfg.color }}
                      >
                        Utiliser
                      </button>
                    )}
                    {p.status === 'incomplet' && (
                      <button onClick={() => { setShowSwitch(false); navigate('/settings'); }} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-amber-500 text-white">
                        Compléter
                      </button>
                    )}
                    {(p.status === 'en_attente' || p.status === 'refuse') && (
                      <button onClick={() => setCancelingProfile(p)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {p.status === 'suspendu' && (
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
              <p className="text-xs font-semibold text-red-700">Annuler la demande {PROFILE_CFG[cancelingProfile.profile_type]?.label} ?</p>
              <div className="flex gap-2">
                <button onClick={() => setCancelingProfile(null)} className="flex-1 px-2 py-1.5 text-xs rounded-lg bg-white border border-red-300 text-red-600">Garder</button>
                <button
                  onClick={async () => {
                    try {
                      const result = await base44.functions.invoke('cancelProfileRequest', { profile_id: cancelingProfile.id });
                      if (result.data?.success) {
                        // Si on supprime le profil actif, nettoyer le localStorage
                        if (cancelingProfile.id === activeProfileId) {
                          localStorage.removeItem('activeProfileId');
                          setActiveProfileId(null);
                        }
                        setCancelingProfile(null);
                        setShowSwitch(false);
                        await loadUser();
                      }
                    } catch (err) { console.error('[Home] Erreur annulation:', err); }
                  }}
                  className="flex-1 px-2 py-1.5 text-xs rounded-lg bg-red-600 text-white"
                >
                  <Trash2 className="h-3 w-3 inline mr-1" /> Oui, annuler
                </button>
              </div>
            </div>
          )}

          <button
            className="w-full py-3 rounded-xl border-2 border-dashed border-primary/40 text-primary text-sm font-bold hover:bg-primary/5 transition-colors"
            onClick={() => { setShowSwitch(false); navigate('/settings'); }}
          >
            ＋ Ajouter un profil
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}