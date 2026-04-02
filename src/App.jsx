import { useEffect, useState } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import AppLayoutWrapper from './components/AppLayoutWrapper';
import DispatcherGuard from './components/DispatcherGuard';
import { base44 as b44 } from '@/api/base44Client';

// Pages
import Home from './pages/Home';
import ResetAdmin from './pages/ResetAdmin';
import CreateCourse from './pages/client/CreateCourse';
import MesCourses from './pages/client/MesCourses';
import CourseDetail from './pages/client/CourseDetail';
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
import GererPublicites from './pages/dispatcher/GererPublicites';
import GererCommerciaux from './pages/dispatcher/GererCommerciaux';
import Suppression from './pages/dispatcher/Suppression';
import AuditUtilisateurs from './pages/dispatcher/AuditUtilisateurs';
import AdminDashboard from './pages/dispatcher/AdminDashboard';
import AdminRoleCorrection from './pages/AdminRoleCorrection';
import DebugAdmin from './pages/DebugAdmin';
import CreerBoutiqueAdmin from './pages/dispatcher/CreerBoutiqueAdmin';
import AdminTrash from './pages/dispatcher/AdminTrash';
import MessagesAdmin from './pages/dispatcher/MessagesAdmin';
import DashboardPartenaire from './pages/partenaire/DashboardPartenaire';
import MesCommandesMarketplace from './pages/client/MesCommandesMarketplace';
import CommandeMarketplaceDetail from './pages/client/CommandeMarketplaceDetail';
import PagePartenaire from './pages/partenaire/PagePartenaire';
import CommandesPartenaire from './pages/partenaire/CommandesPartenaire';
import MesMessages from './pages/MesMessages';
import Settings from './pages/Settings';
import FcmDiagnostic from './pages/FcmDiagnostic';
import PolitiqueConfidentialite from './pages/PolitiqueConfidentialite';
import CGU from './pages/CGU';
import SupprimerCompte from './pages/SupprimerCompte';
import MonBedou from './pages/MonBedou';
import MesNotifications from './pages/MesNotifications';
import GestionTransactions from './pages/dispatcher/GestionTransactions';
import GestionProfils from './pages/dispatcher/GestionProfils';
import GestionAcces from './pages/dispatcher/GestionAcces';
import DiffusionGlobale from './pages/dispatcher/DiffusionGlobale';
import PendingProfileRequests from './pages/dispatcher/PendingProfileRequests';
import DispatchMonitor from './pages/dispatcher/DispatchMonitor';
import LivreursIncompletsList from './pages/dispatcher/LivreursIncompletsList';
import ProfilsAdmin from './pages/dispatcher/ProfilsAdmin';
import TestUpload from './pages/TestUpload';

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

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, isAuthenticated } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-primary to-blue-700">
        <div className="text-center space-y-4 text-white">
          <img src="https://media.base44.com/images/public/69c3c74fc4b62396dca61751/1eb51398f_Screenshot_20260330_132434_WhatsApp.jpg" alt="CDL" className="h-24 w-24 mx-auto rounded-3xl" />
          <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else {
      // auth_required ou autre → rediriger vers le login
      b44.auth.redirectToLogin();
      return (
        <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-primary to-blue-700">
          <div className="text-center space-y-4 text-white">
            <img src="https://media.base44.com/images/public/69c3c74fc4b62396dca61751/1eb51398f_Screenshot_20260330_132434_WhatsApp.jpg" alt="CDL" className="h-24 w-24 mx-auto rounded-3xl" />
            <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
          </div>
        </div>
      );
    }
  }

  // Rediriger les non-authentifiés vers le login
  if (!isAuthenticated) {
    b44.auth.redirectToLogin();
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-primary to-blue-700">
        <div className="text-center space-y-4 text-white">
          <img src="https://media.base44.com/images/public/69c3c74fc4b62396dca61751/1eb51398f_Screenshot_20260330_132434_WhatsApp.jpg" alt="CDL" className="h-24 w-24 mx-auto rounded-3xl" />
          <p className="font-semibold text-lg">CDL APP</p>
          <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  // Redirection automatique admin vers dashboard
  if (isAuthenticated) {
    // Vérifier si c'est un admin et rediriger
    const checkAdmin = async () => {
      try {
        const me = await b44.auth.me();
        if (me?.role === 'admin' || me?.user_type === 'admin') {
          // Rediriger vers admin dashboard
          // Note: sera géré par Home.jsx
        }
      } catch (_) {}
    };
    checkAdmin();
  }

  return (
    <Routes>
      {/* Routes publiques sans layout */}
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
        <Route path="/effectuer-deplacement" element={<EffectuerDeplacement />} />
        <Route path="/vitrines" element={<Vitrines />} />
        <Route path="/mes-commandes-marketplace" element={<MesCommandesMarketplace />} />
        <Route path="/commande-marketplace/:id" element={<CommandeMarketplaceDetail />} />
        <Route path="/mes-commandes-marketplace" element={<MesCommandesMarketplace />} />
        <Route path="/commande-marketplace/:id" element={<CommandeMarketplaceDetail />} />
        <Route path="/commerce/:id" element={<PagePartenaire />} />

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
          <Route path="/gerer-publicites" element={<GererPublicites />} />
          <Route path="/gerer-commerciaux" element={<GererCommerciaux />} />
          <Route path="/suppression" element={<Suppression />} />
          <Route path="/audit-utilisateurs" element={<AuditUtilisateurs />} />
          <Route path="/admin-trash" element={<AdminTrash />} />
          <Route path="/creer-boutique" element={<CreerBoutiqueAdmin />} />
          <Route path="/messages-admin" element={<MessagesAdmin />} />
          <Route path="/gestion-transactions" element={<GestionTransactions />} />
          <Route path="/gestion-profils" element={<GestionProfils />} />
          <Route path="/gestion-acces" element={<GestionAcces />} />
          <Route path="/diffusion-globale" element={<DiffusionGlobale />} />
          <Route path="/pending-profiles" element={<PendingProfileRequests />} />
          <Route path="/livreurs-incomplets" element={<LivreursIncompletsList />} />
          <Route path="/profils-admin" element={<ProfilsAdmin />} />
          <Route path="/test-upload" element={<TestUpload />} />
          <Route path="/dispatch-monitor" element={<DispatchMonitor />} />
        </Route>
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;