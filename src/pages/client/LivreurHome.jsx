import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Package, Truck, CheckCircle2, Clock, MapPin } from "lucide-react";
import SoldeBlock from "../../components/SoldeBlock";
import CoursePendante from "../livreur/CoursePendante";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import CourseCard from "../../components/CourseCard";

export default function LivreurHome({ user }) {
  const [courses, setCourses] = useState([]);
  const [disponible, setDisponible] = useState(user.disponible !== false);
  const [loading, setLoading] = useState(true);
  const [gpsBloque, setGpsBloque] = useState(false);

  // Demande GPS obligatoire
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsBloque(false);
        base44.auth.updateMe({
          gps_latitude: pos.coords.latitude,
          gps_longitude: pos.coords.longitude,
          gps_enabled: true,
        });
        // Mise à jour GPS toutes les 15s
        const interval = setInterval(() => {
          navigator.geolocation.getCurrentPosition((p) => {
            base44.auth.updateMe({
              gps_latitude: p.coords.latitude,
              gps_longitude: p.coords.longitude,
            });
          });
        }, 15000);
        return () => clearInterval(interval);
      },
      () => {
        setGpsBloque(true);
        base44.auth.updateMe({ gps_enabled: false });
      },
      { enableHighAccuracy: true }
    );
  }, []);

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
  const coursePendante = courses.find(c => c.statut === "assignee_attente" && c.livreur_email === user.email);

  // GPS bloqué
  if (gpsBloque) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-xs">
          <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <MapPin className="h-8 w-8 text-red-500" />
          </div>
          <p className="text-lg font-bold">Localisation requise</p>
          <p className="text-sm text-muted-foreground">
            CDL a besoin de votre position GPS pour vous attribuer des courses et permettre le suivi en temps réel.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm"
          >
            Activer la localisation
          </button>
        </div>
      </div>
    );
  }

  // Vérification blocage
  if (user.livreur_bloque) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <SoldeBlock user={user} />
      </div>
    );
  }

  // Vérification validation
  if (user.statut_validation_livreur && user.statut_validation_livreur !== "valide") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <p className="text-lg font-bold">Compte en attente</p>
          <p className="text-sm text-muted-foreground">
            Votre compte est en attente de validation par l’administration CDL.
          </p>
        </div>
      </div>
    );
  }
  const completedToday = courses.filter(c => {
    if (c.statut !== "livree") return false;
    const today = new Date().toDateString();
    return new Date(c.date_livraison).toDateString() === today;
  }).length;

  return (
    <div className="space-y-6">
      {/* Course pendante (dispatch auto) */}
      {coursePendante && (
        <CoursePendante
          course={coursePendante}
          onRespond={() => setLoading(true)}
        />
      )}

      {/* Solde */}
      <SoldeBlock user={user} />

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

      {/* Gains du jour */}
      {(user.solde_commission_du || 0) === 0 && (
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-3 flex items-center justify-between">
            <p className="text-sm font-medium text-green-700">Commission CDL</p>
            <span className="text-sm font-bold text-green-600">À jour ✅</span>
          </CardContent>
        </Card>
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
        <Link to="/mes-gains" className="col-span-2">
          <Card className="hover:shadow-md transition-shadow cursor-pointer h-full bg-primary/5 border-primary/20">
            <CardContent className="p-4 text-center space-y-2">
              <CheckCircle2 className="h-8 w-8 text-primary mx-auto" />
              <p className="text-sm font-medium text-primary">Voir mes gains et commissions</p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}