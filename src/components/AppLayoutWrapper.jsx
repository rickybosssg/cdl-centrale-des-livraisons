import { useState, useEffect } from "react";
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
          // CAS 1 : pas de rôle → forcer le choix du profil
          if (!me.user_type) {
            setNeedsRole(true);
            setLoading(false);
            return;
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
          setUserRole(me.user_type || "client");
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