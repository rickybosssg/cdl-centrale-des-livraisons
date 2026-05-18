/**
 * ManualDispatchAlertBlock — Bloc alerte admin course manuelle
 * Modal inline de sélection livreur — aucune navigation requise
 */
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Package, Clock, Phone, UserPlus, X, Bell, ChevronRight, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import moment from "moment";

function DriverList({ course, onAssigned, onClose }) {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(null);

  useEffect(() => {
    // Charger tous les livreurs disponibles (profil actif + en ligne)
    base44.entities.User.filter({ driver_online: true })
      .then(users => {
        const valides = users.filter(u =>
          u.profil_valide === true &&
          !u.livreur_bloque &&
          u.role !== "admin"
        );
        setDrivers(valides);
      })
      .catch(() => setDrivers([]))
      .finally(() => setLoading(false));
  }, []);

  const handleAssign = async (driver) => {
    setAssigning(driver.id);
    const now = new Date().toISOString();
    try {
      let hist = [];
      try { if (course.historique_assignation) hist = JSON.parse(course.historique_assignation); } catch(_) {}
      hist.push({ livreur_email: driver.email, livreur_nom: driver.full_name, heure: now, statut: "manuel_admin" });

      await base44.entities.Course.update(course.id, {
        statut: "assignee_attente",
        livreur_email: driver.email,
        livreur_name: driver.full_name,
        telephone_livreur: driver.telephone || "",
        heure_assignation: now,
        mode_assignation: "manuel",
        historique_assignation: JSON.stringify(hist),
      });

      // Notification livreur
      base44.entities.Notification.create({
        destinataire_email: driver.email,
        destinataire_role: "livreur",
        titre: "🛵 Nouvelle course assignée par l'admin !",
        message: `Course de ${course.quartier_depart} → ${course.quartier_arrivee}. Prix: ${course.prix} FCFA.`,
        type: "success",
        course_id: course.id,
        target_screen: `/course-livreur/${course.id}`,
        lue: false,
      }).catch(() => {});

      toast.success(`✅ Course assignée à ${driver.full_name}`);
      onAssigned(course.id);
    } catch (err) {
      toast.error("Erreur assignation : " + (err?.message || ""));
    } finally {
      setAssigning(null);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-6">
      <Loader2 className="h-5 w-5 animate-spin text-purple-600" />
    </div>
  );

  if (drivers.length === 0) return (
    <div className="text-center py-6 text-sm text-muted-foreground">
      Aucun livreur en ligne disponible
    </div>
  );

  return (
    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
      {drivers.map(d => (
        <div
          key={d.id}
          className="flex items-center justify-between p-3 rounded-xl border bg-white hover:bg-purple-50 transition-colors"
        >
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{d.full_name}</p>
            <p className="text-xs text-muted-foreground">{d.telephone || "—"} · {d.nombre_courses_actives || 0} course(s) active(s)</p>
          </div>
          <Button
            size="sm"
            className="h-8 bg-purple-600 hover:bg-purple-700 text-white text-xs ml-2 flex-shrink-0"
            onClick={() => handleAssign(d)}
            disabled={!!assigning}
          >
            {assigning === d.id
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <><UserPlus className="h-3.5 w-3.5 mr-1" />Assigner</>
            }
          </Button>
        </div>
      ))}
    </div>
  );
}

export default function ManualDispatchAlertBlock({ course, onDismiss, onAssigned }) {
  const [showModal, setShowModal] = useState(false);

  const handleAssigned = (courseId) => {
    setShowModal(false);
    if (onAssigned) onAssigned(courseId);
    else if (onDismiss) onDismiss();
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -12, scale: 0.96 }}
        transition={{ type: "spring", damping: 22, stiffness: 300 }}
        style={{
          borderRadius: "16px",
          border: "2px solid #a855f7",
          background: "linear-gradient(135deg, #faf5ff 0%, #ffffff 100%)",
          boxShadow: "0 4px 20px rgba(168,85,247,0.25)",
          overflow: "hidden",
          marginBottom: "8px",
        }}
      >
        {/* Header */}
        <div style={{ background: "linear-gradient(90deg, #7c3aed, #4f46e5)", padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <motion.div animate={{ scale: [1, 1.35, 1] }} transition={{ duration: 0.6, repeat: Infinity }}>
              <Bell style={{ width: "14px", height: "14px", color: "white" }} />
            </motion.div>
            <p style={{ fontSize: "11px", fontWeight: 900, color: "white", letterSpacing: "0.05em", margin: 0 }}>COURSE À ASSIGNER</p>
          </div>
          <button onClick={onDismiss} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: "50%", padding: "4px", cursor: "pointer", display: "flex" }}>
            <X style={{ width: "12px", height: "12px", color: "white" }} />
          </button>
        </div>

        {/* Corps */}
        <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {/* Trajet + prix */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", flexShrink: 0 }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#22c55e" }} />
              <div style={{ width: "2px", height: "14px", background: "#d1d5db" }} />
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#ef4444" }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: "12px", fontWeight: 700, margin: "0 0 2px 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{course.quartier_depart}</p>
              <p style={{ fontSize: "12px", fontWeight: 700, margin: 0, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{course.quartier_arrivee}</p>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <p style={{ fontSize: "16px", fontWeight: 900, color: "#1E6BFF", margin: 0 }}>{(course.prix || 0).toLocaleString()} F</p>
              <p style={{ fontSize: "10px", color: "#6b7280", margin: 0 }}>{course.type_colis}</p>
            </div>
          </div>

          {/* Client + heure */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "10px", color: "#6b7280", display: "flex", alignItems: "center", gap: "4px" }}>
              <Clock style={{ width: "10px", height: "10px" }} />
              {moment(course.created_date).format("HH:mm:ss")} · {moment(course.created_date).fromNow()}
            </span>
            <span style={{ fontSize: "10px", background: "#f3e8ff", color: "#7c3aed", padding: "2px 8px", borderRadius: "12px", fontWeight: 700 }}>
              ⏳ En attente
            </span>
          </div>

          {/* Bouton assigner */}
          <button
            onClick={() => setShowModal(true)}
            style={{
              width: "100%",
              padding: "10px",
              background: "#7c3aed",
              color: "white",
              border: "none",
              borderRadius: "10px",
              fontWeight: 700,
              fontSize: "13px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
            }}
          >
            <UserPlus style={{ width: "14px", height: "14px" }} />
            Assigner un livreur
          </button>
        </div>
      </motion.div>

      {/* Modal inline — aucune navigation */}
      <AnimatePresence>
        {showModal && (
          <>
            {/* Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowModal(false)}
              style={{
                position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
                zIndex: 99995,
              }}
            />
            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 40 }}
              transition={{ type: "spring", damping: 24, stiffness: 320 }}
              style={{
                position: "fixed",
                bottom: 0, left: 0, right: 0,
                zIndex: 99996,
                background: "white",
                borderRadius: "20px 20px 0 0",
                padding: "20px 16px 32px",
                maxHeight: "75vh",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* En-tête modal */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <div>
                  <p style={{ fontSize: "15px", fontWeight: 800, margin: 0 }}>Assigner un livreur</p>
                  <p style={{ fontSize: "11px", color: "#6b7280", margin: "2px 0 0 0" }}>
                    {course.quartier_depart} → {course.quartier_arrivee} · {(course.prix || 0).toLocaleString()} F
                  </p>
                </div>
                <button onClick={() => setShowModal(false)} style={{ background: "#f3f4f6", border: "none", borderRadius: "50%", padding: "6px", cursor: "pointer", display: "flex" }}>
                  <X style={{ width: "14px", height: "14px" }} />
                </button>
              </div>

              <div style={{ flex: 1, overflowY: "auto" }}>
                <DriverList
                  course={course}
                  onAssigned={handleAssigned}
                  onClose={() => setShowModal(false)}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}