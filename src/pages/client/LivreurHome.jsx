import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Package, Truck, CheckCircle2, Clock, MapPin, MessageCircle } from "lucide-react";
import ChatAdmin from "@/components/ChatAdmin";
import BannierePublicitaire from "../../components/BannierePublicitaire";
import { toast } from "sonner";
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
  const [showMessages, setShowMessages] = useState(false);

  const reloadCourses = async () => {
    const data = await base44.entities.Course.filter({ livreur_email: user.email }, "-created_date", 10);
    setCourses(data);
    setLoading(false);
  };
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
    reloadCourses();

    const unsub = base44.entities.Course.subscribe((event) => {
      if (event.type === 'create' && event.data?.livreur_email === user.email) {
        setCourses(prev => [event.data, ...prev]);
        toast.info('Nouvelle course disponible !');
      } else if (event.type === 'update' && event.data?.livreur_email === user.email) {
        setCourses(prev => prev.map(c => c.id === event.id ? event.data : c));
      }
    });
    return unsub;
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
  });

  const gainsJour = completedToday.reduce((sum, c) => sum + (c.gain_livreur || 0), 0);
  const completedTodayCount = completedToday.length;

  const motivationMsg = !disponible
    ? "Reste connecté, une course peut arriver à tout moment 💡"
    : completedTodayCount === 0
      ? "Tu n'as pas encore eu de course aujourd'hui — reste disponible ! 🕐"
      : completedTodayCount >= 5
        ? "🔥 Excellent, tu fais partie des livreurs les plus actifs aujourd'hui !"
        : `Bravo pour tes ${completedTodayCount} course${completedTodayCount > 1 ? 's' : ''} aujourd'hui — continue ! 💪`;

  return (
    <div className="space-y-6">
      {/* Course pendante (dispatch auto) */}
      {coursePendante && (
        <CoursePendante
          course={coursePendante}
          onRespond={reloadCourses}
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

      {/* Bannière publicitaire */}
      <BannierePublicitaire placement="home_livreur" />

      {/* Message motivation */}
      <div className={`rounded-xl p-3 text-sm font-medium text-center ${
        disponible ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
      }`}>
        {motivationMsg}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <Truck className="h-5 w-5 text-primary mx-auto mb-1" />
            <p className="text-xl font-bold">{completedTodayCount}</p>
            <p className="text-[10px] text-muted-foreground">Aujourd'hui</p>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-3 text-center">
            <span className="text-lg">💰</span>
            <p className="text-xl font-bold text-green-700">{gainsJour.toLocaleString()}</p>
            <p className="text-[10px] text-green-600">FCFA / jour</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <CheckCircle2 className="h-5 w-5 text-green-500 mx-auto mb-1" />
            <p className="text-xl font-bold">{courses.filter(c => c.statut === "livree").length}</p>
            <p className="text-[10px] text-muted-foreground">Total</p>
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

      {/* Messages CDL */}
      <button
        onClick={() => setShowMessages(!showMessages)}
        className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-colors ${
          showMessages ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted"
        }`}
      >
        <MessageCircle className={`h-5 w-5 ${showMessages ? "text-primary" : "text-muted-foreground"}`} />
        <div className="text-left">
          <p className="font-semibold text-sm">Messages CDL</p>
          <p className="text-xs text-muted-foreground">Discussion avec l'administration</p>
        </div>
      </button>

      {showMessages && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-semibold mb-3">💬 Discussion avec l'Administration CDL</p>
            <ChatAdmin userEmail={user.email} userRole="livreur" currentUser={user} />
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