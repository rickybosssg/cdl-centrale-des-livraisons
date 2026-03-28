import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Package } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CourseCard from "../../components/CourseCard";

export default function MesLivraisons() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState(null);

  useEffect(() => {
    const load = async () => {
      const user = await base44.auth.me();
      setUserEmail(user.email);
      const data = await base44.entities.Course.filter(
        { livreur_email: user.email },
        "-created_date",
        30
      );
      setCourses(data);
      setLoading(false);
    };
    load();
  }, []);

  useEffect(() => {
    if (!userEmail) return;
    const unsub = base44.entities.Course.subscribe((event) => {
      if (event.data?.livreur_email !== userEmail && event.type === 'create') return;
      if (event.type === 'create' && event.data?.livreur_email === userEmail) {
        setCourses(prev => [event.data, ...prev]);
      } else if (event.type === 'update') {
        setCourses(prev => prev.map(c => c.id === event.id ? event.data : c));
      } else if (event.type === 'delete') {
        setCourses(prev => prev.filter(c => c.id !== event.id));
      }
    });
    return unsub;
  }, [userEmail]);

  const actives = courses.filter(c => ["acceptee", "en_cours"].includes(c.statut));
  const terminees = courses.filter(c => c.statut === "livree");

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Mes livraisons</h1>

      <Tabs defaultValue="actives">
        <TabsList className="w-full">
          <TabsTrigger value="actives" className="flex-1">
            Actives ({actives.length})
          </TabsTrigger>
          <TabsTrigger value="historique" className="flex-1">
            Historique ({terminees.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="actives" className="space-y-3 mt-3">
          {actives.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <Package className="h-10 w-10 text-muted-foreground/40 mx-auto" />
              <p className="text-sm text-muted-foreground">Aucune livraison active</p>
            </div>
          ) : (
            actives.map((course) => (
              <Link key={course.id} to={`/course-livreur/${course.id}`}>
                <CourseCard course={course} />
              </Link>
            ))
          )}
        </TabsContent>

        <TabsContent value="historique" className="space-y-3 mt-3">
          {terminees.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <Package className="h-10 w-10 text-muted-foreground/40 mx-auto" />
              <p className="text-sm text-muted-foreground">Aucune livraison terminée</p>
            </div>
          ) : (
            terminees.map((course) => (
              <Link key={course.id} to={`/course-livreur/${course.id}`}>
                <CourseCard course={course} />
              </Link>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}