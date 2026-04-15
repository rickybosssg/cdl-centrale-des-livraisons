import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { registerSW } from "@/lib/swRegister";
import AppLayout from "./AppLayout";
import SplashWelcome from "./SplashWelcome";
import RoleSetup from "./RoleSetup";
import NotificationPermissionBanner from "./NotificationPermissionBanner";

export default function AppLayoutWrapper({ user }) {
  // ⚠️ Tous les hooks d'abord — jamais après un return conditionnel (Rules of Hooks)
  const [userRole, setUserRole] = useState("client");
  const [userEmail, setUserEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [prenom, setPrenom] = useState("");
  const [showSplash, setShowSplash] = useState(false);
  const [needsRole, setNeedsRole] = useState(false);
  const [initialized, setInitialized] = useState(false);

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

        if (!isAdmin && (!me.user_type && !me.active_profile_type)) {
          try {
            const existingProfiles = await base44.entities.UserProfile.filter({ user_email: me.email, deleted: false });
            if (!isMounted) return;
            if (existingProfiles.length === 0) {
              setNeedsRole(true);
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
          // ── SOURCE DE VÉRITÉ : current_role en BDD ─────────────────────
          // Ne jamais utiliser le localStorage seul pour déterminer le rôle affiché.
          // current_role BDD est la vérité absolue.
          const trueRole = me.current_role || me.active_profile_type;

          try {
            const profs = await base44.entities.UserProfile.filter({ user_email: me.email, deleted: false });
            if (!isMounted) return;

            if (trueRole) {
              // Trouver le profil UserProfile correspondant au current_role BDD
              const matchingProf = profs.find(p => p.profile_type === trueRole && !p.deleted);
              if (matchingProf) {
                setUserRole(trueRole);
                localStorage.setItem('activeProfileId', matchingProf.id);
              } else {
                // current_role pointe vers un profil inexistant → corriger
                const fallback = profs.find(p => p.status === 'actif') || profs[0];
                if (fallback) {
                  setUserRole(fallback.profile_type);
                  localStorage.setItem('activeProfileId', fallback.id);
                  base44.functions.invoke('switchActiveProfile', { profile_type: fallback.profile_type }).catch(() => {});
                } else {
                  setUserRole(trueRole);
                }
              }
            } else {
              // Pas de current_role → fallback localStorage puis premier profil actif
              const storedId = localStorage.getItem('activeProfileId');
              const fallback = profs.find(p => p.id === storedId) || profs.find(p => p.status === 'actif') || profs[0];
              if (fallback) {
                setUserRole(fallback.profile_type);
                localStorage.setItem('activeProfileId', fallback.id);
                base44.functions.invoke('switchActiveProfile', { profile_type: fallback.profile_type }).catch(() => {});
              } else {
                setUserRole('client');
              }
            }
          } catch (_) {
            setUserRole(trueRole || 'client');
          }
        }

        if (!isMounted) return;
        setUserEmail(me.email);
        const firstName = me.full_name?.split(' ')[0] || '';
        setPrenom(firstName);

        const key = `splash_shown_${me.id}`;
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, '1');
          setShowSplash(true);
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

  // Service Worker minimal — étape 1 du setup FCM
  useEffect(() => {
    console.log('[AppLayoutWrapper] Enregistrement SW minimal');
    registerSW().then(reg => {
      if (reg) {
        console.log('[AppLayoutWrapper] ✅ SW enregistré avec succès');
      }
    }).catch(err => {
      console.error('[AppLayoutWrapper] ❌ Erreur SW:', err);
    });
  }, []);

  // FCM — détection native (APK) vs web (PWA)
  useEffect(() => {
    let nativeCleanup = null;

    const initFcm = async () => {
      try {
        const { isNativeApp, initCapacitorPush } = await import('@/lib/nativePush');

        // ── CAS 1 : APK Android (Capacitor natif) ──────────────────────────
        if (isNativeApp()) {
          console.log('[AppLayoutWrapper FCM] 🔴 Mode natif Capacitor détecté');
          const { cleanup, permissionStatus } = await initCapacitorPush({

            onToken: async (token) => {
              console.log('[AppLayoutWrapper FCM] 🟡 Token reçu du callback onToken');
              console.log('[AppLayoutWrapper FCM] Token (256 chars):', token?.substring(0, 256));
              
              if (!token) {
                console.error('[AppLayoutWrapper FCM] ❌ Token vide/undefined!');
                return;
              }

              try {
                // Récupérer le user actuel pour passer userId et role
                const me = await base44.auth.me();
                console.log('[AppLayoutWrapper FCM] 🔵 User courant:', me?.email, '| role:', me?.role);
                console.log('[AppLayoutWrapper FCM] 🔵 Appel saveFcmToken avec token + userId + role...');
                
                const res = await base44.functions.invoke('saveFcmToken', {
                  token,
                  userId: me?.id,
                  userEmail: me?.email,
                  userRole: me?.role,
                });
                
                console.log('[AppLayoutWrapper FCM] ✅ TOKEN ENREGISTRÉ EN BDD:');
                console.log('   - token_id:', res.data?.token_id);
                console.log('   - success:', res.data?.success);
                console.log('   - message:', res.data?.message);
              } catch (e) {
                console.error('[AppLayoutWrapper FCM] ❌ ERREUR saveFcmToken:');
                console.error('   - message:', e?.message);
                console.error('   - code:', e?.code);
                console.error('   - response:', e?.response?.data);
              }
            },

            onForegroundNotif: (notification) => {
              // App ouverte → toast avec navigation React Router (pas window.location)
              const data = notification.data || {};
              const route = data.notif_route || data.route || data.target_screen || null;
              console.log('[AppLayoutWrapper FCM] Foreground notification:', notification.title, '→', route);
              import('sonner').then(({ toast }) => {
                toast(notification.title || 'CDL', {
                  description: notification.body || '',
                  duration: 8000,
                  action: route ? {
                    label: 'Voir',
                    onClick: () => {
                      window.dispatchEvent(new CustomEvent('cdl_navigate', { detail: { route } }));
                    },
                  } : undefined,
                });
              });
              if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            },

            onNotificationTap: ({ route, data }) => {
              console.log('[AppLayoutWrapper FCM] Tap notification → route:', route);
              if (route && route.startsWith('/')) {
                window.dispatchEvent(new CustomEvent('cdl_navigate', { detail: { route } }));
              }
            },

            onPermissionDenied: (reason) => {
              console.warn('[AppLayoutWrapper FCM] Permission notifications refusée:', reason);
            },
          });

          nativeCleanup = cleanup;
          console.log('[AppLayoutWrapper FCM] ✅ Init Capacitor terminée, permission:', permissionStatus);
          return;
        }

        console.log('[AppLayoutWrapper FCM] Mode web détecté');

      } catch (err) {
        console.error('[AppLayoutWrapper FCM] Init error:', err?.message, err);
      }
    };

    initFcm();

    // Écouter les événements de navigation CDL (depuis notifications)
    const onCdlNavigate = (e) => {
      const route = e.detail?.route;
      if (route && route.startsWith('/')) {
        try { sessionStorage.setItem('cdl_notif_route', route); } catch (_) {}
        window.history.pushState({}, '', route);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    };
    window.addEventListener('cdl_navigate', onCdlNavigate);

    return () => {
      if (nativeCleanup) nativeCleanup();
      window.removeEventListener('cdl_navigate', onCdlNavigate);
    };
  }, []);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (needsRole) {
    return <RoleSetup onComplete={() => { window.location.reload(); }} />;
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
      <AppLayout userRole={userRole} userEmail={userEmail} />
    </>
  );
}