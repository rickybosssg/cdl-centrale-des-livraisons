import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Package, MapPin, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import CourseCard from "../../components/CourseCard";
import { toast } from "sonner";

export default function CoursesDisponibles() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(null);

  const loadCourses = async () => {
    setLoading(true);
    const data = await base44.entities.Course.filter(
      { statut: "en_attente" },
      "-created_date",
      20
    );
    setCourses(data);
    setLoading(false);
  };

  useEffect(() => {
    loadCourses();
    const unsub = base44.entities.Course.subscribe((event) => {
      if (event.type === "create" && event.data.statut === "en_attente") {
        setCourses(prev => [event.data, ...prev]);
      } else if (event.type === "update") {
        setCourses(prev => prev.filter(c => c.id !== event.id || event.data.statut === "en_attente"));
      }
    });
    return unsub;
  }, []);

  const accepterCourse = async (course) => {
    setAccepting(course.id);
    const user = await base44.auth.me();
    await base44.entities.Course.update(course.id, {
      statut: "acceptee",
      livreur_email: user.email,
      livreur_name: user.full_name,
      date_acceptation: new Date().toISOString(),
    });
    setCourses(prev => prev.filter(c => c.id !== course.id));
    toast.success("Course acceptée !");
    setAccepting(null);
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
        <Button variant="ghost" size="icon" onClick={loadCourses}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {courses.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <Package className="h-12 w-12 text-muted-foreground/40 mx-auto" />
          <p className="text-muted-foreground">Aucune course disponible</p>
          <p className="text-xs text-muted-foreground">Revenez plus tard</p>
        </div>
      ) : (
        <div className="space-y-3">
          {courses.map((course) => (
            <CourseCard key={course.id} course={course}>
              <Button
                className="w-full"
                onClick={(e) => {
                  e.stopPropagation();
                  accepterCourse(course);
                }}
                disabled={accepting === course.id}
              >
                {accepting === course.id ? "Acceptation..." : "Accepter la course"}
              </Button>
            </CourseCard>
          ))}
        </div>
      )}
    </div>
  );
}