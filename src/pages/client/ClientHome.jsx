import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Package, Plus, Clock, CheckCircle2, Truck, Store, MessageCircle, User, ShoppingBag, TrendingUp } from "lucide-react";
import BedouWidget from "../../components/BedouWidget";
import EffectuerDeplacement from "./EffectuerDeplacement";
import ChatAdmin from "@/components/ChatAdmin";
import BannierePublicitaire from "../../components/BannierePublicitaire";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import CourseCard from "../../components/CourseCard";

export default function ClientHome({ user }) {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showMessages, setShowMessages] = useState(false);
  const [showDeplacement, setShowDeplacement] = useState(false);

  // Demande géolocalisation à la première connexion
  useEffect(() => {
    if (!user.gps_latitude && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          base44.auth.updateMe({
            gps_latitude: pos.coords.latitude,
            gps_longitude: pos.coords.longitude,
          });
        },
        () => {} // silencieux si refusé
      );
    }
  }, [user.id]);

  useEffect(() => {
    const load = async () => {
      const data = await base44.entities.Course.filter(
        { client_email: user.email },
        "-created_date",
        20
      );
      setCourses(data);
      setLoading(false);
    };
    load();

    const unsub = base44.entities.Course.subscribe((event) => {
      if (!event.data || event.data.client_email !== user.email) return;
      if (event.type === "create") {
        setCourses(prev => [event.data, ...prev]);
      } else if (event.type === "update") {
        setCourses(prev => prev.map(c => c.id === event.id ? event.data : c));
      } else if (event.type === "delete") {
        setCourses(prev => prev.filter(c => c.id !== event.id));
      }
    });
    return unsub;
  }, [user.email]);

  const activeCourses = courses.filter(c => !["livree", "annulee"].includes(c.statut));
  const completedCount = courses.filter(c => c.statut === "livree").length;

  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Bonjour, {user.full_name?.split(" ")[0]} 👋</h1>
        <p className="text-sm text-muted-foreground">Bienvenue sur CDL - Centrale des Livraisons</p>
      </div>

      {/* Bedou */}
      <BedouWidget user={user} />

      {/* Bannière publicitaire */}
      <BannierePublicitaire placement="home_client" />

      {/* Bouton WhatsApp Commander */}
      <div className="space-y-1">
        <a
          href={`https://wa.me/22600000000?text=${encodeURIComponent('📦 Nouvelle commande CDL\nType : envoyer un colis / récupérer un colis / déplacement\n📍 Départ : \n📍 Destination : \n📞 Téléphone : \n📝 Détails : ')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 w-full p-4 rounded-2xl bg-green-500 text-white font-bold shadow-lg hover:bg-green-600 active:scale-[0.98] transition-all"
        >
          <span className="text-3xl">💬</span>
          <div className="flex-1">
            <p className="text-base font-extrabold">Commander via WhatsApp</p>
            <p className="text-xs text-white/80">Rapide · Direct · Sans friction</p>
          </div>
          <span className="text-xl">→</span>
        </a>
        <p className="text-[11px] text-muted-foreground text-center px-2">
          Remplissez le message pré-rempli et envoyez-le pour lancer votre commande rapidement.
        </p>
      </div>

      {/* Stats acquisition */}
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
              {courses.length > 0 ? Math.round((completedCount / courses.length) * 100) : 0}%
            </p>
            <p className="text-[10px] text-primary/70">Conversion</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
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
        <Link to="/vitrines">
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
            <ChatAdmin userEmail={user.email} userRole="client" currentUser={user} />
          </CardContent>
        </Card>
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