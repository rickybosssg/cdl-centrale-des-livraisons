import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Package, Zap, X, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { vibrateNotif } from "@/lib/vibration";
import { toast } from "sonner";

const TIMER_DURATION = 25; // secondes

function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.18, 0.36, 0.54].forEach(t => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = t % 0.36 === 0 ? 1000 : 880;
      osc.type = "square";
      gain.gain.setValueAtTime(0.5, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.15);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.15);
    });
  } catch (_) {}
}

export default function NewCourseAlert({ course, onClose, user }) {
  const navigate = useNavigate();
  const [timeLeft, setTimeLeft] = useState(TIMER_DURATION);
  const [accepting, setAccepting] = useState(false);
  const timerRef = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!course) return;
    setTimeLeft(TIMER_DURATION);
    playAlertSound();
    vibrateNotif();

    intervalRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          onClose();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(intervalRef.current);
      clearTimeout(timerRef.current);
    };
  }, [course?.id]);

  const handleAccept = async () => {
    if (!course || !user) return;
    setAccepting(true);
    clearInterval(intervalRef.current);

    try {
      // Lire la course en temps réel pour vérifier qu'elle est encore disponible
      const fresh = await base44.entities.Course.filter({ id: course.id });
      const c = fresh?.[0];

      if (!c || (c.statut !== "en_attente" && c.statut !== "assignee_attente")) {
        toast.error("Course déjà attribuée à un autre livreur");
        onClose();
        return;
      }

      // Assigner le livreur
      const now = new Date().toISOString();
      await base44.entities.Course.update(course.id, {
        statut: "acceptee",
        livreur_email: user.email,
        livreur_name: user.full_name,
        telephone_livreur: user.telephone || "",
        date_acceptation: now,
        mode_assignation: "auto",
        heure_assignation: now,
      });

      // Notifier le client
      try {
        await base44.entities.Notification.create({
          destinataire_email: c.client_email,
          destinataire_role: "client",
          titre: "🛵 Votre livreur est en route !",
          message: `${user.full_name} a accepté votre course et arrive bientôt.`,
          type: "success",
          course_id: course.id,
          lue: false,
        });
      } catch (_) {}

      toast.success("✅ Course acceptée !");
      onClose();
      navigate(`/course-livreur/${course.id}`);
    } catch (err) {
      toast.error("Erreur : " + err.message);
      setAccepting(false);
    }
  };

  const timerPercent = (timeLeft / TIMER_DURATION) * 100;
  const timerColor = timeLeft > 15 ? "#22c55e" : timeLeft > 8 ? "#f59e0b" : "#ef4444";

  return (
    <AnimatePresence>
      {course && (
        <motion.div
          initial={{ y: -120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -120, opacity: 0 }}
          transition={{ type: "spring", damping: 22, stiffness: 320 }}
          className="fixed top-0 left-0 right-0 z-[9999] flex justify-center px-3 pt-2"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden border-2 border-orange-400">
            {/* Header urgence */}
            <div className="bg-gradient-to-r from-orange-500 to-red-500 px-4 py-3 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <motion.div
                    animate={{ scale: [1, 1.4, 1] }}
                    transition={{ duration: 0.5, repeat: Infinity }}
                  >
                    <Zap className="h-5 w-5" />
                  </motion.div>
                  <p className="text-base font-black tracking-wide">NOUVELLE COURSE !</p>
                </div>
                <div className="flex items-center gap-2">
                  {/* Timer circulaire */}
                  <div className="relative h-8 w-8">
                    <svg className="h-8 w-8 -rotate-90" viewBox="0 0 32 32">
                      <circle cx="16" cy="16" r="13" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
                      <circle
                        cx="16" cy="16" r="13" fill="none"
                        stroke="white" strokeWidth="3"
                        strokeDasharray={`${2 * Math.PI * 13}`}
                        strokeDashoffset={`${2 * Math.PI * 13 * (1 - timerPercent / 100)}`}
                        style={{ transition: "stroke-dashoffset 1s linear" }}
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white">
                      {timeLeft}
                    </span>
                  </div>
                  <button onClick={onClose} className="p-1 rounded-full bg-white/20 hover:bg-white/30">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Contenu */}
            <div className="p-4 space-y-3">
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 p-2.5 rounded-xl bg-blue-50 border border-blue-100">
                  <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground">Trajet</p>
                    <p className="font-bold text-xs truncate">{course.quartier_depart} → {course.quartier_arrivee}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-100">
                  <Package className="h-4 w-4 text-amber-500 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Colis</p>
                    <p className="font-bold text-xs">{course.type_colis}</p>
                  </div>
                </div>
              </div>

              {/* Gain */}
              <div className="text-center py-2 rounded-xl bg-green-50 border-2 border-green-300">
                <p className="text-3xl font-black text-green-700">
                  {(course.gain_livreur || Math.round((course.prix || 0) * 0.8)).toLocaleString()} F CFA
                </p>
                <p className="text-xs text-green-600 font-semibold">💰 Votre gain</p>
              </div>

              {/* Boutons */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 border-gray-300 text-gray-500 h-11"
                  onClick={onClose}
                  disabled={accepting}
                >
                  Refuser
                </Button>
                <Button
                  className="flex-[2] h-14 bg-green-500 hover:bg-green-600 text-white font-black text-lg shadow-lg"
                  onClick={handleAccept}
                  disabled={accepting}
                >
                  {accepting ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      Assignation...
                    </span>
                  ) : (
                    "✅ ACCEPTER"
                  )}
                </Button>
              </div>

              {/* Barre de progression timer */}
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: timerColor, width: `${timerPercent}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}