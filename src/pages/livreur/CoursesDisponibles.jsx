import { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { RefreshCw, TrendingUp, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import NotificationPermissionBanner from "../../components/NotificationPermissionBanner";
import usePullToRefresh from "../../hooks/usePullToRefresh";
import CourseCardSimple from "@/components/CourseCardSimple";
import LivreurValidationGate from "@/components/LivreurValidationGate";
import { toast } from "sonner";
import { vibrateSuccess } from "@/lib/vibration";
import { triggerWhatsAppNotification } from "@/lib/whatsappNotifications";
import { useNavigate } from "react-router-dom";

export default function CoursesDisponibles() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [livreurProfile, setLivreurProfile] = useState(null);
  const [gainsJour, setGainsJour] = useState(0);
  const [coursesJour, setCoursesJour] = useState(0);
  const [accepting, setAccepting] = useState(null);
  const [dispatchMode, setDispatchMode] = useState('auto');
  const dispatchModeRef = useRef('auto');
  const userEmailRef = useRef(null);
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

    // ── MODE DISPATCH : lecture obligatoire avant d'afficher les courses ─────
    let dispatchMode = 'auto';
    try {
      const modeRows = await base44.entities.DispatchModeState.list('-updated_date', 1);
      dispatchMode = modeRows?.[0]?.mode === 'manuel' ? 'manuel' : 'auto';
      console.log(`[DRIVER_COURSE_VISIBLE] loadData | mode=${dispatchMode} | email=${me.email}`);
    } catch (_) {}

    let data = [];
    if (dispatchMode === 'manuel') {
      // Mode manuel : SEULES les courses assignées à CE livreur par l'admin
      console.log(`[MODE_DISPATCH] manuel actif — affichage restreint aux courses assignées à ${me.email}`);
      data = await base44.entities.Course.filter({ statut: "assignee_attente", livreur_email: me.email }, "-created_date", 20);
    } else {
      // Mode auto : courses disponibles globalement (statut en_attente)
      data = await base44.entities.Course.filter({ statut: "en_attente" }, "-created_date", 20);
    }
    // Filtrer les cours supprimées dès le chargement
    setCourses(data.filter(c => !c.is_deleted));
    setDispatchMode(dispatchMode);
    dispatchModeRef.current = dispatchMode;
    userEmailRef.current = me.email;

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

  // ── Subscription temps réel USER — source unique pour driver_online + disponible ───
  useEffect(() => {
    let unsubUser = null;
    base44.auth.me().then(me => {
      if (!me?.email) return;
      unsubUser = base44.entities.User.subscribe((event) => {
        if (event.data?.email === me.email) setUser(event.data);
      });
    }).catch(() => {});
    return () => { if (unsubUser) unsubUser(); };
  }, []);

  useEffect(() => {
    loadData();

    // Subscription DispatchModeState pour garder le ref à jour (sans re-fetch par event)
    const unsubMode = base44.entities.DispatchModeState.subscribe((ev) => {
      if (ev.data?.mode) {
        dispatchModeRef.current = ev.data.mode;
        setDispatchMode(ev.data.mode);
      }
    });

    const unsub = base44.entities.Course.subscribe((event) => {
      if (!event.data && event.type !== "delete") return;
      // Lire depuis ref — PAS d'appel DB dans chaque event
      const mode = dispatchModeRef.current;
      const meEmail = userEmailRef.current;

      if (event.type === "create") {
        const d = event.data;
        // GARDE GLOBALE : jamais injecter une course supprimée ou annulée
        if (!d || d.is_deleted || d.statut === 'annulee') return;
        if (mode === 'manuel') {
          if (d.statut === "assignee_attente" && d.livreur_email === meEmail) {
            console.log(`[DRIVER_COURSE_VISIBLE] realtime CREATE | mode=manuel | assigned to me | id=${event.id}`);
            setCourses(prev => prev.find(c => c.id === event.id) ? prev : [d, ...prev]);
          }
        } else if (d.statut === "en_attente") {
          setCourses(prev => prev.find(c => c.id === event.id) ? prev : [d, ...prev]);
        }
      } else if (event.type === "update") {
        const d = event.data;
        // GARDE GLOBALE : retirer si supprimée ou annulée
        if (!d || d.is_deleted || d.statut === 'annulee') {
          setCourses(prev => prev.filter(c => c.id !== event.id));
          return;
        }
        if (mode === 'manuel') {
          if (d.statut === "assignee_attente" && d.livreur_email === meEmail) {
            console.log(`[DRIVER_COURSE_VISIBLE] realtime UPDATE | mode=manuel | assigned to me | id=${event.id}`);
            setCourses(prev => prev.find(c => c.id === event.id) ? prev.map(c => c.id === event.id ? d : c) : [d, ...prev]);
          } else {
            setCourses(prev => prev.filter(c => c.id !== event.id));
          }
        } else {
          if (d.statut !== "en_attente") {
            setCourses(prev => prev.filter(c => c.id !== event.id));
          }
        }
      } else if (event.type === "delete") {
        setCourses(prev => prev.filter(c => c.id !== event.id));
      }
    });

    return () => { unsub?.(); unsubMode?.(); };
  }, []);

  const accepter = async (course) => {
    if (!user) return;
    if (user.livreur_bloque) { toast.error("Votre compte est bloqué. Contactez l'administration."); return; }
    setAccepting(course.id);
    // Retrait optimiste immédiat
    setCourses(prev => prev.filter(c => c.id !== course.id));
    try {
      // ✅ MIGRÉ → courseStateMachine (source unique de vérité)
      // Remplace acceptCourseAction — notifs gérées par notificationOrchestrator côté backend
      const res = await base44.functions.invoke('courseStateMachine', {
        course_id: course.id,
        action: 'ACCEPT',
      });
      if (!res?.data?.success && !res?.data?.alreadyDone) {
        setCourses(prev => prev.find(c => c.id === course.id) ? prev : [course, ...prev]);
        const currentStatut = res?.data?.current_statut || '?';
        if (currentStatut === 'acceptee' || currentStatut === 'en_cours') {
          toast.info("Course déjà acceptée.");
        } else {
          toast.error(res?.data?.error || "Course non disponible");
        }
        return;
      }
      vibrateSuccess();
      toast.success("🛵 Course acceptée !");
      // WhatsApp : fire & forget uniquement (notifications push gérées par notificationOrchestrator)
      triggerWhatsAppNotification({
        eventType: 'course_accepted_by_driver', recipientRole: 'client',
        recipientName: course.client_name || 'Client', recipientPhone: course.telephone_expediteur,
        entityId: course.id, entityType: 'course', priority: 'high',
      });
      navigate(`/course-livreur/${course.id}`);
    } catch (e) {
      setCourses(prev => prev.find(c => c.id === course.id) ? prev : [course, ...prev]);
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

  // ── Source unique BDD confirmée (jamais d'état local optimiste) ─────────────
  const enLigne = user?.driver_online === true && user?.disponible !== false;

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
      {dispatchMode === 'manuel' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-700">
          <span className="font-bold">⚠️ Mode manuel actif</span> — seules vos courses assignées par l'admin apparaissent ici.
        </div>
      )}

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