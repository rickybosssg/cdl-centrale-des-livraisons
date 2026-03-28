import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Package, Plus, Clock, CheckCircle2, Truck, Store } from "lucide-react";
import BannierePublicitaire from "../../components/BannierePublicitaire";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import CourseCard from "../../components/CourseCard";

export default function ClientHome({ user }) {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const data = await base44.entities.Course.filter(
        { client_email: user.email },
        "-created_date",
        5
      );
      setCourses(data);
      setLoading(false);
    };
    load();
  }, [user.email]);

  const activeCourses = courses.filter(c => !["livree", "annulee"].includes(c.statut));
  const completedCount = courses.filter(c => c.statut === "livree").length;

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Bonjour, {user.full_name?.split(" ")[0]} 👋</h1>
        <p className="text-sm text-muted-foreground">Bienvenue sur CDL - Centrale des Livraisons</p>
      </div>

      {/* Bannière publicitaire */}
      <BannierePublicitaire placement="home_client" />

      {/* Quick action */}
      <Link to="/vitrines">
        <Card className="bg-primary text-primary-foreground hover:opacity-90 transition-opacity cursor-pointer">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center">
              <Plus className="h-6 w-6" />
            </div>
            <div>
              <p className="font-semibold text-lg">Commander une course</p>
              <p className="text-sm opacity-80">Livraison rapide à Ouagadougou</p>
            </div>
          </CardContent>
        </Card>
      </Link>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <Clock className="h-5 w-5 text-amber-500 mx-auto mb-1" />
            <p className="text-xl font-bold">{activeCourses.length}</p>
            <p className="text-[10px] text-muted-foreground">En cours</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <CheckCircle2 className="h-5 w-5 text-green-500 mx-auto mb-1" />
            <p className="text-xl font-bold">{completedCount}</p>
            <p className="text-[10px] text-muted-foreground">Livrées</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Package className="h-5 w-5 text-primary mx-auto mb-1" />
            <p className="text-xl font-bold">{courses.length}</p>
            <p className="text-[10px] text-muted-foreground">Total</p>
          </CardContent>
        </Card>
      </div>

      {/* Active courses */}
      {activeCourses.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Courses actives</h2>
            <Link to="/mes-courses" className="text-xs text-primary font-medium">Voir tout</Link>
          </div>
          {activeCourses.map((course) => (
            <Link key={course.id} to={`/course/${course.id}`}>
              <CourseCard course={course} />
            </Link>
          ))}
        </div>
      )}

      {courses.length === 0 && !loading && (
        <div className="text-center py-8 space-y-2">
          <Truck className="h-12 w-12 text-muted-foreground/40 mx-auto" />
          <p className="text-muted-foreground text-sm">Aucune course pour le moment</p>
          <p className="text-xs text-muted-foreground">Commandez votre première livraison !</p>
        </div>
      )}
    </div>
  );
}