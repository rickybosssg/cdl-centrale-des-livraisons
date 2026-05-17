/**
 * ManualDispatchAlert — Bloc temps réel "Nouvelle course à assigner manuellement"
 * Visible uniquement en mode dispatch Manuel.
 * S'affiche automatiquement sur Dashboard admin, GererCourses, UberOpsView.
 *
 * Source : subscription BDD Course, statut en_attente.
 */
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useDispatchMode } from "@/context/DispatchModeContext";
import { AnimatePresence, motion } from "framer-motion";
import { MapPin, Package, Clock, Phone, UserPlus, X, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import moment from "moment";

function CourseBlock({ course, onAssign, onDismiss }) {
  const navigate = useNavigate();
  return (
    <motion.div
      initial={{ opacity: 0, y: -16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.96 }}
      transition={{ type: "spring", damping: 22, stiffness: 300 }}
      className="rounded-2xl border-2 border-purple-400 bg-gradient-to-br from-purple-50 to-white shadow-lg overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600">
        <div className="flex items-center gap-2">
          <motion.div animate={{ scale: [1, 1.35, 1] }} transition={{ duration: 0.6, repeat: Infinity }}>
            <Bell className="h-4 w-4 text-white" />
          </motion.div>
          <p className="text-xs font-black text-white tracking-wide">COURS À ASSIGNER MANUELLEMENT</p>
        </div>
        <button onClick={() => onDismiss(course.id)} className="p-1 rounded-full bg-white/20 hover:bg-white/30">
          <X className="h-3.5 w-3.5 text-white" />
        </button>
      </div>

      {/* Corps */}
      <div className="p-3 space-y-2">
        {/* Trajet */}
        <div className="flex items-center gap-2">
          <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
            <div className="h-2 w-2 rounded-full bg-green-500" />
            <div className="w-0.5 h-4 bg-gray-300" />
            <div className="h-2 w-2 rounded-full bg-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold leading-tight truncate">{course.quartier_depart}</p>
            <p className="text-xs font-bold leading-tight truncate text-muted-foreground">{course.quartier_arrivee}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-base font-extrabold text-primary">{(course.prix || 0).toLocaleString()} F</p>
            <p className="text-[10px] text-muted-foreground">{course.type_colis}</p>
          </div>
        </div>

        {/* Infos client */}
        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
          <div className="flex items-center gap-1 bg-gray-50 rounded-lg p-1.5">
            <UserPlus className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            <span className="truncate font-medium">{course.client_name || "Client"}</span>
          </div>
          <div className="flex items-center gap-1 bg-gray-50 rounded-lg p-1.5">
            <Phone className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            <span className="truncate">{course.telephone_expediteur || "—"}</span>
          </div>
          {course.nom_destinataire && (
            <div className="flex items-center gap-1 bg-gray-50 rounded-lg p-1.5">
              <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <span className="truncate font-medium">{course.nom_destinataire}</span>
            </div>
          )}
          {course.telephone_destinataire && (
            <div className="flex items-center gap-1 bg-gray-50 rounded-lg p-1.5">
              <Phone className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <span className="truncate">{course.telephone_destinataire}</span>
            </div>
          )}
        </div>

        {/* Heure + statut */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {moment(course.created_date).format("HH:mm:ss")} · {moment(course.created_date).fromNow()}
          </span>
          <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-bold">
            ⏳ En attente d'assignation manuelle
          </span>
        </div>

        {/* Bouton */}
        <Button
          className="w-full h-9 bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm gap-2"
          onClick={() => onAssign(course)}
        >
          <UserPlus className="h-4 w-4" />
          Assigner un livreur
        </Button>
      </div>
    </motion.div>
  );
}

export default function ManualDispatchAlert({ onAssign }) {
  const { mode, loading: modeLoading } = useDispatchMode();
  const [pendingCourses, setPendingCourses] = useState([]);
  const [dismissed, setDismissed] = useState(new Set());
  const navigate = useNavigate();

  // Charger les courses en attente au mount (mode manuel uniquement)
  useEffect(() => {
    if (modeLoading || mode !== "manuel") return;
    base44.entities.Course.filter({ statut: "en_attente" }, "-created_date", 10)
      .then(data => {
        const arr = Array.isArray(data) ? data.filter(c => !c.is_deleted && !c.moyen_transport) : [];
        setPendingCourses(arr);
      })
      .catch(() => {});
  }, [mode, modeLoading]);

  // Subscription BDD temps réel
  useEffect(() => {
    const unsub = base44.entities.Course.subscribe((ev) => {
      if (!ev.data) return;

      if (ev.type === "create" && ev.data.statut === "en_attente" && !ev.data.moyen_transport) {
        setPendingCourses(prev => {
          if (prev.find(c => c.id === ev.id)) return prev;
          return [ev.data, ...prev];
        });
      } else if (ev.type === "update") {
        if (ev.data.statut !== "en_attente") {
          // Course assignée ou annulée → retirer du bloc
          setPendingCourses(prev => prev.filter(c => c.id !== ev.id));
        } else {
          setPendingCourses(prev => prev.map(c => c.id === ev.id ? ev.data : c));
        }
      } else if (ev.type === "delete") {
        setPendingCourses(prev => prev.filter(c => c.id !== ev.id));
      }
    });
    return () => { if (unsub) unsub(); };
  }, []);

  const handleDismiss = (id) => {
    setDismissed(prev => new Set([...prev, id]));
  };

  const handleAssign = (course) => {
    if (onAssign) {
      onAssign(course);
    } else {
      navigate("/gerer-courses");
    }
  };

  // Afficher uniquement en mode manuel
  if (modeLoading || mode !== "manuel") return null;

  const visible = pendingCourses.filter(c => !dismissed.has(c.id));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-wide text-purple-700 flex items-center gap-1">
        <Bell className="h-3.5 w-3.5" />
        {visible.length} course{visible.length > 1 ? "s" : ""} à assigner manuellement
      </p>
      <AnimatePresence mode="popLayout">
        {visible.slice(0, 5).map(course => (
          <CourseBlock
            key={course.id}
            course={course}
            onAssign={handleAssign}
            onDismiss={handleDismiss}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}