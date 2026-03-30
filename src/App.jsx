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
import CreerBoutiqueAdmin from './pages/dispatcher/CreerBoutiqueAdmin';
import MessagesAdmin from './pages/dispatcher/MessagesAdmin';
import DashboardPartenaire from './pages/partenaire/DashboardPartenaire';
import PagePartenaire from './pages/partenaire/PagePartenaire';
import CommandesPartenaire from './pages/partenaire/CommandesPartenaire';
import MesMessages from './pages/MesMessages';
import Settings from './pages/Settings';

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
          <div className="h-16 w-16 rounded-2xl bg-white flex items-center justify-center text-primary font-bold text-2xl mx-auto">CDL</div>
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
            <div className="h-16 w-16 rounded-2xl bg-white flex items-center justify-center text-primary font-bold text-2xl mx-auto">CDL</div>
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
          <div className="h-16 w-16 rounded-2xl bg-white flex items-center justify-center text-primary font-bold text-2xl mx-auto">CDL</div>
          <p className="font-semibold text-lg">CDL APP</p>
          <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <Routes>
      {/* Route publique sans layout */}
      <Route path="/reset-admin" element={<ResetAdmin />} />

      {/* Toutes les routes avec layout */}
      <Route element={<AppLayoutWithUser />}>
        <Route path="/" element={<Home />} />

        {/* Client */}
        <Route path="/commander" element={<CreateCourse />} />
        <Route path="/mes-courses" element={<MesCourses />} />
        <Route path="/course/:id" element={<CourseDetail />} />
        <Route path="/effectuer-deplacement" element={<EffectuerDeplacement />} />
        <Route path="/vitrines" element={<Vitrines />} />
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

        {/* Admin uniquement */}
        <Route element={<DispatcherGuard />}>
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
          <Route path="/creer-boutique" element={<CreerBoutiqueAdmin />} />
          <Route path="/messages-admin" element={<MessagesAdmin />} />
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