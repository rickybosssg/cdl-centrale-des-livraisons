import { useEffect, useState, useRef, Component } from 'react';
import { useNavigate } from 'react-router-dom';
import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { TopNotificationProvider, useTopNotification } from '@/context/TopNotificationContext';
import TopNotificationBanner from '@/components/TopNotificationBanner';
import AppLayoutWrapper from './components/AppLayoutWrapper';
import DispatcherGuard from './components/DispatcherGuard';
import { base44 as b44 } from '@/api/base44Client';

const LOGIN_PATH = '/connexion';

// Pages
import Home from './pages/Home';
import ResetAdmin from './pages/ResetAdmin';
import CreateCourse from './pages/client/CreateCourse';
import MesCourses from './pages/client/MesCourses';
import CourseDetail from './pages/client/CourseDetail';
import CourseTracking from './pages/client/CourseTracking.jsx';
import EffectuerDeplacement from './pages/client/EffectuerDeplacement';
import Vitrines from './pages/client/Vitrines';
import CoursesDisponibles from './pages/livreur/CoursesDisponibles';
import CourseLivreur from './pages/livreur/CourseLivreur';
import MesLivraisons from './pages/livreur/MesLivraisons';
import GainsLivreur from './pages/livreur/GainsLivreur';
import MesDiscussions from './pages/livreur/MesDiscussions';
import GererCourses from './pages/dispatcher/GererCourses';
import GererLivreurs from './pages/dispatcher/GererLivreurs';
import Statistiques from './pages/dispatcher/Statistiques';
import SuiviCommissions from './pages/dispatcher/SuiviCommissions';
import ValidationLivreurs from './pages/dispatcher/ValidationLivreurs';
import Parametres from './pages/dispatcher/Parametres';
import InviterAdmin from './pages/dispatcher/InviterAdmin';
import BaseClients from './pages/dispatcher/BaseClients';
import BaseLivreurs from './pages/dispatcher/BaseLivreurs';
import BasePartenaires from './pages/dispatcher/BasePartenaires';
import BaseCommerciaux from './pages/dispatcher/BaseCommerciaux';
import GererPartenaires from './pages/dispatcher/GererPartenaires';
import GererClients from './pages/dispatcher/GererClients';
import GererCommerciaux from './pages/dispatcher/GererCommerciaux';
import GererPublicites from './pages/dispatcher/GererPublicites';
import Suppression from './pages/dispatcher/Suppression';
import AuditUtilisateurs from './pages/dispatcher/AuditUtilisateurs';
import AdminDashboard from './pages/dispatcher/AdminDashboard';
import AdminRoleCorrection from './pages/AdminRoleCorrection';
import DebugAdmin from './pages/DebugAdmin';
import CreerBoutiqueAdmin from './pages/dispatcher/CreerBoutiqueAdmin';
import AdminTrash from './pages/dispatcher/AdminTrash';
import MessagesAdmin from './pages/dispatcher/MessagesAdmin';
import AdminCreerPublicite from './pages/dispatcher/AdminCreerPublicite';
import AdminMesPublicites from './pages/dispatcher/AdminMesPublicites';
import DashboardPartenaire from './pages/partenaire/DashboardPartenaire';
import MesCommandesMarketplace from './pages/client/MesCommandesMarketplace';
import CommandeMarketplaceDetail from './pages/client/CommandeMarketplaceDetail';
import PagePartenaire from './pages/partenaire/PagePartenaire';
import CommandesPartenaire from './pages/partenaire/CommandesPartenaire';
import MesMessages from './pages/MesMessages';
import Settings from './pages/Settings';

import PolitiqueConfidentialite from './pages/PolitiqueConfidentialite';
import CGU from './pages/CGU';
import SupprimerCompte from './pages/SupprimerCompte';
import MonBedou from './pages/MonBedou';
import MesNotifications from './pages/MesNotifications';
import CompleteProfile from './pages/CompleteProfile';
import GestionTransactions from './pages/dispatcher/GestionTransactions';
import GestionProfils from './pages/dispatcher/GestionProfils';
import GestionAcces from './pages/dispatcher/GestionAcces';
import GestionBedou from './pages/dispatcher/GestionBedou';
import DiffusionGlobale from './pages/dispatcher/DiffusionGlobale';
import PendingProfileRequests from './pages/dispatcher/PendingProfileRequests';
import DispatchMonitor from './pages/dispatcher/DispatchMonitor';
import LivreursIncompletsList from './pages/dispatcher/LivreursIncompletsList';
import ProfilsAdmin from './pages/dispatcher/ProfilsAdmin';
import TestUpload from './pages/TestUpload';
import AdminLoginSecure from './pages/AdminLoginSecure';
import HealthDashboard from './pages/dispatcher/HealthDashboard';
import AuditComplet from './pages/dispatcher/AuditComplet';
import TestPublicitesVisibilite from './pages/dispatcher/TestPublicitesVisibilite';
import BedouAudit from './pages/dispatcher/BedouAudit';
import AdminProfilUnifie from './pages/dispatcher/AdminProfilUnifie';
import TestMallE2E from './pages/dispatcher/TestMallE2E';
import Mall from './pages/Mall';
import DashboardAnnonceur from './pages/annonceur/DashboardAnnonceur';
import CreerPublicite from './pages/annonceur/CreerPublicite';
import MesPublicitesAnnonceur from './pages/annonceur/MesPublicites';
import MyReferral from './pages/MyReferral';
import GestionSignalements from './pages/dispatcher/GestionSignalements';
import PlayStoreChecklist from './pages/dispatcher/PlayStoreChecklist';
import PlayStoreValidationFinal from './pages/dispatcher/PlayStoreValidationFinal';
import WhatsAppAlerts from './pages/dispatcher/WhatsAppAlerts';
import AdminDashboardPro from './pages/dispatcher/AdminDashboardPro';
import ProfilsHub from './pages/dispatcher/ProfilsHub';
import ProfilsLivreurs from './pages/dispatcher/ProfilsLivreurs';
import ProfilsClients from './pages/dispatcher/ProfilsClients';
import ProfilsCommerciaux from './pages/dispatcher/ProfilsCommerciaux';
import ProfilsPartenaires from './pages/dispatcher/ProfilsPartenaires';
import ProfilsAnnonceurs from './pages/dispatcher/ProfilsAnnonceurs';
import SpaceSelector from './pages/SpaceSelector';
import StaffGuard from './components/StaffGuard';
import StaffDashboard from './pages/staff/StaffDashboard';
import BedouManager from './pages/staff/BedouManager';
import LivreurValidator from './pages/staff/LivreurValidator';
import ManualDispatch from './pages/staff/ManualDispatch';
import SupportClient from './pages/staff/SupportClient';
import PubCommercial from './pages/staff/PubCommercial';
import StaffAdmin from './pages/staff/StaffAdmin';
import AuditLogs from './pages/staff/AuditLogs';
import AdminDiagnostics from './pages/dispatcher/AdminDiagnostics';
import AdminAuthDiagnostics from './pages/dispatcher/AdminAuthDiagnostics';
import TestNotifications from './pages/dispatcher/TestNotifications';
import FcmDiagnostic from './pages/FcmDiagnostic';
import FcmTokenDebug from './pages/dispatcher/FcmTokenDebug';
import EmailLogin from './pages/EmailLogin';
import AppPublicLink from './pages/AppPublicLink';
import TrackingPublic from './pages/TrackingPublic';
import DownloadApp from './pages/DownloadApp';
import FcmBootstrap from './components/FcmBootstrap';

// ─── Capturer notif_route AVANT tout rendu React (app fermée) ─────────────
// Doit être exécuté après les imports (ESM) mais avant le mount
try {
  const _p = new URLSearchParams(window.location.search);
  const _r = _p.get('notif_route');
  if (_r && _r.startsWith('/')) {
    sessionStorage.setItem('cdl_notif_route', _r);
    window.history.replaceState({}, '', window.location.pathname);
  }
} catch (_) {}

// Wrappers qui chargent le user avant de rendre
function DashboardPartenaireWrapper() {
  const [user, setUser] = useState(null);
  useEffect(() => { b44.auth.me().then(setUser); }, []);
  if (!user) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;
  return <DashboardPartenaire user={user} />;
}

function CommandesPartenaireWrapper() {
  const [user, setUser] = useState(null);
  useEffect(() => { b44.auth.me().then(setUser); }, []);
  if (!user) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;
  return <CommandesPartenaire user={user} />;
}

function AppLayoutWithUser() {
  const [user, setUser] = useState(null);
  useEffect(() => { b44.auth.me().then(setUser); }, []);
  return <AppLayoutWrapper user={user} />;
}

// ─── Deep link FCM — Handler unique, 3 cas couverts ─────────────────────────
function FcmDeepLinkHandler() {
  const navigate = useNavigate();
  const navigated = useRef(false);

  useEffect(() => {
    // CAS 1 : App fermée → notif_route stocké en sessionStorage avant le mount
    const pending = sessionStorage.getItem('cdl_notif_route');
    if (pending && !navigated.current) {
      sessionStorage.removeItem('cdl_notif_route');
      navigated.current = true;
      requestAnimationFrame(() => navigate(pending, { replace: true }));
    }

    // CAS 2 : App background → SW postMessage
    const onSwMsg = (event) => {
      if (event.data?.type === 'CDL_NOTIFICATION_CLICK' && event.data.route) {
        navigate(event.data.route, { replace: false });
      }
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', onSwMsg);
    }

    // CAS 3 & 4 : APK natif Capacitor → notifications au lancement à froid
    import('./lib/nativePush').then(({ isNativeApp, getDeliveredNotifications }) => {
      if (!isNativeApp()) return;
      getDeliveredNotifications().then((notifs) => {
        if (notifs.length > 0 && !navigated.current) {
          const last = notifs[notifs.length - 1];
          const data = last.data || {};
          const route = data.notif_route || data.route || data.target_screen;
          if (route && route.startsWith('/')) {
            navigated.current = true;
            navigate(route, { replace: true });
          }
        }
      }).catch(() => {});
    }).catch(() => {});

    return () => {
      if ('serviceWorker' in navigator) navigator.serviceWorker.removeEventListener('message', onSwMsg);
    };
  }, []);

  return null;
}

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, isAuthenticated, checkAppState } = useAuth();
  const { notification, closeNotification } = useTopNotification();
  const [loadingTimeout, setLoadingTimeout] = useState(false);

  // Timeout de sécurité : affiche bouton réessayer après 5s
  useEffect(() => {
    if (!isLoadingAuth && !isLoadingPublicSettings) return;
    const t1 = setTimeout(() => setLoadingTimeout(true), 5000);
    return () => { clearTimeout(t1); };
  }, [isLoadingAuth, isLoadingPublicSettings]);

  // ── Routes publiques — AVANT tout check d'auth ──────────────────────────
  // Ces routes sont accessibles sans authentification (important pour APK natif)
  if (window.location.pathname === '/admin-login-secure') {
    return <AdminLoginSecure />;
  }
  if (window.location.pathname === LOGIN_PATH) {
    return <EmailLogin />;
  }
  if (window.location.pathname === '/telecharger-app') {
    return <DownloadApp />;
  }

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-primary to-blue-700">
        <div className="text-center space-y-4 text-white">
          <img src="https://media.base44.com/images/public/69c3c74fc4b62396dca61751/1eb51398f_Screenshot_20260330_132434_WhatsApp.jpg" alt="CDL" className="h-24 w-24 mx-auto rounded-3xl" />
          <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
          {loadingTimeout && (
            <div className="space-y-3 mt-4">
              <p className="text-sm text-white/80">Le chargement prend trop de temps...</p>
              <button
                onClick={() => { setLoadingTimeout(false); checkAppState(); }}
                className="px-5 py-2 bg-white text-primary rounded-xl font-semibold text-sm"
              >
                🔄 Réessayer
              </button>
              <button
                onClick={() => { window.location.href = LOGIN_PATH; }}
                className="block mx-auto text-xs text-white/60 underline mt-1"
              >
                Se connecter manuellement
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else {
      const _p = new URLSearchParams(window.location.search);
      const _ref = (_p.get('ref') || _p.get('promo') || '').toUpperCase().trim();
      if (_ref) localStorage.setItem('cdl_promo_code', _ref);
      return <EmailLogin />;
    }
  }

  // Non authentifié → écran de connexion email/password
  if (!isAuthenticated) {
    const _p2 = new URLSearchParams(window.location.search);
    const _ref2 = (_p2.get('ref') || _p2.get('promo') || '').toUpperCase().trim();
    if (_ref2) localStorage.setItem('cdl_promo_code', _ref2);
    return <EmailLogin />;
  }

  return (
    <>
      <FcmBootstrap />
      <TopNotificationBanner notification={notification} onClose={closeNotification} />
      <FcmDeepLinkHandler />
      <Routes>
        {/* Routes publiques sans layout */}
        <Route path="/admin-login-secure" element={<AdminLoginSecure />} />
        <Route path="/connexion" element={<EmailLogin />} />
        <Route path="/app-public-link" element={<AppPublicLink />} />
        <Route path="/track/:courseId" element={<TrackingPublic />} />
        <Route path="/telecharger-app" element={<DownloadApp />} />
        <Route path="/reset-admin" element={<ResetAdmin />} />
      <Route path="/admin-role-correction" element={<AdminRoleCorrection />} />
      <Route path="/debug-admin" element={<DebugAdmin />} />

      {/* Toutes les routes avec layout */}
      <Route element={<AppLayoutWithUser />}>
        <Route path="/" element={<Home />} />

        {/* Client */}
        <Route path="/commander" element={<CreateCourse />} />
        <Route path="/mes-courses" element={<MesCourses />} />
        <Route path="/course/:id" element={<CourseDetail />} />
        <Route path="/course/:id/track" element={<CourseTracking />} />
        <Route path="/effectuer-deplacement" element={<EffectuerDeplacement />} />
        <Route path="/vitrines" element={<Vitrines />} />
        <Route path="/mes-commandes-marketplace" element={<MesCommandesMarketplace />} />
        <Route path="/commande-marketplace/:id" element={<CommandeMarketplaceDetail />} />
        <Route path="/commerce/:id" element={<PagePartenaire />} />
        <Route path="/mall" element={<Mall />} />

        {/* Annonceur */}
        <Route path="/dashboard-annonceur" element={<DashboardAnnonceur />} />
        <Route path="/creer-publicite" element={<CreerPublicite />} />
        <Route path="/mes-publicites-annonceur" element={<MesPublicitesAnnonceur />} />

        {/* Livreur */}
        <Route path="/courses-disponibles" element={<CoursesDisponibles />} />
        <Route path="/course-livreur/:id" element={<CourseLivreur />} />
        <Route path="/mes-livraisons" element={<MesLivraisons />} />
        <Route path="/mes-gains" element={<GainsLivreur />} />
        <Route path="/mes-discussions" element={<MesDiscussions />} />

        {/* Partenaire */}
        <Route path="/dashboard-partenaire" element={<DashboardPartenaireWrapper />} />
        <Route path="/commandes-partenaire" element={<CommandesPartenaireWrapper />} />

        {/* Messages */}
        <Route path="/mes-messages" element={<MesMessages />} />

        {/* Paramètres utilisateur */}
        <Route path="/settings" element={<Settings />} />
        <Route path="/fcm-diagnostic" element={<FcmDiagnostic />} />

        <Route path="/politique-confidentialite" element={<PolitiqueConfidentialite />} />
        <Route path="/cgu" element={<CGU />} />
        <Route path="/supprimer-compte" element={<SupprimerCompte />} />
        <Route path="/mon-bedou" element={<MonBedou />} />
        <Route path="/mes-notifications" element={<MesNotifications />} />
        <Route path="/mon-parrainage" element={<MyReferral />} />
        <Route path="/complete-profile/:profileId" element={<CompleteProfile />} />

        {/* Admin uniquement */}
        <Route element={<DispatcherGuard />}>
          <Route path="/admin-dashboard" element={<AdminDashboard />} />
          <Route path="/gerer-courses" element={<GererCourses />} />
          <Route path="/gerer-livreurs" element={<GererLivreurs />} />
          <Route path="/statistiques" element={<Statistiques />} />
          <Route path="/suivi-commissions" element={<SuiviCommissions />} />
          <Route path="/validation-livreurs" element={<ValidationLivreurs />} />
          <Route path="/parametres" element={<Parametres />} />
          <Route path="/inviter-admin" element={<InviterAdmin />} />
          <Route path="/base-clients" element={<BaseClients />} />
          <Route path="/base-livreurs" element={<BaseLivreurs />} />
          <Route path="/base-partenaires" element={<BasePartenaires />} />
          <Route path="/base-commerciaux" element={<BaseCommerciaux />} />
          <Route path="/gerer-partenaires" element={<GererPartenaires />} />
          <Route path="/gerer-clients" element={<GererClients />} />
          <Route path="/gerer-commerciaux" element={<GererCommerciaux />} />
          <Route path="/gerer-publicites" element={<GererPublicites />} />
          <Route path="/suppression" element={<Suppression />} />
          <Route path="/audit-utilisateurs" element={<AuditUtilisateurs />} />
          <Route path="/admin-trash" element={<AdminTrash />} />
          <Route path="/creer-boutique" element={<CreerBoutiqueAdmin />} />
          <Route path="/messages-admin" element={<MessagesAdmin />} />
          <Route path="/admin-creer-publicite" element={<AdminCreerPublicite />} />
          <Route path="/admin-mes-publicites" element={<AdminMesPublicites />} />
          <Route path="/gestion-transactions" element={<GestionTransactions />} />
          <Route path="/gestion-profils" element={<GestionProfils />} />
          <Route path="/gestion-acces" element={<GestionAcces />} />
          <Route path="/gestion-bedou" element={<GestionBedou />} />
          <Route path="/diffusion-globale" element={<DiffusionGlobale />} />
          <Route path="/pending-profiles" element={<PendingProfileRequests />} />
          <Route path="/livreurs-incomplets" element={<LivreursIncompletsList />} />
          <Route path="/profils-admin" element={<ProfilsAdmin />} />
          <Route path="/test-upload" element={<TestUpload />} />
          <Route path="/dispatch-monitor" element={<DispatchMonitor />} />
          <Route path="/health-dashboard" element={<HealthDashboard />} />
          <Route path="/audit-complet" element={<AuditComplet />} />
          <Route path="/test-publicites" element={<TestPublicitesVisibilite />} />
          <Route path="/bedou-audit" element={<BedouAudit />} />
          <Route path="/admin/profil/:userId" element={<AdminProfilUnifie />} />
          <Route path="/test-mall-e2e" element={<TestMallE2E />} />
          <Route path="/gestion-signalements" element={<GestionSignalements />} />
          <Route path="/playstore-checklist" element={<PlayStoreChecklist />} />
          <Route path="/playstore-validation" element={<PlayStoreValidationFinal />} />
          <Route path="/whatsapp-alerts" element={<WhatsAppAlerts />} />
          <Route path="/admin-diagnostics" element={<AdminDiagnostics />} />
          <Route path="/admin-auth-diagnostics" element={<AdminAuthDiagnostics />} />
          <Route path="/test-notifications" element={<TestNotifications />} />
          <Route path="/fcm-token-debug" element={<FcmTokenDebug />} />
          {/* Dashboard PRO & Profils centralisés */}
          <Route path="/admin-pro" element={<AdminDashboardPro />} />
          <Route path="/profils" element={<ProfilsHub />} />
          <Route path="/profils/livreurs" element={<ProfilsLivreurs />} />
          <Route path="/profils/clients" element={<ProfilsClients />} />
          <Route path="/profils/commerciaux" element={<ProfilsCommerciaux />} />
          <Route path="/profils/partenaires" element={<ProfilsPartenaires />} />
          <Route path="/profils/annonceurs" element={<ProfilsAnnonceurs />} />
        </Route>
      </Route>

      {/* Espace sélecteur */}
      <Route path="/espaces" element={<SpaceSelector />} />

      {/* Staff CDL */}
      <Route element={<AppLayoutWithUser />}>
        <Route element={<StaffGuard />}>
          <Route path="/staff" element={<StaffDashboard />} />
          <Route path="/staff/bedou" element={<BedouManager />} />
          <Route path="/staff/livreurs" element={<LivreurValidator />} />
          <Route path="/staff/dispatch" element={<ManualDispatch />} />
          <Route path="/staff/support" element={<SupportClient />} />
          <Route path="/staff/pubs" element={<PubCommercial />} />
          <Route path="/staff/admin" element={<StaffAdmin />} />
          <Route path="/staff/audit" element={<AuditLogs />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
};

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-background">
          <div className="text-center space-y-4 max-w-sm">
            <div className="text-4xl">⚠️</div>
            <h2 className="text-lg font-bold">Une erreur est survenue</h2>
            <p className="text-sm text-muted-foreground">{this.state.error?.message || "Erreur inconnue"}</p>
            <button onClick={() => window.location.reload()} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium">Recharger l'application</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  return (
    <ErrorBoundary>
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <TopNotificationProvider>
          <Router>
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </TopNotificationProvider>
      </QueryClientProvider>
    </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;