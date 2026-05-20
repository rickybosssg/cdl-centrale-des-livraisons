import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { getActiveProfileType, isAdminUser } from "@/lib/activeProfile";
import AppLayout from "./AppLayout";
import SplashWelcome from "./SplashWelcome";
import RoleSetup from "./RoleSetup";
import PromoCodeStep from "../pages/PromoCodeStep";
import NotificationPermissionBanner from "./NotificationPermissionBanner";
import NewCourseAlert from "./NewCourseAlert";
import ManualDispatchAlertBlock from "./ManualDispatchAlertBlock";
import { useDriverCourseAlert } from "@/hooks/useDriverCourseAlert";
import { useManualDispatchAlert } from "@/hooks/useManualDispatchAlert";
import PermissionsOnboarding, { needsPermissionsOnboarding } from "./PermissionsOnboarding";
import GlobalRealtimeAlert from "./GlobalRealtimeAlert";

// ── Alerte globale livreur — montée UNE SEULE FOIS au niveau layout ───────
function GlobalDriverAlert({ userEmail }) {
  const { alertCourse, clearAlert, user } = useDriverCourseAlert();
  if (!alertCourse) return null;
  return <NewCourseAlert course={alertCourse} onClose={clearAlert} user={user} />;
}

// ── Alerte globale admin (mode manuel) — montée au niveau layout ──────────
// Visible sur TOUTES les pages admin. z-index max, pointer-events réels, safe-area APK.
// CRITIQUE : le hook est TOUJOURS monté (peu importe loading) pour démarrer la subscription immédiatement.
function GlobalAdminAlert() {
  const { shouldDisplay, visibleCourses, handleDismiss, removeCourse } = useManualDispatchAlert();

  // Log quand le bloc devient visible
  useEffect(() => {
    if (shouldDisplay && visibleCourses.length > 0) {
      console.log(`[BLOC_VISIBLE_AT] ${new Date().toISOString()} | ${visibleCourses.length} course(s) affichée(s) | ids:[${visibleCourses.map(c=>c.id).join(',')}]`);
    }
  }, [shouldDisplay, visibleCourses.length]);

  if (!shouldDisplay) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99990,
        padding: "8px 12px 0 12px",
        paddingTop: "max(env(safe-area-inset-top), 8px)",
      }}
    >
      <div style={{ maxWidth: "420px", margin: "0 auto" }}>
        {visibleCourses.slice(0, 3).map(course => (
          <ManualDispatchAlertBlock
            key={course.id}
            course={course}
            onDismiss={() => handleDismiss(course.id)}
            onAssigned={(id) => removeCourse(id)}
          />
        ))}
      </div>
    </div>
  );
}

export default function AppLayoutWrapper({ user }) {
  // ⚠️ Tous les hooks d'abord — jamais après un return conditionnel (Rules of Hooks)
  // Initialiser userRole depuis localStorage immédiatement pour éviter le flash "client"
  const [userRole, setUserRole] = useState(() => {
    try {
      // Lire active_profile_type stocké en session si disponible (plus fiable que localStorage seul)
      const stored = sessionStorage.getItem('cdl_active_role') || localStorage.getItem('cdl_active_role');
      if (stored && ['livreur', 'client', 'partenaire', 'commercial', 'annonceur', 'admin'].includes(stored)) return stored;
    } catch (_) {}
    return "client";
  });
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

        const isAdmin = isAdminUser(me);

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

        if (isAdminUser(me)) {
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
            // P1 : localStorage (switch récent, avant BDD à jour)
            let resolved = storedId ? profs.find(p => p.id === storedId && !p.deleted) : null;
            // P2 : active_profile_type BDD (SOURCE UNIQUE officielle)
            if (!resolved && me.active_profile_type) {
              resolved = profs.find(p => p.profile_type === me.active_profile_type && !p.deleted);
              if (resolved) localStorage.setItem('activeProfileId', resolved.id);
            }
            // P3 : premier profil actif (nouvel utilisateur)
            if (!resolved) {
              resolved = profs.find(p => p.status === 'actif' && !p.deleted) || profs.find(p => !p.deleted);
              if (resolved) localStorage.setItem('activeProfileId', resolved.id);
            }

            const role = resolved?.profile_type || getActiveProfileType(me) || 'client';
            setUserRole(role);
            // Persister le rôle pour initialisation rapide au prochain mount
            try { sessionStorage.setItem('cdl_active_role', role); localStorage.setItem('cdl_active_role', role); } catch (_) {}
          } catch (_) {
            setUserRole(getActiveProfileType(me) || 'client');
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
      } catch (_) {
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
        setUserRole(newRole);
        // Persister pour initialisation rapide au prochain mount
        try { sessionStorage.setItem('cdl_active_role', newRole); localStorage.setItem('cdl_active_role', newRole); } catch (_) {}
      }
    };
    window.addEventListener('cdl_profile_switch', onProfileSwitch);
    return () => window.removeEventListener('cdl_profile_switch', onProfileSwitch);
  }, []);

  // FCM géré par FcmBootstrap (monté dans App.jsx) — indépendant du flux layout

  // CRITIQUE : isAdminEarlyCheck basé sur user (fourni par App.jsx dès le premier render)
  // GlobalAdminAlert est rendu EN DEHORS des return conditionnels pour monter la subscription UNE FOIS
  // immédiatement, sans attendre la fin du loading profil.
  const isAdminEarlyCheck = isAdminUser(user);

  // ── Contenu principal selon l'état de chargement ─────────────────────────
  let mainContent;
  if (loading) {
    mainContent = (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  } else if (needsPromoStep) {
    mainContent = (
      <PromoCodeStep
        onContinue={() => {
          sessionStorage.setItem(`cdl_promo_shown_${user?.id}`, '1');
          setNeedsPromoStep(false);
          setNeedsRole(true);
        }}
      />
    );
  } else if (needsRole) {
    mainContent = (
      <RoleSetup onComplete={async () => {
        setNeedsRole(false);
        try {
          const me = await base44.auth.me();
          if (me?.active_profile_type) setUserRole(me.active_profile_type);
          setUserEmail(me.email);
        } catch (_) {}
        setInitialized(false);
      }} />
    );
  } else if (!userEmail || !userRole) {
    mainContent = (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  } else if (showPermissions) {
    mainContent = <PermissionsOnboarding onDone={() => setShowPermissions(false)} />;
  } else {
    const storedRole = (() => { try { return localStorage.getItem('cdl_active_role') || ''; } catch(_) { return ''; } })();
    const isLivreur = userRole === "livreur" ||
      user?.active_profile_type === "livreur" ||
      user?.current_role === "livreur" ||
      storedRole === "livreur";

    mainContent = (
      <>
        <NotificationPermissionBanner />
        {showSplash && <SplashWelcome prenom={prenom} onDone={() => setShowSplash(false)} />}
        {isLivreur && userEmail && <GlobalDriverAlert userEmail={userEmail} />}
        {/* Alertes temps réel pour tous les rôles (client, livreur, partenaire, commercial, annonceur) */}
        {userEmail && !isAdminEarlyCheck && <GlobalRealtimeAlert userEmail={userEmail} />}
        <AppLayout userRole={userRole} userEmail={userEmail} />
      </>
    );
  }

  return (
    <>
      {/* GlobalAdminAlert monté UNE SEULE FOIS dès que user est admin
          Peu importe loading, needsRole, etc. → subscription active immédiatement */}
      {isAdminEarlyCheck && <GlobalAdminAlert />}
      {/* GlobalRealtimeAlert admin — notifications internes en temps réel */}
      {isAdminEarlyCheck && user?.email && <GlobalRealtimeAlert userEmail={user.email} />}
      {mainContent}
    </>
  );
}