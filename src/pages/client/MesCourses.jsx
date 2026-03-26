import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Package, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CourseCard from "../../components/CourseCard";

export default function MesCourses() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState(null);

  useEffect(() => {
    const load = async () => {
      const user = await base44.auth.me();
      setUserEmail(user.email);
      const data = await base44.entities.Course.filter(
        { client_email: user.email },
        "-created_date",
        50
      );
      setCourses(data);
      setLoading(false);
    };
    load();
  }, []);

  useEffect(() => {
    if (!userEmail) return;
    const unsub = base44.entities.Course.subscribe((event) => {
      if (event.data?.client_email !== userEmail) return;
      if (event.type === 'create') {
        setCourses(prev => [event.data, ...prev]);
      } else if (event.type === 'update') {
        setCourses(prev => prev.map(c => c.id === event.id ? event.data : c));
      } else if (event.type === 'delete') {
        setCourses(prev => prev.filter(c => c.id !== event.id));
      }
    });
    return unsub;
  }, [userEmail]);

  const actives = courses.filter(c => !["livree", "annulee"].includes(c.statut));
  const terminees = courses.filter(c => ["livree", "annulee"].includes(c.statut));

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Mes courses</h1>

      <Tabs defaultValue="actives">
        <TabsList className="w-full">
          <TabsTrigger value="actives" className="flex-1">
            Actives ({actives.length})
          </TabsTrigger>
          <TabsTrigger value="terminees" className="flex-1">
            Terminées ({terminees.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="actives" className="space-y-3 mt-3">
          {actives.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <Package className="h-10 w-10 text-muted-foreground/40 mx-auto" />
              <p className="text-sm text-muted-foreground">Aucune course active</p>
            </div>
          ) : (
            actives.map((course) => (
              <Link key={course.id} to={`/course/${course.id}`}>
                <CourseCard course={course} />
              </Link>
            ))
          )}
        </TabsContent>

        <TabsContent value="terminees" className="space-y-3 mt-3">
          {terminees.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <Package className="h-10 w-10 text-muted-foreground/40 mx-auto" />
              <p className="text-sm text-muted-foreground">Aucune course terminée</p>
            </div>
          ) : (
            terminees.map((course) => (
              <Link key={course.id} to={`/course/${course.id}`}>
                <CourseCard course={course} />
              </Link>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}