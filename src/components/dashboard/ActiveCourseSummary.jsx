/**
 * ActiveCourseSummary — Supervision temps réel des courses actives
 * Dashboard Admin — LECTURE SEULE (pas d'action métier)
 *
 * Logs: ADMIN_ACTIVE_COURSE_SUMMARY_OK | ADMIN_REALTIME_ACTIVITY_OK | DASHBOARD_SUPERVISION_MODE_OK
 */
import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, Clock, Truck, User, MapPin, Zap } from "lucide-react";
import moment from "moment";

// Statuts considérés "actifs"
const ACTIVE_STATUTS = [
  "en_attente", "assignee_attente", "acceptee", "en_cours",
  "driver_en_route_pickup", "arrived_pickup", "arrived_dropoff",
];

// Config badge par statut
const STATUT_CONFIG = {
  en_attente:            { label: "En attente",    bg: "bg-amber-100", text: "text-amber-800",   dot: "bg-amber-500",  pulse: true },
  assignee_attente:      { label: "Attribuée",     bg: "bg-blue-100",  text: "text-blue-800",    dot: "bg-blue-500",   pulse: true },
  acceptee:              { label: "Acceptée",      bg: "bg-cyan-100",  text: "text-cyan-800",    dot: "bg-cyan-500",   pulse: false },
  en_cours:              { label: "En livraison",  bg: "bg-green-100", text: "text-green-800",   dot: "bg-green-500",  pulse: true },
  driver_en_route_pickup:{ label: "En route →",    bg: "bg-indigo-100",text: "text-indigo-800",  dot: "bg-indigo-500", pulse: true },
  arrived_pickup:        { label: "Arrivé dépôt",  bg: "bg-purple-100",text: "text-purple-800",  dot: "bg-purple-500", pulse: false },
  arrived_dropoff:       { label: "Arrivé dest.",  bg: "bg-teal-100",  text: "text-teal-800",    dot: "bg-teal-500",   pulse: false },
};

function StatutBadge({ statut }) {
  const cfg = STATUT_CONFIG[statut] || { label: statut, bg: "bg-gray-100", text: "text-gray-700", dot: "bg-gray-400", pulse: false };
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${cfg.bg} ${cfg.text} flex-shrink-0`}>
      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${cfg.dot} ${cfg.pulse ? "animate-pulse" : ""}`} />
      {cfg.label}
    </span>
  );
}

function UrgenceBadge({ urgence }) {
  if (!urgence || urgence === "normal") return null;
  return (
    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full flex-shrink-0 ${urgence === "tres_urgent" ? "bg-red-500 text-white" : "bg-orange-400 text-white"}`}>
      {urgence === "tres_urgent" ? "🔴 URGENT" : "🟡 Urgent"}
    </span>
  );
}

function CourseRow({ course }) {
  const elapsed = Math.round((Date.now() - new Date(course.created_date).getTime()) / 60000);
  const isOld = elapsed > 20;
  const shortId = course.id?.slice(-5).toUpperCase();

  return (
    <Link to={`/course/${course.id}`} className="block">
      <div className={`p-2.5 rounded-xl border transition-all active:scale-95 cursor-pointer hover:shadow-sm ${
        course.urgence === "tres_urgent"
          ? "bg-red-50 border-red-300"
          : course.urgence === "urgent"
          ? "bg-orange-50 border-orange-200"
          : "bg-card border-border"
      }`}>
        {/* Ligne 1 : trajet + badges */}
        <div className="flex items-start justify-between gap-1 mb-1">
          <div className="flex items-center gap-1 min-w-0 flex-1">
            <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            <p className="text-xs font-bold truncate">{course.quartier_depart} → {course.quartier_arrivee}</p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <UrgenceBadge urgence={course.urgence} />
            <StatutBadge statut={course.statut} />
          </div>
        </div>

        {/* Ligne 2 : client + livreur + temps + prix */}
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
          <span className="flex items-center gap-0.5">
            <User className="h-2.5 w-2.5" />
            {course.client_name ? course.client_name.split(" ")[0] : "—"}
          </span>
          <span className="flex items-center gap-0.5">
            <Truck className="h-2.5 w-2.5" />
            {course.livreur_name ? course.livreur_name.split(" ")[0] : <span className="text-amber-600 font-bold">non attribué</span>}
          </span>
          <span className="flex items-center gap-0.5">
            <Clock className="h-2.5 w-2.5" />
            <span className={isOld ? "text-red-600 font-bold" : "text-foreground"}>{elapsed}min</span>
          </span>
          <span className="font-semibold text-foreground">{course.prix ? `${course.prix} F` : "—"}</span>
          <span className="text-[9px] text-muted-foreground/60">#{shortId}</span>
        </div>
      </div>
    </Link>
  );
}

// Tri : urgentes d'abord, puis par date croissante (les plus anciennes = prioritaires)
function sortCourses(list) {
  return [...list].sort((a, b) => {
    const urgScore = (c) => c.urgence === "tres_urgent" ? 3 : c.urgence === "urgent" ? 2 : 1;
    const diff = urgScore(b) - urgScore(a);
    if (diff !== 0) return diff;
    return new Date(a.created_date) - new Date(b.created_date);
  });
}

export default function ActiveCourseSummary({ courses: propCourses }) {
  const [activeCourses, setActiveCourses] = useState([]);

  // Synchroniser depuis les courses passées en prop + écouter updates temps réel
  useEffect(() => {
    const filtered = sortCourses((propCourses || []).filter(c => ACTIVE_STATUTS.includes(c.statut)));
    setActiveCourses(filtered);
    console.log(`[ADMIN_ACTIVE_COURSE_SUMMARY_OK] courses actives=${filtered.length}`);
    console.log(`[DASHBOARD_SUPERVISION_MODE_OK] lecture seule activée`);
  }, [propCourses]);

  // Subscription temps réel — sans délai, source unique (pas de concurrence avec prop)
  useEffect(() => {
    let unsub = null;
    try {
      unsub = base44.entities.Course.subscribe((ev) => {
        try {
          if (!ev.id) return;
          if (ev.type === "create" && ev.data && ACTIVE_STATUTS.includes(ev.data.statut) && !ev.data.is_deleted) {
            setActiveCourses(p => sortCourses([ev.data, ...p.filter(c => c.id !== ev.id)]));
            console.log(`[ADMIN_REALTIME_ACTIVITY_OK] nouvelle course active | id=${ev.id}`);
          } else if (ev.type === "update" && ev.data) {
            setActiveCourses(p => {
              const filtered = p.filter(c => c.id !== ev.id);
              if (ACTIVE_STATUTS.includes(ev.data.statut) && !ev.data.is_deleted) {
                console.log(`[ADMIN_REALTIME_ACTIVITY_OK] course mise à jour | id=${ev.id} | statut=${ev.data.statut}`);
                return sortCourses([ev.data, ...filtered]);
              }
              return filtered;
            });
          } else if (ev.type === "delete" || ev.data?.is_deleted) {
            setActiveCourses(p => p.filter(c => c.id !== ev.id));
          }
        } catch (_) {}
      });
    } catch (err) {
      console.warn("[ActiveCourseSummary] subscribe error:", err?.message);
    }
    return () => { try { if (unsub) unsub(); } catch (_) {} };
  }, []);

  if (activeCourses.length === 0) return null;

  const displayed = activeCourses.slice(0, 3);
  const total = activeCourses.length;

  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span>Activité en cours</span>
            <span className="bg-primary/10 text-primary text-[10px] font-black px-1.5 py-0.5 rounded-full">{total}</span>
          </span>
          <Link to="/gerer-courses">
            <Button size="sm" variant="ghost" className="h-6 text-xs text-primary gap-0.5">
              Voir toutes <ChevronRight className="h-3 w-3" />
            </Button>
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 space-y-2">
        {displayed.map(c => <CourseRow key={c.id} course={c} />)}
        {total > 3 && (
          <Link to="/gerer-courses">
            <div className="text-center py-1.5 rounded-xl border border-dashed text-xs text-muted-foreground hover:bg-muted/30 transition-colors">
              +{total - 3} autre(s) course(s) active(s)
            </div>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}