import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import Home from './pages/Home';
import CreateCourse from './pages/client/CreateCourse';
import MesCourses from './pages/client/MesCourses';
import CourseDetail from './pages/client/CourseDetail';
import CoursesDisponibles from './pages/livreur/CoursesDisponibles';
import CourseLivreur from './pages/livreur/CourseLivreur';
import MesLivraisons from './pages/livreur/MesLivraisons';
import GererCourses from './pages/dispatcher/GererCourses';
import GererLivreurs from './pages/dispatcher/GererLivreurs';
import Statistiques from './pages/dispatcher/Statistiques';
import SuiviCommissions from './pages/dispatcher/SuiviCommissions';
import ValidationLivreurs from './pages/dispatcher/ValidationLivreurs';
import Parametres from './pages/dispatcher/Parametres';
import GainsLivreur from './pages/livreur/GainsLivreur';
import BaseClients from './pages/dispatcher/BaseClients';
import GererPartenaires from './pages/dispatcher/GererPartenaires';
import DashboardPartenaire from './pages/partenaire/DashboardPartenaire';
import PagePartenaire from './pages/partenaire/PagePartenaire';
import CommandesPartenaire from './pages/partenaire/CommandesPartenaire';
import { useEffect, useState } from 'react';
import { base44 as b44 } from '@/api/base44Client';

function DashboardPartenaireWrapper() {
  const [user, setUser] = useState(null);
  useEffect(() => { b44.auth.me().then(setUser); }, []);
  if (!user) return null;
  return <DashboardPartenaire user={user} />;
}

function CommandesPartenaireWrapper() {
  const [user, setUser] = useState(null);
  useEffect(() => { b44.auth.me().then(setUser); }, []);
  if (!user) return null;
  return <CommandesPartenaire user={user} />;
}
import AppLayout from './components/AppLayout';
import AppLayoutWrapper from './components/AppLayoutWrapper';
import DispatcherGuard from './components/DispatcherGuard';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route element={<AppLayoutWrapper />}>
        <Route path="/" element={<Home />} />
        <Route path="/commander" element={<CreateCourse />} />
        <Route path="/mes-courses" element={<MesCourses />} />
        <Route path="/course/:id" element={<CourseDetail />} />
        <Route path="/courses-disponibles" element={<CoursesDisponibles />} />
        <Route path="/course-livreur/:id" element={<CourseLivreur />} />
        <Route path="/mes-livraisons" element={<MesLivraisons />} />
        <Route element={<DispatcherGuard />}>
          <Route path="/gerer-courses" element={<GererCourses />} />
          <Route path="/gerer-livreurs" element={<GererLivreurs />} />
          <Route path="/statistiques" element={<Statistiques />} />
          <Route path="/suivi-commissions" element={<SuiviCommissions />} />
          <Route path="/validation-livreurs" element={<ValidationLivreurs />} />
          <Route path="/parametres" element={<Parametres />} />
        </Route>
        <Route path="/mes-gains" element={<GainsLivreur />} />
        <Route path="/dashboard-partenaire" element={<DashboardPartenaireWrapper />} />
        <Route path="/base-clients" element={<BaseClients />} />
        <Route path="/gerer-partenaires" element={<GererPartenaires />} />
        <Route path="/commerce/:id" element={<PagePartenaire />} />
        <Route path="/commandes-partenaire" element={<CommandesPartenaireWrapper />} />
        <Route path="/dispatcher/DispatcherDashboard" element={<Home />} />
        <Route path="/dispatcher/GererCourses" element={<GererCourses />} />
        <Route path="/dispatcher/GererLivreurs" element={<GererLivreurs />} />
        <Route path="/dispatcher/Statistiques" element={<Statistiques />} />
        <Route path="/client/ClientHome" element={<Home />} />
        <Route path="/client/CreateCourse" element={<CreateCourse />} />
        <Route path="/client/MesCourses" element={<MesCourses />} />
        <Route path="/livreur/CoursesDisponibles" element={<CoursesDisponibles />} />
        <Route path="/livreur/MesLivraisons" element={<MesLivraisons />} />
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
  )
}

export default App