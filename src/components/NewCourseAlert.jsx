import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Package, Zap, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { vibrateNotif } from "@/lib/vibration";
import { toast } from "sonner";

const TIMER_DURATION = 25;

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
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!course) return;
    setTimeLeft(TIMER_DURATION);
    playAlertSound();
    vibrateNotif();
    try { navigator.vibrate?.([200, 100, 200, 100, 200]); } catch (_) {}

    intervalRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(intervalRef.current); onClose(); return 0; }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(intervalRef.current);
  }, [course?.id]);

  // Fermer automatiquement si la course affichée est annulée ou supprimée
  useEffect(() => {
    if (!course?.id) return;
    const unsub = base44.entities.Course.subscribe((ev) => {
      if (ev.id !== course.id) return;
      const d = ev.data;
      if (!d || d.is_deleted || d.statut === 'annulee' || ev.type === 'delete') {
        clearInterval(intervalRef.current);
        onClose();
      }
    });
    return () => unsub?.();
  }, [course?.id]);

  // ── Refus — via courseStateMachine (gère mode manuel/auto) ─────────────────
  const handleRefuse = async () => {
    if (!course || !user) return;
    clearInterval(intervalRef.current);
    onClose();
    try {
      const res = await base44.functions.invoke('courseStateMachine', {
        course_id: course.id,
        action: 'REFUSE',
      });
      if (!res?.data?.success && !res?.data?.alreadyDone) {
        toast.error(res?.data?.error || "Impossible de refuser cette course");
      }
    } catch (err) {
      toast.error("Erreur refus : " + err.message);
    }
  };

  // ── Acceptation — via courseStateMachine (source unique) ───────────────────
  const handleAccept = async () => {
    if (!course) return;
    setAccepting(true);
    clearInterval(intervalRef.current);

    try {
      let me = user;
      if (!me?.email) me = await base44.auth.me();
      if (!me?.email) {
        toast.error("Impossible d'identifier votre compte. Réessayez.");
        setAccepting(false);
        return;
      }

      const res = await base44.functions.invoke('courseStateMachine', {
        course_id: course.id,
        action: 'ACCEPT',
      });

      if (res?.data?.success || res?.data?.alreadyDone) {
        toast.success("✅ Course acceptée !");
        onClose();
        navigate(`/course-livreur/${course.id}`);
      } else {
        const statut = res?.data?.current_statut;
        if (statut === 'acceptee' || statut === 'en_cours') {
          onClose();
          navigate(`/course-livreur/${course.id}`);
        } else {
          toast.error(res?.data?.error || "Course non disponible");
          setAccepting(false);
        }
      }
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
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          transition={{ type: "spring", damping: 22, stiffness: 300 }}
          style={{
            position: "fixed",
            top: "max(env(safe-area-inset-top), 8px)",
            left: "10px",
            right: "10px",
            zIndex: 99999,
          }}
          data-testid="new-course-alert"
          data-course-id={course.id}
        >
          <div className="w-full bg-white rounded-2xl shadow-2xl overflow-hidden border-2 border-orange-400">
            {/* Header */}
            <div className="bg-gradient-to-r from-orange-500 to-red-500 px-4 py-3 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 0.6, repeat: Infinity }}>
                    <Zap className="h-5 w-5" />
                  </motion.div>
                  <p className="text-base font-black tracking-wide">NOUVELLE COURSE !</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative h-8 w-8">
                    <svg className="h-8 w-8 -rotate-90" viewBox="0 0 32 32">
                      <circle cx="16" cy="16" r="13" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
                      <circle cx="16" cy="16" r="13" fill="none" stroke="white" strokeWidth="3"
                        strokeDasharray={`${2 * Math.PI * 13}`}
                        strokeDashoffset={`${2 * Math.PI * 13 * (1 - timerPercent / 100)}`}
                        style={{ transition: "stroke-dashoffset 1s linear" }}
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white">{timeLeft}</span>
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
                    <p className="font-bold text-xs">{course.type_colis || "—"}</p>
                  </div>
                </div>
              </div>

              <div className="text-center py-2 rounded-xl bg-green-50 border-2 border-green-300">
                <p className="text-3xl font-black text-green-700">
                  {(course.gain_livreur || Math.round((course.prix || 0) * 0.8)).toLocaleString()} F CFA
                </p>
                <p className="text-xs text-green-600 font-semibold">💰 Votre gain</p>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 border-red-300 text-red-500 h-11" onClick={handleRefuse} disabled={accepting}>
                  ❌ Refuser
                </Button>
                <Button className="flex-[2] h-14 bg-green-500 hover:bg-green-600 text-white font-black text-lg shadow-lg" onClick={handleAccept} disabled={accepting}>
                  {accepting ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      En cours...
                    </span>
                  ) : "✅ ACCEPTER"}
                </Button>
              </div>

              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <motion.div className="h-full rounded-full" style={{ backgroundColor: timerColor, width: `${timerPercent}%` }} transition={{ duration: 0.5 }} />
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}