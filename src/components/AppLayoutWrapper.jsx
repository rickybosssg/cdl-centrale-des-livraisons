import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import AppLayout from "./AppLayout";
import SplashWelcome from "./SplashWelcome";
import RoleSetup from "./RoleSetup";

export default function AppLayoutWrapper({ user }) {
  const [userRole, setUserRole] = useState("client");
  const [userEmail, setUserEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [prenom, setPrenom] = useState("");
  const [showSplash, setShowSplash] = useState(false);
  const [needsRole, setNeedsRole] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const me = await base44.auth.me();
        const ADMIN_EMAILS = ['weezyh2@gmail.com'];
        const isAdmin = me.role === 'admin' || ADMIN_EMAILS.includes(me.email);

        if (!isAdmin) {
          // CAS 1 : pas de rôle → vérifier d'abord si un UserProfile existe
          if (!me.user_type && !me.active_profile_type) {
            // Vérifier si l'utilisateur a déjà des profils dans UserProfile
            try {
              const existingProfiles = await base44.entities.UserProfile.filter({ user_email: me.email, deleted: false });
              if (existingProfiles.length > 0) {
                // Il a des profils, auto-réparer user_type depuis le premier profil actif
                const actif = existingProfiles.find(p => p.status === 'actif') || existingProfiles[0];
                await base44.auth.updateMe({ user_type: actif.profile_type, active_profile_type: actif.profile_type, onboarding_completed: true });
              } else {
                setNeedsRole(true);
                setLoading(false);
                return;
              }
            } catch (_) {
              setNeedsRole(true);
              setLoading(false);
              return;
            }
          }

          // CAS 2 : rôle présent mais onboarding non terminé OU fiche métier potentiellement absente
          // → appeler ensureUserProfile qui créera la fiche si elle manque
          // Forcer onboarding_completed=true pour réparer les anciens comptes sans bloquer
          try {
            const result = await base44.functions.invoke('ensureUserProfile', {
              user_type: me.user_type,
              onboarding_completed: true,
              context: 'login',
            });
            // Si le serveur répond needs_onboarding ET qu'il n'y a vraiment pas de user_type → bloquer
            if (result?.data?.needs_onboarding && !me.user_type) {
              setNeedsRole(true);
              setLoading(false);
              return;
            }
          } catch (_) {}

          // Marquer onboarding terminé si nécessaire (réparation silencieuse)
          if (!me.onboarding_completed) {
            try { await base44.entities.User.update(me.id, { onboarding_completed: true }); } catch (_) {}
          }
        }

        if (me.email === "weezyh2@gmail.com" || me.role === 'admin') {
          setUserRole("admin");
        } else {
          // SOURCE DE VÉRITÉ : activeProfileId dans localStorage
          const storedId = localStorage.getItem('activeProfileId');
          try {
            const profs = await base44.entities.UserProfile.filter({ user_email: me.email, deleted: false });
            let activeProf = profs.find(p => p.id === storedId);
            if (!activeProf) activeProf = profs.find(p => p.status === 'actif') || profs[0];
            if (activeProf) {
              if (!storedId || storedId !== activeProf.id) {
                localStorage.setItem('activeProfileId', activeProf.id);
              }
              setUserRole(activeProf.profile_type);
            } else {
              setUserRole(me.user_type || "client");
            }
          } catch (_) {
            setUserRole(me.active_profile_type || me.user_type || "client");
          }
        }
        window.__cdl_user_email = me.email;
        const firstName = me.full_name?.split(" ")[0] || "";
        setPrenom(firstName);
        setUserEmail(me.email);
        const key = `splash_shown_${me.id}`;
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, '1');
          setShowSplash(true);
        }
      } catch (error) {
        setLoading(false);
        return;
      }
      setLoading(false);
    };
    load();
  }, []);

  // FCM initialisé en arrière-plan (optionnel)
  useEffect(() => {
    const initFcm = async () => {
      try {
        const { requestNotificationPermission, registerFcmToken, onForegroundMessage } = await import('@/lib/pushNotifications');
        const permitted = await requestNotificationPermission?.();
        if (!permitted) return;
        const token = await registerFcmToken?.();
        if (token) {
          base44.functions.invoke('saveFcmToken', { token }).catch(() => {});
          onForegroundMessage?.((payload) => {
            if (payload?.notification?.title) {
              new Notification(payload.notification.title, { body: payload.notification?.body });
            }
          });
        }
      } catch (err) {
        // Silencieux
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
    return <RoleSetup onComplete={() => { setNeedsRole(false); window.location.reload(); }} />;
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