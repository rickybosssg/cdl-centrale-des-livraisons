import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Package, Truck, CheckCircle2, Clock, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import CourseCard from "../../components/CourseCard";

export default function LivreurHome({ user }) {
  const [courses, setCourses] = useState([]);
  const [disponible, setDisponible] = useState(user.disponible !== false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const data = await base44.entities.Course.filter(
        { livreur_email: user.email },
        "-created_date",
        10
      );
      setCourses(data);
      setLoading(false);
    };
    load();
  }, [user.email]);

  const toggleDisponible = async () => {
    const newVal = !disponible;
    setDisponible(newVal);
    await base44.auth.updateMe({ disponible: newVal });
  };

  const activeCourse = courses.find(c => ["acceptee", "en_cours"].includes(c.statut));
  const completedToday = courses.filter(c => {
    if (c.statut !== "livree") return false;
    const today = new Date().toDateString();
    return new Date(c.date_livraison).toDateString() === today;
  }).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Salut, {user.full_name?.split(" ")[0]} 🛵</h1>
          <p className="text-sm text-muted-foreground">Prêt à livrer ?</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {disponible ? "En ligne" : "Hors ligne"}
          </span>
          <Switch checked={disponible} onCheckedChange={toggleDisponible} />
        </div>
      </div>

      {/* Status Card */}
      <Card className={disponible ? "bg-green-50 border-green-200" : "bg-muted"}>
        <CardContent className="p-4 flex items-center gap-3">
          <div className={`h-3 w-3 rounded-full ${disponible ? "bg-green-500 animate-pulse" : "bg-muted-foreground"}`} />
          <p className="text-sm font-medium">
            {disponible ? "Vous êtes disponible pour les courses" : "Vous êtes hors ligne"}
          </p>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <Truck className="h-5 w-5 text-primary mx-auto mb-1" />
            <p className="text-xl font-bold">{completedToday}</p>
            <p className="text-[10px] text-muted-foreground">Aujourd'hui</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <CheckCircle2 className="h-5 w-5 text-green-500 mx-auto mb-1" />
            <p className="text-xl font-bold">{courses.filter(c => c.statut === "livree").length}</p>
            <p className="text-[10px] text-muted-foreground">Total livrées</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Clock className="h-5 w-5 text-amber-500 mx-auto mb-1" />
            <p className="text-xl font-bold">{activeCourse ? 1 : 0}</p>
            <p className="text-[10px] text-muted-foreground">Active</p>
          </CardContent>
        </Card>
      </div>

      {/* Active course */}
      {activeCourse && (
        <div className="space-y-3">
          <h2 className="font-semibold">Course en cours</h2>
          <Link to={`/course-livreur/${activeCourse.id}`}>
            <CourseCard course={activeCourse} />
          </Link>
        </div>
      )}

      {/* Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link to="/courses-disponibles">
          <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
            <CardContent className="p-4 text-center space-y-2">
              <Package className="h-8 w-8 text-accent mx-auto" />
              <p className="text-sm font-medium">Courses disponibles</p>
            </CardContent>
          </Card>
        </Link>
        <Link to="/mes-livraisons">
          <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
            <CardContent className="p-4 text-center space-y-2">
              <MapPin className="h-8 w-8 text-primary mx-auto" />
              <p className="text-sm font-medium">Mes livraisons</p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}