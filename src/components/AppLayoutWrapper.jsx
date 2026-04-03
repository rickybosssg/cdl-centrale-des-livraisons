import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import AppLayout from "./AppLayout";
import SplashWelcome from "./SplashWelcome";
import RoleSetup from "./RoleSetup";

export default function AppLayoutWrapper({ user }) {
  // ⚠️ GUARD STRICTE LIGNE 1 : si pas de user complet, retour immédiat
  if (!user?.email || !user?.id) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const [userRole, setUserRole] = useState("client");
  const [userEmail, setUserEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [prenom, setPrenom] = useState("");
  const [showSplash, setShowSplash] = useState(false);
  const [needsRole, setNeedsRole] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // LOAD USER — une seule fois
  useEffect(() => {
    if (initialized) return;
    
    let isMounted = true;
    const load = async () => {
      try {
        console.log('[AppLayoutWrapper] Starting load');
        const me = await base44.auth.me();
        if (!isMounted) { console.log('[AppLayoutWrapper] Unmounted, skipping setState'); return; }
        if (!me) {
          setLoading(false);
          return;
        }

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

        if (me.email === "weezyh2@gmail.com" || me.role === 'admin') {
          setUserRole("admin");
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
              setUserRole(me.user_type || "client");
            }
          } catch (_) {
            setUserRole(me.user_type || "client");
          }
        }

        if (!isMounted) return;
        setUserEmail(me.email);
        const firstName = me.full_name?.split(" ")[0] || "";
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
  }, [initialized]);

  // FCM — séparé et sans dépendance
  useEffect(() => {
    const initFcm = async () => {
      try {
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