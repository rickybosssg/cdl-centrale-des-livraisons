import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import {
  RefreshCw, Package, Send, Phone, MapPin, TrendingUp,
  Zap, Target, Wifi, WifiOff, Clock, Navigation
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import CourseCard from "../../components/CourseCard";
import usePullToRefresh from "../../hooks/usePullToRefresh";
import { toast } from "sonner";
import { vibrateSuccess } from "@/lib/vibration";
import { triggerWhatsAppNotification, waMsgCourseAcceptedByDriver, waMsgCourseAcceptedDriver } from "@/lib/whatsappNotifications";

const ZONES_ACTIVES = [
  { nom: "Marché Central / Gounghin", niveau: "élevé", color: "text-red-600 bg-red-50 border-red-200", dot: "bg-red-500" },
  { nom: "Pissy / Cissin / Hamdallaye", niveau: "élevé", color: "text-red-600 bg-red-50 border-red-200", dot: "bg-red-500" },
  { nom: "Centre-Ville / Zogona", niveau: "moyen", color: "text-amber-600 bg-amber-50 border-amber-200", dot: "bg-amber-500" },
  { nom: "Ouaga 2000 / Karpala", niveau: "moyen", color: "text-amber-600 bg-amber-50 border-amber-200", dot: "bg-amber-500" },
  { nom: "Périphérie (Tampouy…)", niveau: "faible", color: "text-gray-500 bg-gray-50 border-gray-200", dot: "bg-gray-400" },
];

const HEURES_POINTE = [
  { plage: "7h – 9h", label: "Matin", icon: "🌅" },
  { plage: "12h – 14h", label: "Midi", icon: "☀️" },
  { plage: "17h – 20h", label: "Soir", icon: "🌆" },
];

function isHeurePointe() {
  const h = new Date().getHours();
  return (h >= 7 && h < 9) || (h >= 12 && h < 14) || (h >= 17 && h < 20);
}

function prochaineCreneau() {
  const h = new Date().getHours();
  if (h < 7) return "7h ce matin";
  if (h < 12) return "12h (midi)";
  if (h < 17) return "17h ce soir";
  return "7h demain matin";
}

export default function CoursesDisponibles() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [gainsJour, setGainsJour] = useState(0);
  const [coursesJour, setCoursesJour] = useState(0);
  const OBJECTIF_JOUR = 5000;

  const loadData = useCallback(async () => {
    setLoading(true);
    const me = await base44.auth.me();
    setUser(me);

    // Courses disponibles (en_attente uniquement)
    const data = await base44.entities.Course.filter({ statut: "en_attente" }, "-created_date", 15);
    const URGENCE_SCORE = { tres_urgent: 3, urgent: 2, normal: 1 };
    data.sort((a, b) => (URGENCE_SCORE[b.urgence] || 1) - (URGENCE_SCORE[a.urgence] || 1));
    setCourses(data);

    // Gains du jour
    const today = new Date().toDateString();
    const mesLivraisons = await base44.entities.Course.filter(
      { livreur_email: me.email, statut: "livree" }, "-updated_date", 50
    );
    const livreesToday = mesLivraisons.filter(c =>
      new Date(c.updated_date || c.date_livraison).toDateString() === today
    );
    setCoursesJour(livreesToday.length);
    setGainsJour(livreesToday.reduce((s, c) => s + (c.gain_livreur || 0), 0));

    setLoading(false);
  }, []);

  const { refreshing } = usePullToRefresh(loadData);

  useEffect(() => {
    loadData();
    const unsub = base44.entities.Course.subscribe((event) => {
      if (event.type === "create" && event.data.statut === "en_attente") {
        setCourses(prev => [event.data, ...prev]);
      } else if (event.type === "update") {
        setCourses(prev => prev.filter(c => c.id !== event.id || event.data.statut === "en_attente"));
      }
    });
    return unsub;
  }, []);

  const accepter = async (course) => {
    if (!user) return;
    if (!user.disponible) { toast.error("Vous devez être disponible pour accepter une course"); return; }
    if (user.livreur_bloque) { toast.error("Votre compte est bloqué. Contactez l'administration."); return; }
    setCourses(prev => prev.filter(c => c.id !== course.id));
    await base44.entities.Course.update(course.id, {
      statut: "acceptee",
      livreur_email: user.email,
      livreur_name: user.full_name,
      date_acceptation: new Date().toISOString(),
      mode_assignation: "manuel",
      telephone_livreur: user.telephone || "",
    });
    const now = new Date().toISOString();
    const proposeeAt = course.heure_assignation ? new Date(course.heure_assignation).getTime() : null;
    const tempsReponse = proposeeAt ? Math.round((Date.now() - proposeeAt) / 1000) : null;
    const newMoyenne = tempsReponse && user.temps_reponse_moyen_sec
      ? Math.round((user.temps_reponse_moyen_sec * 0.8) + (tempsReponse * 0.2))
      : tempsReponse || user.temps_reponse_moyen_sec;
    await base44.auth.updateMe({
      nombre_courses_actives: (user.nombre_courses_actives || 0) + 1,
      derniere_course_attribuee_at: now,
      courses_acceptees: (user.courses_acceptees || 0) + 1,
      courses_refusees_consecutives: 0,
      ...(newMoyenne ? { temps_reponse_moyen_sec: newMoyenne } : {}),
    });
    vibrateSuccess();
    toast.success("🛵 Course acceptée ! Bonne livraison !");
    triggerWhatsAppNotification({
      eventType: 'course_accepted_by_driver',
      recipientRole: 'client',
      recipientName: course.client_name || 'Client',
      recipientPhone: course.telephone_expediteur,
      messageText: waMsgCourseAcceptedByDriver(),
      entityId: course.id, entityType: 'course', priority: 'high',
    });
    triggerWhatsAppNotification({
      eventType: 'course_accepted_driver',
      recipientRole: 'driver',
      recipientName: user.full_name,
      recipientPhone: user.telephone,
      messageText: waMsgCourseAcceptedDriver(),
      entityId: course.id, entityType: 'course', priority: 'normal',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const progressPct = Math.min(100, Math.round((gainsJour / OBJECTIF_JOUR) * 100));
  const gpsActif = user?.gps_enabled !== false && user?.gps_latitude;
  const enLigne = user?.disponible !== false && user?.driver_online;
  const enPointe = isHeurePointe();

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Opportunités & Gains</h1>
          <p className="text-xs text-muted-foreground">
            {courses.length > 0
              ? `${courses.length} course(s) disponible(s) maintenant`
              : "Reste connecté — les demandes arrivent en continu"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {refreshing && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
          <Button variant="outline" size="icon" onClick={loadData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Statut + Alerte GPS */}
      <div className="grid grid-cols-2 gap-2">
        <div className={`rounded-xl border p-3 flex items-center gap-2 ${enLigne ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"}`}>
          <div className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${enLigne ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
          <div>
            <p className={`text-xs font-bold ${enLigne ? "text-green-700" : "text-gray-600"}`}>
              {enLigne ? "En ligne" : "Hors ligne"}
            </p>
            <p className="text-[10px] text-muted-foreground">{enLigne ? "Vous recevez des courses" : "Allez en ligne depuis l'accueil"}</p>
          </div>
        </div>
        <div className={`rounded-xl border p-3 flex items-center gap-2 ${gpsActif ? "bg-blue-50 border-blue-200" : "bg-amber-50 border-amber-200"}`}>
          {gpsActif ? <Wifi className="h-4 w-4 text-blue-500 flex-shrink-0" /> : <WifiOff className="h-4 w-4 text-amber-500 flex-shrink-0" />}
          <div>
            <p className={`text-xs font-bold ${gpsActif ? "text-blue-700" : "text-amber-700"}`}>
              GPS {gpsActif ? "actif" : "inactif"}
            </p>
            <p className="text-[10px] text-muted-foreground">{gpsActif ? "Position détectée" : "Activez le GPS"}</p>
          </div>
        </div>
      </div>

      {/* Alerte GPS inactive */}
      {!gpsActif && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 flex items-start gap-3">
          <MapPin className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">GPS désactivé</p>
            <p className="text-xs text-amber-700">Sans GPS, le système ne peut pas vous dispatcher les courses proches.</p>
          </div>
          <Button size="sm" className="text-xs h-8 bg-amber-600 hover:bg-amber-700 flex-shrink-0"
            onClick={() => { navigator.geolocation?.getCurrentPosition(() => { toast.success("GPS activé !"); loadData(); }); }}>
            Activer
          </Button>
        </div>
      )}

      {/* Gains du jour */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-blue-50">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <p className="font-bold text-sm">Gains du jour</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-extrabold text-primary">{gainsJour.toLocaleString()} F</p>
              <p className="text-[10px] text-muted-foreground">{coursesJour} course(s) livrée(s)</p>
            </div>
          </div>
          {/* Barre de progression */}
          <div>
            <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
              <span>Objectif : {OBJECTIF_JOUR.toLocaleString()} F</span>
              <span>{progressPct}%</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${progressPct >= 100 ? "bg-green-500" : progressPct >= 60 ? "bg-primary" : "bg-amber-500"}`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            {progressPct >= 100 && (
              <p className="text-xs text-green-600 font-bold mt-1 text-center">🎉 Objectif atteint !</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Heure de pointe */}
      {enPointe ? (
        <div className="rounded-xl border-2 border-green-400 bg-green-50 p-3 flex items-center gap-3">
          <Zap className="h-5 w-5 text-green-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-green-800">⚡ Heure de pointe en cours !</p>
            <p className="text-xs text-green-700">Forte demande — restez en ligne pour maximiser vos gains</p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 flex items-center gap-3">
          <Clock className="h-4 w-4 text-blue-500 flex-shrink-0" />
          <div>
            <p className="text-xs font-semibold text-blue-800">Activité modérée</p>
            <p className="text-xs text-blue-700">Prochaine forte demande : <strong>{prochaineCreneau()}</strong></p>
          </div>
        </div>
      )}

      {/* Courses disponibles */}
      {courses.length > 0 ? (
        <div className="space-y-3">
          <p className="text-sm font-bold text-green-700">🛵 {courses.length} course(s) à saisir maintenant !</p>
          {courses.map((course) => (
            <CourseCard key={course.id} course={course}>
              {course.type_mission && (
                <div className="space-y-2 text-xs">
                  <div className={`flex items-center gap-2 font-bold px-2 py-1 rounded-lg w-fit ${
                    course.type_mission === 'envoyer' ? 'bg-primary/10 text-primary' : 'bg-accent/10 text-accent'
                  }`}>
                    {course.type_mission === 'envoyer' ? <Send className="h-3 w-3" /> : <RefreshCw className="h-3 w-3" />}
                    {course.type_mission === 'envoyer'
                      ? "Étape 1 → Aller chez l'expéditeur · Étape 2 → Livrer au destinataire"
                      : "Étape 1 → Aller récupérer le colis · Étape 2 → Livrer au client"}
                  </div>
                  {course.telephone_expediteur && (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Phone className="h-3 w-3" />
                      <span>{course.type_mission === 'envoyer' ? 'Expéditeur' : 'Lieu récup.'} : {course.telephone_expediteur}</span>
                    </div>
                  )}
                  {course.telephone_destinataire && (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Phone className="h-3 w-3" />
                      <span>{course.type_mission === 'envoyer' ? 'Destinataire' : 'Client'} : {course.telephone_destinataire}</span>
                    </div>
                  )}
                  {course.instructions_speciales && (
                    <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                      ⚠️ {course.instructions_speciales}
                    </div>
                  )}
                </div>
              )}
              <Button
                className="w-full"
                size="sm"
                onClick={(e) => { e.stopPropagation(); accepter(course); }}
              >
                ✅ Accepter cette course
              </Button>
            </CourseCard>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-center py-4 space-y-1">
            <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mx-auto">
              <Package className="h-7 w-7 text-muted-foreground/50" />
            </div>
            <p className="font-semibold">Pas de course pour le moment</p>
            <p className="text-xs text-muted-foreground">Reste connecté — les demandes arrivent en continu !</p>
          </div>

          {/* Conseils dynamiques */}
          {!enLigne && (
            <div className="flex items-start gap-3 p-3 rounded-xl bg-red-50 border border-red-200">
              <span className="text-lg flex-shrink-0">⚠️</span>
              <div>
                <p className="text-sm font-semibold text-red-800">Vous êtes hors ligne</p>
                <p className="text-xs text-red-700">Passez en ligne depuis l'accueil pour recevoir des courses.</p>
              </div>
            </div>
          )}
          {!gpsActif && enLigne && (
            <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
              <span className="text-lg flex-shrink-0">📍</span>
              <div>
                <p className="text-sm font-semibold text-amber-800">GPS inactif — vous manquez des courses</p>
                <p className="text-xs text-amber-700">Activez le GPS pour être détecté en priorité par le dispatch.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Zones actives */}
      <div>
        <p className="text-sm font-bold mb-2 flex items-center gap-1.5">
          <MapPin className="h-4 w-4 text-primary" /> Zones actives à Ouagadougou
        </p>
        <div className="space-y-1.5">
          {ZONES_ACTIVES.map((z, i) => (
            <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-xl border ${z.color}`}>
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full flex-shrink-0 ${z.dot}`} />
                <span className="text-xs font-medium">{z.nom}</span>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wide opacity-70">{z.niveau}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Heures de pointe */}
      <div>
        <p className="text-sm font-bold mb-2 flex items-center gap-1.5">
          <Clock className="h-4 w-4 text-primary" /> Heures de pointe
        </p>
        <div className="grid grid-cols-3 gap-2">
          {HEURES_POINTE.map((h, i) => {
            const now = new Date().getHours();
            const ranges = [[7,9],[12,14],[17,20]];
            const [start, end] = ranges[i];
            const isActive = now >= start && now < end;
            return (
              <div key={i} className={`rounded-xl border p-3 text-center ${isActive ? "bg-green-50 border-green-300" : "bg-muted/30 border-border"}`}>
                <span className="text-xl">{h.icon}</span>
                <p className={`text-xs font-bold mt-1 ${isActive ? "text-green-700" : "text-foreground"}`}>{h.plage}</p>
                <p className="text-[10px] text-muted-foreground">{h.label}</p>
                {isActive && <p className="text-[10px] text-green-600 font-bold mt-0.5">EN COURS</p>}
              </div>
            );
          })}
        </div>
      </div>

      <Button variant="outline" className="w-full" onClick={loadData}>
        <RefreshCw className="h-4 w-4 mr-2" /> Actualiser maintenant
      </Button>
    </div>
  );
}