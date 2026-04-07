import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import AppLayout from "./AppLayout";
import SplashWelcome from "./SplashWelcome";
import RoleSetup from "./RoleSetup";

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
          const storedId = localStorage.getItem('activeProfileId');
          try {
            const profs = await base44.entities.UserProfile.filter({ user_email: me.email, deleted: false });
            if (!isMounted) return;
            const activeProf = profs.find(p => p.id === storedId) || profs.find(p => p.status === 'actif') || profs[0];
            if (activeProf) {
              setUserRole(activeProf.profile_type);
              localStorage.setItem('activeProfileId', activeProf.id);
            } else {
              setUserRole(me.user_type || 'client');
            }
          } catch (_) {
            setUserRole(me.user_type || 'client');
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

  // FCM — détection native (APK) vs web (PWA)
  useEffect(() => {
    const initFcm = async () => {
      try {
        // ── CAS 1 : APK Android (Capacitor natif) ──────────────────────
        const { isNativeApp, initCapacitorPush } = await import('@/lib/nativePush');
        if (isNativeApp()) {
          console.log('[FCM] Mode natif Capacitor détecté');
          await initCapacitorPush({
            onToken: (token) => {
              // Sauvegarder le token FCM natif en backend
              base44.functions.invoke('saveFcmToken', { token }).catch(() => {});
            },
            onForegroundNotif: (notification) => {
              // App ouverte : afficher un toast avec lien
              const data = notification.data || {};
              const route = data.notif_route || data.route || data.target_screen;
              import('sonner').then(({ toast }) => {
                toast(notification.title || 'CDL', {
                  description: notification.body || '',
                  duration: 8000,
                  action: route ? {
                    label: 'Voir',
                    onClick: () => window.location.hash = route,
                  } : undefined,
                });
              });
              if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            },
            onNotificationTap: ({ route }) => {
              // Tap depuis background/app fermée → naviguer
              if (route && route.startsWith('/')) {
                // Stocker pour que FcmDeepLinkHandler le récupère
                sessionStorage.setItem('cdl_notif_route', route);
                window.location.reload();
              }
            },
          });
          return; // Ne pas initialiser le SW web si natif
        }

        // ── CAS 2 : Navigateur web (PWA / dev) ─────────────────────────
        if (typeof window === 'undefined' || !('Notification' in window)) return;
        const mod = await import('@/lib/pushNotifications');
        if (!mod?.requestNotificationPermission) return;
        const permitted = await mod.requestNotificationPermission();
        if (!permitted) return;
        const token = await mod.registerFcmToken();
        if (token) {
          base44.functions.invoke('saveFcmToken', { token }).catch(() => {});
        }
      } catch (err) {
        console.debug('[FCM] Init error:', err?.message);
      }
    };
    initFcm();
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
      {showSplash && (
        <SplashWelcome prenom={prenom} onDone={() => setShowSplash(false)} />
      )}
      <AppLayout userRole={userRole} userEmail={userEmail} />
    </>
  );
}