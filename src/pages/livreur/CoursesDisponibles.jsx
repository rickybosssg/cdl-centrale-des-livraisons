import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { RefreshCw, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import CourseCard from "../../components/CourseCard";
import { toast } from "sonner";

export default function CoursesDisponibles() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  const loadData = async () => {
    setLoading(true);
    const me = await base44.auth.me();
    setUser(me);
    const data = await base44.entities.Course.filter({ statut: "en_attente" }, "-created_date", 50);
    setCourses(data);
    setLoading(false);
  };

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
    await base44.entities.Course.update(course.id, {
      statut: "acceptee",
      livreur_email: user.email,
      livreur_name: user.full_name,
      date_acceptation: new Date().toISOString(),
      mode_assignation: "manuel",
    });
    // Incrémenter les courses actives
    await base44.auth.updateMe({
      nombre_courses_actives: (user.nombre_courses_actives || 0) + 1,
      derniere_course_attribuee_at: new Date().toISOString(),
    });
    toast.success("🛵 Course acceptée ! Bonne livraison !");
    setCourses(prev => prev.filter(c => c.id !== course.id));
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
        <Button variant="outline" size="icon" onClick={loadData}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {courses.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <Package className="h-12 w-12 text-muted-foreground/30 mx-auto" />
          <p className="text-muted-foreground text-sm">Aucune course disponible</p>
          <Button variant="outline" size="sm" onClick={loadData}>Actualiser</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {courses.map((course) => (
            <CourseCard key={course.id} course={course}>
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
      )}
    </div>
  );
}