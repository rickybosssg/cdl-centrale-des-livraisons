import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Package, Users, TrendingUp, Clock, CheckCircle2, Truck, BarChart3 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import CourseCard from "../../components/CourseCard";
import moment from "moment";

export default function DispatcherDashboard() {
  const [courses, setCourses] = useState([]);
  const [livreurs, setLivreurs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [coursesData, livreursData] = await Promise.all([
        base44.entities.Course.list("-created_date", 50),
        base44.entities.User.filter({ role: "livreur" }),
      ]);
      setCourses(coursesData);
      setLivreurs(livreursData);
      setLoading(false);
    };
    load();
  }, []);

  const today = new Date().toDateString();
  const coursesToday = courses.filter(c => new Date(c.created_date).toDateString() === today);
  const enAttente = courses.filter(c => c.statut === "en_attente");
  const livreursActifs = livreurs.filter(l => l.disponible);
  const totalRevenu = courses
    .filter(c => c.statut === "livree" && c.commission_active)
    .reduce((sum, c) => sum + (c.commission || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard CDL</h1>
        <p className="text-sm text-muted-foreground">Centrale des Livraisons - Ouagadougou</p>
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
                <p className="text-xs text-muted-foreground">Livreurs actifs</p>
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
                <p className="text-2xl font-bold">{totalRevenu}</p>
                <p className="text-xs text-muted-foreground">Commissions (FCFA)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Today */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Aujourd'hui</p>
            <p className="text-xs text-muted-foreground">{moment().format("DD MMMM YYYY")}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-primary">{coursesToday.length}</p>
            <p className="text-xs text-muted-foreground">courses</p>
          </div>
        </CardContent>
      </Card>

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

      {/* Quick links */}
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
      </div>
    </div>
  );
}