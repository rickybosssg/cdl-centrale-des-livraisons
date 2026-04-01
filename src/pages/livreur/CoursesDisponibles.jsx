import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { RefreshCw, Package, Send, MapPin, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import CourseCard from "../../components/CourseCard";
import usePullToRefresh from "../../hooks/usePullToRefresh";
import { toast } from "sonner";
import { vibrateSuccess } from "@/lib/vibration";

export default function CoursesDisponibles() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const me = await base44.auth.me();
    setUser(me);
    const data = await base44.entities.Course.filter({ statut: "en_attente" }, "-created_date", 15);
    // Trier : tres_urgent en premier, puis urgent, puis normal
    const URGENCE_SCORE = { tres_urgent: 3, urgent: 2, normal: 1 };
    data.sort((a, b) => (URGENCE_SCORE[b.urgence] || 1) - (URGENCE_SCORE[a.urgence] || 1));
    setCourses(data);
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
    if (!user.disponible) {
      toast.error("Vous devez être disponible pour accepter une course");
      return;
    }
    if (user.livreur_bloque) {
      toast.error("Votre compte est bloqué. Contactez l'administration.");
      return;
    }
    // Optimistic UI — remove immediately
    setCourses(prev => prev.filter(c => c.id !== course.id));
    // Then send request in background
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
      derniere_course_attribuee_at: new Date().toISOString(),
    });
    vibrateSuccess();
    toast.success("🛥 Course acceptée ! Bonne livraison !");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Courses disponibles</h1>
        <div className="flex items-center gap-2">
          {refreshing && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
          <Button variant="outline" size="icon" onClick={loadData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground text-center md:hidden">↓ Tirez vers le bas pour actualiser</p>

      {courses.length === 0 ? (
        <div className="space-y-4 py-6">
          <div className="text-center space-y-3">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Package className="h-8 w-8 text-primary/50" />
            </div>
            <p className="font-semibold text-base">Pas de course pour le moment</p>
            <p className="text-sm text-muted-foreground">Reste connecté, de nouvelles demandes arrivent en continu !</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 border border-amber-100">
              <span className="text-lg">📍</span>
              <div>
                <p className="text-sm font-semibold text-amber-800">Rapproche-toi des zones actives</p>
                <p className="text-xs text-amber-700">Zone du marché, Râan, Gounghin, Cissin sont souvent actives</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-xl bg-blue-50 border border-blue-100">
              <span className="text-lg">📱</span>
              <div>
                <p className="text-sm font-semibold text-blue-800">Vérifie ta localisation</p>
                <p className="text-xs text-blue-700">Active le GPS pour être détecté par le système de dispatch</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-xl bg-green-50 border border-green-100">
              <span className="text-lg">⏰</span>
              <div>
                <p className="text-sm font-semibold text-green-800">Heures de pointe</p>
                <p className="text-xs text-green-700">7h-9h, 12h-14h et 17h-20h sont les moments les plus actifs</p>
              </div>
            </div>
          </div>
          <Button variant="outline" className="w-full" onClick={loadData}>Actualiser maintenant</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {courses.map((course) => (
            <CourseCard key={course.id} course={course}>
              {/* Détail mission côté livreur */}
              {course.type_mission && (
                <div className="space-y-2 text-xs">
                  <div className={`flex items-center gap-2 font-bold px-2 py-1 rounded-lg w-fit ${
                    course.type_mission === 'envoyer' ? 'bg-primary/10 text-primary' : 'bg-accent/10 text-accent'
                  }`}>
                    {course.type_mission === 'envoyer' ? <Send className="h-3 w-3" /> : <RefreshCw className="h-3 w-3" />}
                    {course.type_mission === 'envoyer' ? 'Étape 1 → Aller chez l\'expéditeur · Étape 2 → Livrer au destinataire' : 'Étape 1 → Aller récupérer le colis · Étape 2 → Livrer au client'}
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
                variant="default"
              >
                ✅ Accepter cette course
              </Button>
            </CourseCard>
          ))}
        </div>
      )}
    </div>
  );
}