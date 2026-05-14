import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { RefreshCw, TrendingUp, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import NotificationPermissionBanner from "../../components/NotificationPermissionBanner";
import usePullToRefresh from "../../hooks/usePullToRefresh";
import CourseCardSimple from "@/components/CourseCardSimple";
import LivreurValidationGate from "@/components/LivreurValidationGate";
import { toast } from "sonner";
import { vibrateSuccess } from "@/lib/vibration";
import { triggerWhatsAppNotification, waMsgCourseAcceptedByDriver, waMsgCourseAcceptedDriver } from "@/lib/whatsappNotifications";
import { useNavigate } from "react-router-dom";

export default function CoursesDisponibles() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [livreurProfile, setLivreurProfile] = useState(null);
  const [gainsJour, setGainsJour] = useState(0);
  const [coursesJour, setCoursesJour] = useState(0);
  const [accepting, setAccepting] = useState(null);
  const navigate = useNavigate();

  const loadData = useCallback(async () => {
    setLoading(true);
    const me = await base44.auth.me();
    setUser(me);

    // Charger le profil livreur pour vérifier le statut de validation
    try {
      const profs = await base44.entities.UserProfile.filter({ user_email: me.email, profile_type: 'livreur', deleted: false });
      setLivreurProfile(profs?.[0] || null);
    } catch (_) {}

    const data = await base44.entities.Course.filter({ statut: "en_attente" }, "-created_date", 20);
    setCourses(data);

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
    console.log('[DRIVER_COURSE_SUBSCRIBE_START] subscription cours disponibles activée');

    const unsub = base44.entities.Course.subscribe((event) => {
      if (!event.data) return;

      if (event.type === "create" && event.data?.statut === "en_attente") {
        console.log(`[DRIVER_COURSE_RECEIVED_REALTIME] nouvelle course | id=${event.id} | statut=en_attente`);
        setCourses(prev => {
          if (prev.find(c => c.id === event.id)) return prev;
          console.log('[DRIVER_COURSE_UI_UPDATED] liste mise à jour — nouvelle course ajoutée');
          return [event.data, ...prev];
        });
      } else if (event.type === "update") {
        // Retirer si plus en_attente (acceptée par un autre livreur, annulée, etc.)
        if (event.data?.statut !== "en_attente") {
          console.log(`[DRIVER_COURSE_UI_UPDATED] course ${event.id} retirée de la liste (statut=${event.data?.statut})`);
          setCourses(prev => prev.filter(c => c.id !== event.id));
        }
      } else if (event.type === "delete") {
        setCourses(prev => prev.filter(c => c.id !== event.id));
      }
    });
    return unsub;
  }, []);

  const accepter = async (course) => {
    if (!user) return;
    if (user.livreur_bloque) { toast.error("Votre compte est bloqué. Contactez l'administration."); return; }
    setAccepting(course.id);
    setCourses(prev => prev.filter(c => c.id !== course.id));
    try {
      await base44.entities.Course.update(course.id, {
        statut: "acceptee",
        livreur_email: user.email,
        livreur_name: user.full_name,
        date_acceptation: new Date().toISOString(),
        mode_assignation: "manuel",
        telephone_livreur: user.telephone || "",
      });
      await base44.auth.updateMe({
        nombre_courses_actives: (user.nombre_courses_actives || 0) + 1,
        courses_acceptees: (user.courses_acceptees || 0) + 1,
        courses_refusees_consecutives: 0,
      });
      vibrateSuccess();
      toast.success("🛵 Course acceptée !");
      triggerWhatsAppNotification({
        eventType: 'course_accepted_by_driver', recipientRole: 'client',
        recipientName: course.client_name || 'Client', recipientPhone: course.telephone_expediteur,
        messageText: waMsgCourseAcceptedByDriver(), entityId: course.id, entityType: 'course', priority: 'high',
      });
      triggerWhatsAppNotification({
        eventType: 'course_accepted_driver', recipientRole: 'driver',
        recipientName: user.full_name, recipientPhone: user.telephone,
        messageText: waMsgCourseAcceptedDriver(), entityId: course.id, entityType: 'course', priority: 'normal',
      });
      navigate(`/course-livreur/${course.id}`);
    } catch (e) {
      toast.error("Erreur : " + e.message);
    } finally {
      setAccepting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // ── GATE : livreur non validé → mur de statut ─────────────────────────────
  const statutValidation = livreurProfile?.status || user?.statut_validation_livreur;
  const isValidated = statutValidation === 'actif' || statutValidation === 'valide' || user?.profil_valide === true;

  if (!isValidated) {
    return (
      <LivreurValidationGate
        user={user}
        profile={livreurProfile}
        onRefresh={loadData}
      />
    );
  }

  const enLigne = user?.disponible !== false && user?.driver_online;

  return (
    <div className="space-y-4 pb-24">
      <NotificationPermissionBanner />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Courses disponibles</h1>
          <p className="text-xs text-gray-400">
            {courses.length > 0 ? `${courses.length} course(s) disponible(s)` : "Aucune course pour le moment"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {refreshing && <RefreshCw className="h-4 w-4 animate-spin text-gray-400" />}
          <Button variant="outline" size="icon" onClick={loadData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Statut en ligne */}
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${enLigne ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
        <div className={`h-3 w-3 rounded-full flex-shrink-0 ${enLigne ? "bg-green-500 animate-pulse" : "bg-red-400"}`} />
        <div className="flex-1">
          <p className={`text-sm font-bold ${enLigne ? "text-green-800" : "text-red-800"}`}>
            {enLigne ? "Vous êtes en ligne" : "Vous êtes hors ligne"}
          </p>
          {!enLigne && <p className="text-xs text-red-600">Passez en ligne depuis l'accueil pour recevoir des courses</p>}
        </div>
      </div>

      {/* Gains du jour */}
      <div className="flex items-center gap-4 p-4 rounded-xl bg-gray-50 border border-gray-100">
        <TrendingUp className="h-5 w-5 text-green-600 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-xs text-gray-500">Gains du jour</p>
          <p className="text-xl font-extrabold text-gray-900">{gainsJour.toLocaleString()} F</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Courses</p>
          <p className="text-xl font-extrabold text-gray-900">{coursesJour}</p>
        </div>
      </div>

      {/* Liste des courses */}
      {courses.length > 0 ? (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-700">{courses.length} course(s) à accepter</p>
          {courses.map((course) => (
            <CourseCardSimple
              key={course.id}
              course={course}
              onAccepter={accepting === course.id ? undefined : () => accepter(course)}
              onRefuser={undefined}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 space-y-3">
          <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto">
            <Package className="h-8 w-8 text-gray-300" />
          </div>
          <p className="font-semibold text-gray-700">Aucune course disponible</p>
          <p className="text-sm text-gray-400">Restez en ligne — les demandes arrivent en continu</p>
          {!enLigne && (
            <p className="text-xs text-red-500 font-medium">Passez en ligne depuis l'accueil pour recevoir des courses</p>
          )}
        </div>
      )}

      <Button variant="outline" className="w-full" onClick={loadData}>
        <RefreshCw className="h-4 w-4 mr-2" /> Actualiser
      </Button>
    </div>
  );
}