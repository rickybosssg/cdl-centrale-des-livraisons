/**
 * GlobalRealtimeAlert — Alerte écran temps réel pour tous les rôles
 * 
 * Écoute les Notifications internes (entité Notification) de l'utilisateur connecté
 * et affiche une carte flottante interactive avec action contextuelle.
 * 
 * La cloche reste l'historique. Ce composant = alerte immédiate uniquement.
 * Disparition auto après 8 secondes. Pas de doublon avec les notifs push FCM.
 */
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Bell } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";

// Durée d'affichage en secondes
const DISPLAY_DURATION = 8;

// Son léger de notification
function playNotifSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch (_) {}
}

// Résoudre le CTA contextuel selon le type et la notification
function resolveCta(notif) {
  const titre = (notif.titre || "").toLowerCase();
  const msg = (notif.message || "").toLowerCase();
  const courseId = notif.course_id || notif.target_entity_id;

  if (courseId && (titre.includes("assignée") || titre.includes("course") || msg.includes("course assignée"))) {
    return { label: "Voir la course", route: `/course-livreur/${courseId}` };
  }
  if (courseId && (titre.includes("en route") || titre.includes("livreur") || msg.includes("accepté"))) {
    return { label: "Suivre", route: `/course/${courseId}/track` };
  }
  if (courseId && (titre.includes("annulée") || titre.includes("annulée") || msg.includes("annulée"))) {
    return { label: "Voir détails", route: `/course/${courseId}` };
  }
  if (courseId && (titre.includes("livraison") || titre.includes("livrée") || msg.includes("livrée"))) {
    return { label: "Voir détails", route: `/course/${courseId}` };
  }
  if (notif.target_entity_id && notif.target_entity_type === "commande") {
    return { label: "Voir commande", route: `/commande-marketplace/${notif.target_entity_id}` };
  }
  if (notif.target_screen) {
    return { label: "Voir", route: notif.target_screen };
  }
  if (courseId) {
    return { label: "Voir", route: `/course/${courseId}` };
  }
  return null;
}

// Couleur selon type
const TYPE_STYLES = {
  success: { bg: "#F0FDF4", border: "#86EFAC", icon: "✅", text: "#166534" },
  warning: { bg: "#FFFBEB", border: "#FCD34D", icon: "⚠️", text: "#92400E" },
  danger:  { bg: "#FEF2F2", border: "#FCA5A5", icon: "🚨", text: "#991B1B" },
  info:    { bg: "#EFF6FF", border: "#93C5FD", icon: "ℹ️", text: "#1E40AF" },
};

function AlertCard({ notif, onClose }) {
  const navigate = useNavigate();
  const [timeLeft, setTimeLeft] = useState(DISPLAY_DURATION);
  const intervalRef = useRef(null);
  const style = TYPE_STYLES[notif.type] || TYPE_STYLES.info;
  const cta = resolveCta(notif);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(intervalRef.current); onClose(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, []);

  const handleCta = () => {
    onClose();
    if (cta?.route) navigate(cta.route);
  };

  return (
    <motion.div
      initial={{ y: -80, opacity: 0, scale: 0.95 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: -80, opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", damping: 22, stiffness: 300 }}
      style={{
        background: style.bg,
        border: `1.5px solid ${style.border}`,
        borderRadius: "16px",
        padding: "12px 14px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
        marginBottom: "8px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Barre de progression */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "3px", background: "rgba(0,0,0,0.06)" }}>
        <motion.div
          style={{ height: "100%", background: style.border, width: `${(timeLeft / DISPLAY_DURATION) * 100}%` }}
          transition={{ duration: 0.8 }}
        />
      </div>

      <div className="flex items-start gap-3">
        <span className="text-xl flex-shrink-0 mt-0.5">{style.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold leading-tight" style={{ color: style.text }}>{notif.titre}</p>
          {notif.message && (
            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: style.text, opacity: 0.8 }}>
              {notif.message.length > 80 ? notif.message.slice(0, 80) + "…" : notif.message}
            </p>
          )}
          {cta && (
            <button
              onClick={handleCta}
              className="mt-2 text-xs font-bold px-3 py-1.5 rounded-lg"
              style={{ background: style.border, color: style.text }}
            >
              {cta.label} →
            </button>
          )}
        </div>
        <button onClick={onClose} className="flex-shrink-0 p-1 rounded-full" style={{ background: "rgba(0,0,0,0.06)" }}>
          <X className="h-3.5 w-3.5" style={{ color: style.text }} />
        </button>
      </div>
    </motion.div>
  );
}

export default function GlobalRealtimeAlert({ userEmail }) {
  const [queue, setQueue] = useState([]);
  const seenRef = useRef(new Set());
  const mountedAt = useRef(Date.now());

  useEffect(() => {
    if (!userEmail) return;

    const unsub = base44.entities.Notification.subscribe((event) => {
      if (event.type !== "create") return;
      const notif = event.data;
      if (!notif) return;

      // Ignorer les notifs créées avant le mount (historique)
      const notifAge = Date.now() - new Date(notif.created_date || 0).getTime();
      if (notifAge > 10000) return; // plus de 10s → ancien

      // Filtrer pour cet utilisateur
      if (notif.destinataire_email !== userEmail) return;

      // Dédoublonnage
      if (seenRef.current.has(notif.id)) return;
      seenRef.current.add(notif.id);

      // Son + vibration
      playNotifSound();
      try { navigator.vibrate?.([80, 40, 80]); } catch (_) {}

      // Marquer comme lue après affichage (fire-and-forget)
      const notifId = notif.id;
      setTimeout(() => {
        base44.entities.Notification.update(notifId, { lue: true }).catch(() => {});
      }, DISPLAY_DURATION * 1000);

      setQueue(prev => [...prev, { ...notif, _alertId: `${notif.id}_${Date.now()}` }]);
    });

    return () => unsub?.();
  }, [userEmail]);

  const dismiss = (alertId) => {
    setQueue(prev => prev.filter(n => n._alertId !== alertId));
  };

  // Max 3 alertes simultanées
  const visible = queue.slice(-3);

  return (
    <div
      style={{
        position: "fixed",
        top: "max(env(safe-area-inset-top), 8px)",
        left: "10px",
        right: "10px",
        zIndex: 99990,
        pointerEvents: "none",
      }}
    >
      <div style={{ pointerEvents: "auto" }}>
        <AnimatePresence>
          {visible.map(notif => (
            <AlertCard
              key={notif._alertId}
              notif={notif}
              onClose={() => dismiss(notif._alertId)}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}