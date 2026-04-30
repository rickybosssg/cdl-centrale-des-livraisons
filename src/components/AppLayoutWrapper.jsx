import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import AppLayout from "./AppLayout";
import SplashWelcome from "./SplashWelcome";
import RoleSetup from "./RoleSetup";
import PromoCodeStep from "../pages/PromoCodeStep";
import NotificationPermissionBanner from "./NotificationPermissionBanner";

import PermissionsOnboarding, { needsPermissionsOnboarding, markPermissionsConfigured } from "./PermissionsOnboarding";

// Récupère le token d'auth depuis localStorage pour le fallback APK natif
function getAuthToken() {
  try { return localStorage.getItem('base44_access_token') || ''; } catch (_) { return ''; }
}

export default function AppLayoutWrapper({ user }) {
  // ⚠️ Tous les hooks d'abord — jamais après un return conditionnel (Rules of Hooks)
  const [userRole, setUserRole] = useState("client");
  const [userEmail, setUserEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [prenom, setPrenom] = useState("");
  const [showSplash, setShowSplash] = useState(false);
  const [needsRole, setNeedsRole] = useState(false);
  const [needsPromoStep, setNeedsPromoStep] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [showPermissions, setShowPermissions] = useState(false);

  const userReady = !!user?.email && !!user?.id;

  // LOAD USER — une seule fois
  useEffect(() => {
    if (!userReady || initialized) return;
    
    let isMounted = true;
    const load = async () => {
      try {
        const me = user; // On a déjà le user depuis le parent
        if (!isMounted) return;

        const ADMIN_EMAILS = ['weezyh2@gmail.com'];
        const isAdmin = me.role === 'admin' || ADMIN_EMAILS.includes(me.email);

        // Vérifier si nouvel user (pas de profil)
        if (!isAdmin) {
          try {
            const existingProfiles = await base44.entities.UserProfile.filter({ user_email: me.email, deleted: false });
            if (!isMounted) return;
            if (existingProfiles.length === 0) {
              // Nouvel utilisateur : afficher d'abord l'étape code promo
              const promoShown = sessionStorage.getItem(`cdl_promo_shown_${me.id}`);
              if (!promoShown) {
                setNeedsPromoStep(true);
              } else {
                setNeedsRole(true);
              }
              setLoading(false);
              setInitialized(true);
              return;
            }
          } catch (_) {
            setNeedsRole(true);
            setLoading(false);
            setInitialized(true);
            return;
          }
        }

        if (me.email === 'weezyh2@gmail.com' || me.role === 'admin') {
          setUserRole('admin');
        } else {
          // ── SOURCE DE VÉRITÉ UNIQUE : activeProfileId localStorage → UserProfile ──
          // Home.jsx gère le switch et écrit activeProfileId dans localStorage.
          // AppLayoutWrapper lit simplement cette valeur pour initialiser le menu.
          // On NE corrige JAMAIS current_role ici pour éviter les race conditions.
          try {
            const profs = await base44.entities.UserProfile.filter({ user_email: me.email, deleted: false });
            if (!isMounted) return;

            const storedId = localStorage.getItem('activeProfileId');
            // P1 : profil mémorisé dans localStorage (mis à jour par Home au switch)
            let resolved = storedId ? profs.find(p => p.id === storedId && !p.deleted) : null;
            // P2 : current_role en BDD
            if (!resolved && (me.current_role || me.active_profile_type)) {
              const trueRole = me.current_role || me.active_profile_type;
              resolved = profs.find(p => p.profile_type === trueRole && !p.deleted);
              if (resolved) localStorage.setItem('activeProfileId', resolved.id);
            }
            // P3 : premier profil actif
            if (!resolved) {
              resolved = profs.find(p => p.status === 'actif' && !p.deleted) || profs.find(p => !p.deleted);
              if (resolved) localStorage.setItem('activeProfileId', resolved.id);
            }

            setUserRole(resolved?.profile_type || me.current_role || 'client');
          } catch (_) {
            setUserRole(me.current_role || me.active_profile_type || 'client');
          }
        }

        if (!isMounted) return;
        setUserEmail(me.email);
        const firstName = me.full_name?.split(' ')[0] || '';
        setPrenom(firstName);

        // Afficher splash bienvenue une seule fois par session
        const splashKey = `splash_shown_${me.id}`;
        if (!sessionStorage.getItem(splashKey)) {
          sessionStorage.setItem(splashKey, '1');
          setShowSplash(true);
        }

        // Demander les permissions au premier lancement (après le splash)
        if (needsPermissionsOnboarding()) {
          setShowPermissions(true);
        }
      } catch (error) {
        console.error('[AppLayoutWrapper] Load error:', error);
        if (isMounted) setLoading(false);
        return;
      } finally {
        if (isMounted) {
          setLoading(false);
          setInitialized(true);
        }
      }
    };

    load();
    return () => { isMounted = false; };
  }, [initialized, userReady]);

  // Navigation depuis notifications push
  useEffect(() => {
    const onCdlNavigate = (e) => {
      const route = e.detail?.route;
      if (route && route.startsWith('/')) {
        try { sessionStorage.setItem('cdl_notif_route', route); } catch (_) {}
        window.history.pushState({}, '', route);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    };
    window.addEventListener('cdl_navigate', onCdlNavigate);
    return () => window.removeEventListener('cdl_navigate', onCdlNavigate);
  }, []);

  // ── Changement de profil instantané ─────────────────────────────────────────
  // Home.jsx dispatch cet event après avoir mis à jour localStorage + state local
  useEffect(() => {
    const onProfileSwitch = (e) => {
      const newRole = e.detail?.role;
      if (newRole) {
        console.log('[AppLayoutWrapper] Profile switch →', newRole);
        setUserRole(newRole);
      }
    };
    window.addEventListener('cdl_profile_switch', onProfileSwitch);
    return () => window.removeEventListener('cdl_profile_switch', onProfileSwitch);
  }, []);

  // FCM géré par FcmBootstrap (monté dans App.jsx) — indépendant du flux layout

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (needsPromoStep) {
    return (
      <PromoCodeStep
        onContinue={() => {
          sessionStorage.setItem(`cdl_promo_shown_${user?.id}`, '1');
          setNeedsPromoStep(false);
          setNeedsRole(true);
        }}
      />
    );
  }

  // RoleSetup en cours — onComplete recharge le user
  if (needsRole) {
    return <RoleSetup onComplete={async () => {
      setNeedsRole(false);
      // Relire le user depuis la BDD pour avoir current_role à jour
      try {
        const me = await base44.auth.me();
        if (me?.current_role) setUserRole(me.current_role);
        setUserEmail(me.email);
      } catch (_) {}
      setInitialized(false); // Re-déclenche le useEffect principal
    }} />;
  }



  // ⚠️ Double-check : userEmail et userRole prêts avant render
  if (!userEmail || !userRole) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      <NotificationPermissionBanner />
      {showSplash && (
        <SplashWelcome prenom={prenom} onDone={() => setShowSplash(false)} />
      )}
      {showPermissions && !showSplash && (
        <PermissionsOnboarding onDone={() => setShowPermissions(false)} />
      )}
      <AppLayout userRole={userRole} userEmail={userEmail} />
    </>
  );
}