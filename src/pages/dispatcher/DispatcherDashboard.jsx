import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Package, Users, TrendingUp, Clock, CheckCircle2, Truck, BarChart3, Settings, ShieldCheck, CreditCard, AlarmClock } from "lucide-react";
import MapLivreursActifs from "../../components/MapLivreursActifs";
import { getDispatchMode, setDispatchMode } from "@/lib/dispatch";
import { Card, CardContent } from "@/components/ui/card";
import CourseCard from "../../components/CourseCard";
import moment from "moment";

export default function DispatcherDashboard() {
  const [courses, setCourses] = useState([]);
  const [livreurs, setLivreurs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dispatchMode, setDispatchModeState] = useState(getDispatchMode());

  const toggleDispatchMode = () => {
    const newMode = dispatchMode === 'auto' ? 'manuel' : 'auto';
    setDispatchMode(newMode);
    setDispatchModeState(newMode);
  };

  useEffect(() => {
    const load = async () => {
      const [coursesData, livreursData] = await Promise.all([
        base44.entities.Course.list("-created_date", 50),
        base44.entities.User.filter({ user_type: "livreur" }),
      ]);
      setCourses(coursesData);
      setLivreurs(livreursData);
      setLoading(false);
    };
    load();
  }, []);

  const today = new Date().toDateString();
  const coursesToday = courses.filter(c => new Date(c.created_date).toDateString() === today);
  const enAttente = courses.filter(c => ["en_attente", "aucun_livreur"].includes(c.statut));
  const enCours = courses.filter(c => ["assignee_attente", "acceptee", "en_cours"].includes(c.statut));
  const terminees = courses.filter(c => c.statut === "livree");
  const livreursActifs = livreurs.filter(l => l.disponible);
  const livreursValides = livreurs.filter(l => l.statut_validation_livreur === "valide");
  const livreursEnAttente = livreurs.filter(l => !l.statut_validation_livreur || l.statut_validation_livreur === "en_attente");
  const livreursBlockes = livreurs.filter(l => l.livreur_bloque);
  const totalCommissionsJour = courses
    .filter(c => c.statut === "livree" && new Date(c.date_livraison).toDateString() === today)
    .reduce((sum, c) => sum + (c.commission_cdl || 0), 0);
  const totalImpaye = livreurs.reduce((sum, l) => sum + (l.solde_commission_du || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tableau de bord CDL</h1>
          <p className="text-sm text-muted-foreground">Centrale des Livraisons - Ouagadougou</p>
        </div>
        <button
          onClick={toggleDispatchMode}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
            dispatchMode === 'auto'
              ? 'bg-green-100 text-green-700 border-green-300'
              : 'bg-amber-100 text-amber-700 border-amber-300'
          }`}
        >
          {dispatchMode === 'auto' ? '⚡ Mode automatique' : '✋ Mode manuel'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{courses.length}</p>
                <p className="text-xs text-muted-foreground">Total courses</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{enAttente.length}</p>
                <p className="text-xs text-muted-foreground">En attente</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                <Users className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{livreursActifs.length}/{livreurs.length}</p>
                <p className="text-xs text-muted-foreground">Livreurs en ligne</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold">{Math.round(totalCommissionsJour).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Commissions du jour</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Carte GPS temps réel */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">🗺️ Livreurs en temps réel</h2>
          <span className="text-xs text-muted-foreground">{livreursActifs.filter(l => l.gps_latitude).length} avec GPS</span>
        </div>
        <MapLivreursActifs livreurs={livreurs} courses={courses} height="250px" />
      </div>

      {/* Pending courses */}
      {enAttente.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-amber-600">⚡ Courses en attente</h2>
            <Link to="/gerer-courses" className="text-xs text-primary font-medium">Voir tout</Link>
          </div>
          {enAttente.slice(0, 3).map((course) => (
            <Link key={course.id} to="/gerer-courses">
              <CourseCard course={course} />
            </Link>
          ))}
        </div>
      )}

      {/* Raccourcis */}
      <h2 className="font-semibold text-sm text-muted-foreground">Accès rapides</h2>
      <div className="grid grid-cols-2 gap-3">
        <Link to="/gerer-courses">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-4 text-center space-y-2">
              <Package className="h-8 w-8 text-primary mx-auto" />
              <p className="text-sm font-medium">Gérer les courses</p>
            </CardContent>
          </Card>
        </Link>
        <Link to="/gerer-livreurs">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-4 text-center space-y-2">
              <Users className="h-8 w-8 text-accent mx-auto" />
              <p className="text-sm font-medium">Gérer les livreurs</p>
            </CardContent>
          </Card>
        </Link>
        <Link to="/suivi-commissions">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-4 text-center space-y-2">
              <CreditCard className="h-8 w-8 text-primary mx-auto" />
              <p className="text-sm font-medium">Suivi des commissions</p>
            </CardContent>
          </Card>
        </Link>
        <Link to="/validation-livreurs">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-4 text-center space-y-2">
              <ShieldCheck className="h-8 w-8 text-green-600 mx-auto" />
              <p className="text-sm font-medium">Validation livreurs</p>
              {livreursEnAttente.length > 0 && (
                <span className="inline-block bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {livreursEnAttente.length}
                </span>
              )}
            </CardContent>
          </Card>
        </Link>
        <Link to="/statistiques">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-4 text-center space-y-2">
              <BarChart3 className="h-8 w-8 text-purple-600 mx-auto" />
              <p className="text-sm font-medium">Statistiques</p>
            </CardContent>
          </Card>
        </Link>
        <Link to="/parametres">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-4 text-center space-y-2">
              <Settings className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-sm font-medium">Paramètres</p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}