import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
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

  // FCM — lancé seulement quand le user est authentifié
  useEffect(() => {
    // Navigation CDL depuis notifications
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

  useEffect(() => {
    // Attendre que userEmail soit disponible (user authentifié) avant de lancer FCM
    if (!userEmail) return;

    const initFcm = async () => {
      try {
        const isNative =
          window.location?.protocol === 'capacitor:' ||
          typeof window.Capacitor !== 'undefined';

        console.log('[FCM] Init | isNative:', isNative, '| user:', userEmail);

        if (isNative) {
          const { initCapacitorPush } = await import('@/lib/nativePush');

          await initCapacitorPush({
            onToken: async (token) => {
              console.log('[FCM] ✅ TOKEN GENERATED (android_native):', token.substring(0, 30) + '...');
              try {
                const res = await base44.functions.invoke('saveFcmToken', {
                  token,
                  deviceType: 'android_native',
                });
                console.log('[FCM] ✅ TOKEN SAVED:', res.data?.action, '| user:', userEmail);
              } catch (saveErr) {
                console.error('[FCM] ❌ saveFcmToken error:', saveErr?.message);
              }
            },
            onForegroundNotif: (notification) => {
              console.log('[FCM] 📬 NOTIFICATION RECEIVED (foreground):', notification.title);
              const route = notification.data?.notif_route || notification.data?.route || null;
              import('sonner').then(({ toast }) => {
                toast(notification.title || 'CDL', {
                  description: notification.body || '',
                  duration: 8000,
                  action: route ? {
                    label: 'Voir',
                    onClick: () => window.dispatchEvent(new CustomEvent('cdl_navigate', { detail: { route } })),
                  } : undefined,
                });
              });
              if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            },
            onNotificationTap: ({ route }) => {
              console.log('[FCM] 👆 NOTIFICATION TAP → route:', route);
              if (route) window.dispatchEvent(new CustomEvent('cdl_navigate', { detail: { route } }));
            },
            onPermissionDenied: (reason) => {
              console.warn('[FCM] ⚠️ Permission refusée:', reason);
            },
          });

        } else {
          // Web Push (PWA / navigateur)
          console.log('[FCM] Mode Web Push');
          const { registerSW } = await import('@/lib/swRegister');
          await registerSW();

          const { requestWebPushToken, onForegroundMessage } = await import('@/lib/webPush');
          const { token, permission, error } = await requestWebPushToken();

          if (!token) {
            console.warn('[FCM] Pas de token web — permission:', permission, error);
            return;
          }

          try {
            const res = await base44.functions.invoke('saveFcmToken', { token, deviceType: 'web' });
            console.log('[FCM] ✅ TOKEN SAVED (web):', res.data?.action);
          } catch (saveErr) {
            console.error('[FCM] ❌ saveFcmToken web error:', saveErr?.message);
          }

          onForegroundMessage((payload) => {
            console.log('[FCM] 📬 NOTIFICATION RECEIVED (web foreground):', payload.notification?.title);
            const notif = payload.notification || {};
            const data = payload.data || {};
            const route = data.notif_route || data.route || data.target_screen || null;
            import('sonner').then(({ toast }) => {
              toast(notif.title || 'CDL', {
                description: notif.body || '',
                duration: 8000,
                action: route ? {
                  label: 'Voir',
                  onClick: () => window.dispatchEvent(new CustomEvent('cdl_navigate', { detail: { route } })),
                } : undefined,
              });
            });
          });
        }
      } catch (err) {
        console.error('[FCM] Init error (non-fatal):', err?.message);
      }
    };

    initFcm();
  }, [userEmail]); // ← se relance uniquement quand le user est prêt

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