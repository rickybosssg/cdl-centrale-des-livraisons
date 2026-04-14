import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Package, Plus, Clock, CheckCircle2, Truck, Store, MessageCircle, User, ShoppingBag, TrendingUp } from "lucide-react";
import NotationCourse from "../../components/NotationCourse";
import PubliciteHomeBanner from "@/components/PubliciteHomeBanner";
import BedouWidget from "../../components/BedouWidget";
import EffectuerDeplacement from "./EffectuerDeplacement";
import ChatAdmin from "@/components/ChatAdmin";
import AdCarousel from "@/components/AdCarousel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import CourseCard from "../../components/CourseCard";

export default function ClientHome({ user }) {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showMessages, setShowMessages] = useState(false);
  const [courseANoter, setCourseANoter] = useState(null);

  // Demande géolocalisation
  useEffect(() => {
    if (!user?.email || user?.gps_latitude || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        base44.auth.updateMe({
          gps_latitude: pos.coords.latitude,
          gps_longitude: pos.coords.longitude,
        });
      },
      () => {}
    );
  }, [user?.email, user?.id]);

  // Charger courses — Guard stricte sur user.email
  useEffect(() => {
    if (!user?.email) return; // ⚠️ GUARD AVANT TOUT
    let isMounted = true;

    const load = async () => {
      if (!isMounted) return;
      try {
        const data = await base44.entities.Course.filter(
          { client_email: user.email },
          "-created_date",
          20
        );
        if (isMounted) setCourses(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('[ClientHome] Load error:', err);
        if (isMounted) setCourses([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    load();

    const unsub = base44.entities.Course.subscribe((event) => {
      if (!isMounted) return;
      if (!event?.data?.client_email || event.data.client_email !== user.email) return;
      if (event.type === "create") {
        setCourses(prev => [event.data, ...prev]);
      } else if (event.type === "update") {
        const updated = event.data;
        setCourses(prev => prev.map(c => c?.id === event.id ? updated : c));
        // Déclencher notation si course vient de passer en "livree"
        if (updated?.statut === 'livree' && updated?.livreur_email && !updated?.note_donnee) {
          setCourseANoter(updated);
        }
      } else if (event.type === "delete") {
        setCourses(prev => prev.filter(c => c?.id !== event.id));
      }
    });

    return () => { 
      isMounted = false;
      if (unsub) unsub(); 
    };
  }, [user?.email]);

  // Guard après tous les hooks
  if (!user || !user?.email || !user?.id) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-sm text-muted-foreground">Profil non chargé</p>
      </div>
    );
  }

  const safeCourses = Array.isArray(courses) ? courses : [];
  const activeCourses = safeCourses.filter(c => !['livree', 'annulee'].includes(c?.statut));
  const completedCount = safeCourses.filter(c => c?.statut === 'livree').length;

  // Détecter courses terminées non notées au chargement (cas client qui revient)
  useEffect(() => {
    if (!loading && safeCourses.length > 0 && !courseANoter) {
      const aNoter = safeCourses.find(c => c?.statut === 'livree' && c?.livreur_email && !c?.note_donnee);
      if (aNoter) setCourseANoter(aNoter);
    }
  }, [loading]);

  return (
    <div className="space-y-0">
      {/* Modal notation automatique */}
      {courseANoter && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0">
          <div className="w-full max-w-md bg-background rounded-t-3xl p-6 pb-10 space-y-4 animate-in slide-in-from-bottom-full duration-300">
            <div className="text-center">
              <div className="h-14 w-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                <span className="text-3xl">⭐</span>
              </div>
              <p className="text-lg font-extrabold">Notez votre livreur</p>
              <p className="text-sm text-muted-foreground mt-1">
                Course {courseANoter.quartier_depart} → {courseANoter.quartier_arrivee}
              </p>
            </div>
            <NotationCourse
              course={courseANoter}
              onDone={() => {
                setCourses(prev => prev.map(c => c?.id === courseANoter.id ? { ...c, note_donnee: true } : c));
                setCourseANoter(null);
              }}
            />
            <button
              onClick={() => setCourseANoter(null)}
              className="w-full text-xs text-muted-foreground underline py-2"
            >
              Pas maintenant (vous pourrez noter plus tard)
            </button>
          </div>
        </div>
      )}

      {user && <PubliciteHomeBanner userRole="client" userId={user.id} userEmail={user.email} />}
      <div className="space-y-6 mt-4">
        {/* Welcome */}
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Bonjour, {user.full_name?.split(" ")[0] || "Client"} 👋</h1>
          <p className="text-sm text-muted-foreground">Bienvenue sur CDL</p>
        </div>

        <BedouWidget user={user} />

        <AdCarousel placement="accueil" userRole="client" />

        {/* Commander */}
        <Link to="/commander">
          <div className="relative overflow-hidden w-full p-6 rounded-3xl bg-gradient-to-br from-primary to-blue-700 text-white shadow-xl active:scale-[0.97] transition-all cursor-pointer">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <span className="text-4xl">🛵</span>
              </div>
              <div className="flex-1">
                <p className="text-2xl font-extrabold tracking-tight">Commander une course</p>
                <p className="text-sm text-white/80 mt-0.5">Livreur en quelques minutes</p>
              </div>
            </div>
          </div>
        </Link>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-3 text-center">
              <Clock className="h-5 w-5 text-amber-500 mx-auto mb-1" />
              <p className="text-xl font-bold text-amber-700">{activeCourses.length}</p>
              <p className="text-[10px] text-amber-600">En attente</p>
            </CardContent>
          </Card>
          <Card className="border-green-200 bg-green-50">
            <CardContent className="p-3 text-center">
              <CheckCircle2 className="h-5 w-5 text-green-500 mx-auto mb-1" />
              <p className="text-xl font-bold text-green-700">{completedCount}</p>
              <p className="text-[10px] text-green-600">Traitées</p>
            </CardContent>
          </Card>
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-3 text-center">
              <TrendingUp className="h-5 w-5 text-primary mx-auto mb-1" />
              <p className="text-xl font-bold text-primary">
                {safeCourses.length > 0 ? Math.round((completedCount / safeCourses.length) * 100) : 0}%
              </p>
              <p className="text-[10px] text-primary/70">Conversion</p>
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3">
          <Link to="/commander">
            <Card className="bg-primary text-primary-foreground hover:opacity-90 transition-opacity cursor-pointer h-full">
              <CardContent className="p-4 flex flex-col items-center gap-2 text-center">
                <Plus className="h-6 w-6" />
                <div>
                  <p className="font-semibold text-sm">Commander</p>
                  <p className="text-xs opacity-80">une course</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link to="/effectuer-deplacement">
            <Card className="bg-accent text-accent-foreground hover:opacity-90 transition-opacity cursor-pointer h-full">
              <CardContent className="p-4 flex flex-col items-center gap-2 text-center">
                <User className="h-6 w-6" />
                <div>
                  <p className="font-semibold text-sm">Effectuer</p>
                  <p className="text-xs opacity-80">un déplacement</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link to="/mall">
            <Card className="hover:opacity-90 transition-opacity cursor-pointer h-full border-primary/30">
              <CardContent className="p-4 flex flex-col items-center gap-2 text-center">
                <Store className="h-6 w-6 text-primary" />
                <div>
                  <p className="font-semibold text-sm">Boutiques</p>
                  <p className="text-xs text-muted-foreground">Commander en ligne</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link to="/mes-commandes-marketplace">
            <Card className="hover:opacity-90 transition-opacity cursor-pointer h-full">
              <CardContent className="p-4 flex flex-col items-center gap-2 text-center">
                <ShoppingBag className="h-6 w-6 text-accent" />
                <div>
                  <p className="font-semibold text-sm">Commandes</p>
                  <p className="text-xs text-muted-foreground">Mes achats</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Active courses */}
        {activeCourses.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Courses actives</h2>
              <Link to="/mes-courses" className="text-xs text-primary font-medium">Voir tout</Link>
            </div>
            {activeCourses.map((course) => (
              <Link key={course?.id} to={`/course/${course?.id}`}>
                <CourseCard course={course} />
              </Link>
            ))}
          </div>
        )}

        {/* Messages */}
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
              <p className="text-sm font-semibold mb-3">💬 Discussion</p>
              <ChatAdmin userEmail={user.email} userRole="client" currentUser={user} />
            </CardContent>
          </Card>
        )}

        {safeCourses.length === 0 && !loading && (
          <div className="text-center py-8 space-y-2">
            <Truck className="h-12 w-12 text-muted-foreground/40 mx-auto" />
            <p className="text-muted-foreground text-sm">Aucune course</p>
            <p className="text-xs text-muted-foreground">Commandez votre première livraison !</p>
          </div>
        )}
      </div>
    </div>
  );
}