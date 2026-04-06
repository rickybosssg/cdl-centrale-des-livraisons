import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Package, Truck, CheckCircle2, Clock, MapPin, MessageCircle } from "lucide-react";
import PubliciteHomeBanner from "../../components/PubliciteHomeBanner";
import PubliciteDisplayLivreur from "../../components/PubliciteDisplayLivreur";
import LivreurBadges from "../../components/LivreurBadges";
import LivreurGameStats from "../../components/LivreurGameStats";
import ChatAdmin from "@/components/ChatAdmin";
import BedouWidget from "../../components/BedouWidget";
import { toast } from "sonner";
import SoldeBlock from "../../components/SoldeBlock";
import CoursePendante from "../livreur/CoursePendante";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import CourseCard from "../../components/CourseCard";
import NewCourseAlert from "../../components/NewCourseAlert";
import ForteDemandeBanner from "../../components/ForteDemandeBanner";

export default function LivreurHome({ user }) {
  // Guard immédiate
  if (!user?.email) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-sm text-muted-foreground">Profil non chargé</p>
      </div>
    );
  }

  const [courses, setCourses] = useState([]);
  const [disponible, setDisponible] = useState(user?.disponible !== false);
  const [loading, setLoading] = useState(true);
  const [showMessages, setShowMessages] = useState(false);
  const [classement, setClassement] = useState(null);
  const [zoneChaudeCount, setZoneChaudeCount] = useState(0);
  const [livreursActifsCount, setLivreursActifsCount] = useState(0);
  const [alertCourse, setAlertCourse] = useState(null);
  const [gpsBloque, setGpsBloque] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsErrorMsg, setGpsErrorMsg] = useState('');

  const activerGPS = () => {
    if (!navigator.geolocation) {
      setGpsBloque(true);
      setGpsErrorMsg('Localisation non disponible sur cet appareil');
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
        });
      },
      (err) => {
        setGpsLoading(false);
        // Code 1 = refus, Code 2 = GPS désactivé, Code 3 = timeout
        // Ne pas bloquer l'écran entier — laisser le livreur utiliser l'app
        if (err.code === 2) {
          setGpsErrorMsg('GPS désactivé. Activez la localisation dans les paramètres.');
        } else if (err.code === 1) {
          setGpsErrorMsg('Permission refusée. Autorisez la localisation dans les paramètres.');
        } else {
          setGpsErrorMsg('Position introuvable. Vérifiez votre GPS.');
        }
        setGpsBloque(false); // Ne pas bloquer l'écran — juste afficher un bandeau
        base44.auth.updateMe({ gps_enabled: false }).catch(() => {});
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  // Demande GPS au mount + retour depuis paramètres
  useEffect(() => {
    activerGPS();
    const onVisible = () => {
      if (document.visibilityState === 'visible' && gpsErrorMsg) activerGPS();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Charger courses
  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      if (!isMounted) return;
      try {
        const data = await base44.entities.Course.filter({ livreur_email: user.email }, "-created_date", 10);
        if (isMounted) {
          const arr = Array.isArray(data) ? data : [];
          setCourses(arr);
          // Point 5: Réafficher alerte si course en attente non répondue (persistance)
          const missed = arr.find(c => c?.statut === 'assignee_attente' && c?.livreur_email === user.email);
          if (missed) setAlertCourse(missed);
        }
        
        const pending = await base44.entities.Course.filter({ statut: 'en_attente' }, '-created_date', 20);
        if (isMounted) setZoneChaudeCount(Array.isArray(pending) ? pending.length : 0);
        // Compter livreurs actifs pour détection forte demande
        const livActifs = await base44.entities.User.filter({ user_type: 'livreur', disponible: true });
        if (isMounted) setLivreursActifsCount(Array.isArray(livActifs) ? livActifs.length : 0);
      } catch (err) {
        console.error('[LivreurHome] Load error:', err);
        if (isMounted) setCourses([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    load();
    base44.functions.invoke('getLivreurClassement', {}).then(r => {
      if (isMounted && r?.data?.rank) setClassement(r.data);
    }).catch(() => {});

    const unsub = base44.entities.Course.subscribe((event) => {
      if (!isMounted) return;
      if (event.type === 'create' && event?.data?.livreur_email === user.email) {
        setCourses(prev => [event.data, ...prev]);
        setAlertCourse(event.data);
      } else if (event.type === 'update' && event?.data?.livreur_email === user.email) {
        setCourses(prev => prev.map(c => c?.id === event.id ? event.data : c));
        if (event.data?.statut === 'assignee_attente') {
          setAlertCourse(event.data);
        } else {
          // Course acceptée par quelqu'un d'autre ou annulée — effacer l'alerte si c'était cette course
          setAlertCourse(prev => prev?.id === event.id ? null : prev);
        }
      } else if (event.type === 'update' && event?.data?.livreur_email !== user.email) {
        // Course redistribuée à un autre livreur — effacer alerte si c'était notre alerte
        setAlertCourse(prev => prev?.id === event.id ? null : prev);
      }
    });

    return () => { 
      isMounted = false;
      if (unsub) unsub(); 
    };
  }, [user?.email]);

  const toggleDisponible = async () => {
    if (disponible === false && gpsBloque) {
      toast.error('Localisation requise');
      return;
    }

    const newVal = !disponible;
    setDisponible(newVal);
    try {
      await base44.auth.updateMe({ disponible: newVal });
      toast.success(newVal ? '🟢 En ligne' : '🔴 Hors ligne');
    } catch (err) {
      setDisponible(!newVal);
      toast.error('Erreur statut');
    }
  };

  const coursesArray = Array.isArray(courses) ? courses : [];
  const activeCourse = coursesArray.find(c => ["acceptee", "en_cours"].includes(c?.statut));
  const coursePendante = coursesArray.find(c => c?.statut === "assignee_attente" && c?.livreur_email === user.email);
  const completedToday = coursesArray.filter(c => {
    if (c?.statut !== "livree") return false;
    const today = new Date().toDateString();
    return new Date(c?.date_livraison)?.toDateString() === today;
  });

  const gainsJour = completedToday.reduce((sum, c) => sum + (c?.gain_livreur || 0), 0);

  // Bandeau GPS (non bloquant)
  const GpsBandeau = gpsErrorMsg ? (
    <div className="mx-4 rounded-2xl p-3 bg-amber-50 border border-amber-200 flex items-start gap-3">
      <MapPin className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-amber-800">{gpsErrorMsg}</p>
      </div>
      <div className="flex gap-2 flex-shrink-0">
        <button
          onClick={activerGPS}
          disabled={gpsLoading}
          className="text-xs font-bold text-amber-700 border border-amber-300 rounded-lg px-2 py-1 bg-white disabled:opacity-50"
        >
          {gpsLoading ? '...' : 'Réessayer'}
        </button>
        <button
          onClick={() => {
            try { window.open('intent://settings/location#Intent;scheme=android-app;end', '_blank'); }
            catch (_) { alert('Ouvrez manuellement : Paramètres → Localisation'); }
          }}
          className="text-xs font-bold text-white bg-amber-500 rounded-lg px-2 py-1"
        >
          Paramètres
        </button>
      </div>
    </div>
  ) : null;

  // Vérification blocage
  if (user?.livreur_bloque) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <SoldeBlock user={user} />
      </div>
    );
  }

  // Vérification validation
  if (user?.statut_validation_livreur && user.statut_validation_livreur !== "valide") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <p className="text-lg font-bold">Compte en attente de validation</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-20">
      <NewCourseAlert course={alertCourse} onClose={() => setAlertCourse(null)} user={user} />
      {GpsBandeau}
      
      {user && <PubliciteHomeBanner userRole="livreur" userId={user.id} userEmail={user.email} />}
      
      <ForteDemandeBanner
        coursesEnAttente={zoneChaudeCount}
        livreursActifs={livreursActifsCount}
        disponible={disponible}
      />

      {!disponible && (
        <div className="mx-4 mb-2 p-3 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-white text-sm font-bold text-center shadow">
          💰 Mets-toi en ligne !
        </div>
      )}

      {coursePendante && (
        <CoursePendante course={coursePendante} onRespond={() => { setCourses([]); }} />
      )}

      <div className="flex items-center justify-between px-4">
        <div>
          <h1 className="text-xl font-bold">Salut, {user.full_name?.split(" ")[0] || "Livreur"} 🛵</h1>
          <p className="text-xs text-muted-foreground">Prêt à livrer ?</p>
        </div>
      </div>

      {/* Bouton principal En ligne/Hors ligne */}
      <div className="px-4">
        <button
          onClick={toggleDisponible}
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
              <span className="text-3xl">{disponible ? '🟢' : '🔴'}</span>
            </div>
            <div className="text-left">
              <p className="text-2xl font-extrabold tracking-tight">
                {disponible ? 'EN LIGNE' : 'HORS LIGNE'}
              </p>
            </div>
          </div>
        </button>
      </div>

      <div className="px-4">
        <BedouWidget user={user} />
      </div>

      <div className="px-4">
        <SoldeBlock user={user} />
      </div>

      {user && <PubliciteDisplayLivreur userId={user.id} userEmail={user.email} />}

      {disponible && zoneChaudeCount >= 3 && (
        <div className="mx-4 rounded-2xl p-4 bg-gradient-to-r from-orange-500 to-red-500 text-white text-center shadow-lg">
          <p className="text-lg font-extrabold">🔥 ZONE CHAUDE 🔥</p>
          <p className="text-sm font-medium mt-0.5">{zoneChaudeCount} courses en attente</p>
        </div>
      )}

      <div className="px-4">
        <LivreurBadges user={user} classement={classement} />
        <LivreurGameStats user={user} coursesToday={completedToday.length} classement={classement} />
      </div>

      <div className="px-4 grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <Truck className="h-5 w-5 text-primary mx-auto mb-1" />
            <p className="text-xl font-bold">{completedToday.length}</p>
            <p className="text-[10px] text-muted-foreground">Aujourd'hui</p>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-3 text-center">
            <span className="text-lg">💰</span>
            <p className="text-xl font-bold text-green-700">{gainsJour.toLocaleString()}</p>
            <p className="text-[10px] text-green-600">FCFA</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <CheckCircle2 className="h-5 w-5 text-green-500 mx-auto mb-1" />
            <p className="text-xl font-bold">{coursesArray.filter(c => c?.statut === "livree").length}</p>
            <p className="text-[10px] text-muted-foreground">Total</p>
          </CardContent>
        </Card>
      </div>

      {activeCourse && (
        <div className="px-4 space-y-3">
          <h2 className="font-semibold">Course en cours</h2>
          <Link to={`/course-livreur/${activeCourse.id}`}>
            <CourseCard course={activeCourse} />
          </Link>
        </div>
      )}

      {/* Messages */}
      <div className="px-4">
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
          <Card className="mt-3">
            <CardContent className="p-4">
              <p className="text-sm font-semibold mb-3">💬 Discussion</p>
              <ChatAdmin userEmail={user.email} userRole="livreur" currentUser={user} />
            </CardContent>
          </Card>
        )}
      </div>

      <div className="px-4 grid grid-cols-2 gap-3">
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