import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Package, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CourseCard from "../../components/CourseCard";
import usePullToRefresh from "../../hooks/usePullToRefresh";

export default function MesCourses() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState(null);

  const loadCourses = useCallback(async () => {
    const user = await base44.auth.me();
    setUserEmail(user.email);
    const data = await base44.entities.Course.filter(
      { client_email: user.email },
      "-created_date",
      20
    );
    setCourses(data);
    setLoading(false);
  }, []);

  const { refreshing } = usePullToRefresh(loadCourses);

  useEffect(() => {
    loadCourses();
  }, []);

  useEffect(() => {
    if (!userEmail) return;
    const unsub = base44.entities.Course.subscribe((event) => {
      console.log(`[REALTIME_EVENT_SOURCE] MesCourses | type=${event.type} | id=${event.id} | statut=${event.data?.statut} | is_deleted=${event.data?.is_deleted}`);

      if (event.type === 'delete') {
        console.log(`[UI_COURSE_REMOVED] MesCourses | delete | id=${event.id}`);
        setCourses(prev => prev.filter(c => c.id !== event.id));
        return;
      }

      const d = event.data;
      // GARDE ABSOLUE : supprimer si is_deleted ou pas de données
      if (!d || d.is_deleted) {
        console.log(`[PHANTOM_COURSE_DETECTED] MesCourses | is_deleted ou data null | id=${event.id}`);
        console.log(`[UI_COURSE_REMOVED] MesCourses | is_deleted | id=${event.id}`);
        setCourses(prev => prev.filter(c => c.id !== event.id));
        return;
      }
      if (d.client_email !== userEmail) return;

      if (event.type === 'create') {
        console.log(`[COURSE_REINJECTED] MesCourses | create | id=${event.id} | statut=${d.statut}`);
        setCourses(prev => [d, ...prev.filter(c => c.id !== event.id)]);
      } else if (event.type === 'update') {
        console.log(`[COURSE_REINJECTED] MesCourses | update | id=${event.id} | statut=${d.statut}`);
        setCourses(prev => prev.map(c => c.id === event.id ? d : c));
      }
    });
    return unsub;
  }, [userEmail]);

  const TERMINAL = ["livree", "annulee", "annulee_par_admin", "refusee", "aucun_livreur"];
  const actives = courses.filter(c => !TERMINAL.includes(c.statut) && !c.is_deleted);
  const terminees = courses.filter(c => TERMINAL.includes(c.statut) || c.is_deleted);

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
        <h1 className="text-xl font-bold">Mes courses</h1>
        {refreshing && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <RefreshCw className="h-3 w-3 animate-spin" />
            Actualisation...
          </div>
        )}
      </div>

      {/* Pull-to-refresh hint on mobile */}
      <p className="text-[11px] text-muted-foreground text-center md:hidden">↓ Tirez vers le bas pour actualiser</p>

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