import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Package, Truck, CheckCircle2, Clock, MapPin, MessageCircle } from "lucide-react";
import LivreurBadges from "../../components/LivreurBadges";
import LivreurGameStats from "../../components/LivreurGameStats";
import ChatAdmin from "@/components/ChatAdmin";
import BannierePublicitaire from "../../components/BannierePublicitaire";
import BedouWidget from "../../components/BedouWidget";
import { toast } from "sonner";
import SoldeBlock from "../../components/SoldeBlock";
import CoursePendante from "../livreur/CoursePendante";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import CourseCard from "../../components/CourseCard";

export default function LivreurHome({ user }) {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [disponible, setDisponible] = useState(user.disponible !== false);
  const [loading, setLoading] = useState(true);
  const [showMessages, setShowMessages] = useState(false);
  const [classement, setClassement] = useState(null);

  const [zoneChaudeCount, setZoneChaudeCount] = useState(0);

  const reloadCourses = async () => {
    const data = await base44.entities.Course.filter({ livreur_email: user.email }, "-created_date", 10);
    setCourses(data);
    setLoading(false);
    // Vérifier zone chaude
    const pending = await base44.entities.Course.filter({ statut: 'en_attente' }, '-created_date', 20);
    setZoneChaudeCount(pending.length);
  };
  const [gpsBloque, setGpsBloque] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsErrorMsg, setGpsErrorMsg] = useState('');
  const [gpsUnsupported, setGpsUnsupported] = useState(false);

  const activerGPS = () => {
    if (!navigator.geolocation) {
      setGpsUnsupported(true);
      setGpsBloque(true);
      return;
    }
    setGpsLoading(true);
    setGpsErrorMsg('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLoading(false);
        setGpsBloque(false);
        base44.auth.updateMe({
          gps_latitude: pos.coords.latitude,
          gps_longitude: pos.coords.longitude,
          gps_enabled: true,
          disponible: true,
        });
        // Mise à jour GPS toutes les 10s
        const interval = setInterval(() => {
          navigator.geolocation.getCurrentPosition((p) => {
            base44.auth.updateMe({
              gps_latitude: p.coords.latitude,
              gps_longitude: p.coords.longitude,
            });
          }, () => {});
        }, 10000);
        return () => clearInterval(interval);
      },
      (err) => {
        setGpsLoading(false);
        setGpsBloque(true);
        base44.auth.updateMe({ gps_enabled: false });
        if (err.code === 1) {
          setGpsErrorMsg('Veuillez autoriser la localisation pour recevoir des courses.');
        } else if (err.code === 2) {
          setGpsErrorMsg('Impossible d’obtenir votre position. Vérifiez que le GPS de votre téléphone est activé.');
        } else {
          setGpsErrorMsg('La géolocalisation a échoué. Veuillez réessayer.');
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  // Demande GPS automatique au chargement
  useEffect(() => { activerGPS(); }, []);

  useEffect(() => {
    reloadCourses();
    // Charger classement en arrière-plan
    base44.functions.invoke('getLivreurClassement', {}).then(r => {
      if (r.data?.rank) setClassement(r.data);
    }).catch(() => {});

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

  const [toggleLoading, setToggleLoading] = useState(false);

  const toggleDisponible = async () => {
    // Vérifications SEULEMENT si on veut passer EN LIGNE
    if (disponible === false) {
      // On est hors ligne et on veut passer en ligne
      if (gpsBloque) {
        toast.error('Vous devez activer votre localisation pour passer en ligne');
        return;
      }
      if (user.statut_validation_livreur !== 'valide') {
        toast.error('Votre compte doit être validé avant de pouvoir passer en ligne');
        return;
      }
    }
    
    const newVal = !disponible;
    setToggleLoading(true);
    setDisponible(newVal);
    try {
      await base44.auth.updateMe({ disponible: newVal });
      toast.success(newVal ? '🟢 Vous êtes maintenant en ligne' : '🔴 Vous êtes maintenant hors ligne');
    } catch (err) {
      setDisponible(!newVal); // Revert on error
      toast.error('Impossible de changer votre statut. Veuillez réessayer.');
    } finally {
      setToggleLoading(false);
    }
  };

  const activeCourse = courses.find(c => ["acceptee", "en_cours"].includes(c.statut));
  const coursePendante = courses.find(c => c.statut === "assignee_attente" && c.livreur_email === user.email);

  // Message inactivité si hors ligne
  const inactivityMsg = !disponible ? (
    <div className="mx-4 mb-2 p-3 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-white text-sm font-bold text-center shadow">
      💰 Gagne de l'argent maintenant — mets-toi en ligne !
    </div>
  ) : null;

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

          {gpsUnsupported ? (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
              📱 Ouvrez CDL dans <strong>Google Chrome</strong> et activez le GPS de votre téléphone.
            </div>
          ) : (
            <>
              {gpsErrorMsg && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
                  {gpsErrorMsg}
                </div>
              )}

              <button
                onClick={activerGPS}
                disabled={gpsLoading}
                className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm disabled:opacity-70 flex items-center justify-center gap-2"
              >
                {gpsLoading ? (
                  <><span className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" /> Demande de localisation en cours...</>
                ) : 'Activer la localisation'}
              </button>

              {gpsErrorMsg && (
                <a
                  href="app-settings:location"
                  onClick={(e) => { e.preventDefault(); }}
                  className="text-xs text-primary underline"
                >
                  Ouvrir les paramètres de localisation
                </a>
              )}
            </>
          )}
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
    <div className="space-y-5">
      {/* Message inactivité */}
      {inactivityMsg}

      {/* Course pendante (dispatch auto) */}
      {coursePendante && (
        <CoursePendante course={coursePendante} onRespond={reloadCourses} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Salut, {user.full_name?.split(" ")[0]} 🛵</h1>
          <p className="text-xs text-muted-foreground">Prêt à livrer ?</p>
        </div>
      </div>

      {/* BOUTON PRINCIPAL EN LIGNE / HORS LIGNE */}
      <button
        onClick={toggleDisponible}
        disabled={toggleLoading}
        className={`w-full rounded-2xl p-5 flex items-center justify-between shadow-lg transition-all active:scale-[0.98] border-2 ${
          disponible
            ? 'bg-green-500 border-green-600 text-white'
            : 'bg-gray-100 border-gray-300 text-gray-800'
        }`}
      >
        <div className="flex items-center gap-4">
          <div className={`h-14 w-14 rounded-full flex items-center justify-center shadow-inner ${
            disponible ? 'bg-white/20' : 'bg-white'
          }`}>
            {toggleLoading ? (
              <span className="h-7 w-7 border-4 border-current/40 border-t-current rounded-full animate-spin inline-block" />
            ) : (
              <span className="text-3xl">{disponible ? '🟢' : '🔴'}</span>
            )}
          </div>
          <div className="text-left">
            <p className="text-2xl font-extrabold tracking-tight">
              {disponible ? 'EN LIGNE' : 'HORS LIGNE'}
            </p>
            <p className={`text-sm font-medium ${
              disponible ? 'text-white/80' : 'text-gray-500'
            }`}>
              {disponible ? 'Vous recevez des courses' : 'Vous ne recevez pas de courses'}
            </p>
          </div>
        </div>
        <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
          disponible ? 'bg-white/20' : 'bg-gray-200'
        }`}>
          <span className="text-2xl">{disponible ? '✓' : '↻'}</span>
        </div>
      </button>

      {/* Bedou */}
      <BedouWidget user={user} />

      {/* Solde commission */}
      <SoldeBlock user={user} />

      {/* Bannière publicitaire */}
      <BannierePublicitaire placement="home_livreur" />

      {/* Zone chaude */}
      {disponible && zoneChaudeCount >= 3 && (
        <div className="rounded-2xl p-4 bg-gradient-to-r from-orange-500 to-red-500 text-white text-center shadow-lg">
          <p className="text-lg font-extrabold">🔥 ZONE CHAUDE 🔥</p>
          <p className="text-sm font-medium mt-0.5">{zoneChaudeCount} courses en attente — fonce !</p>
        </div>
      )}

      {/* Message motivation */}
      <div className={`rounded-xl p-3 text-sm font-medium text-center ${
        disponible ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
      }`}>
        {motivationMsg}
      </div>

      {/* Classement top 3 */}
      {classement && classement.rank <= 3 && (
        <div className="rounded-2xl p-4 bg-gradient-to-r from-yellow-400 to-amber-500 text-white text-center shadow">
          <p className="text-2xl font-black">🏆 Tu es TOP {classement.rank} aujourd'hui !</p>
          <p className="text-sm text-white/90 mt-0.5">Continue comme ça — tu écrases la concurrence 🔥</p>
        </div>
      )}

      {/* Badges & Classement */}
      <LivreurBadges user={user} classement={classement} />

      {/* Gamification : objectifs, streak, comparaison */}
      <LivreurGameStats user={user} coursesToday={completedTodayCount} classement={classement} />

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