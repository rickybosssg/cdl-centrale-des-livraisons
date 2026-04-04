import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Package, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { vibrateNotif } from "@/lib/vibration";

// Son d'alerte via Web Audio API
function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const times = [0, 0.15, 0.3];
    times.forEach(t => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.6, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.12);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.12);
    });
  } catch (_) {}
}

export default function NewCourseAlert({ course, onClose }) {
  const navigate = useNavigate();
  const timerRef = useRef(null);

  useEffect(() => {
    if (!course) return;
    playAlertSound();
    vibrateNotif();
    // Auto-dismiss après 30 secondes
    timerRef.current = setTimeout(() => onClose(), 30000);
    return () => clearTimeout(timerRef.current);
  }, [course?.id]);

  const handleAccept = () => {
    onClose();
    navigate(`/course-livreur/${course.id}`);
  };

  return (
    <AnimatePresence>
      {course && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-end justify-center p-4 bg-black/60"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 200, scale: 0.9 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 200, scale: 0.9 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header rouge urgence */}
            <div className="bg-gradient-to-r from-red-500 to-orange-500 p-4 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <motion.div
                    animate={{ scale: [1, 1.3, 1] }}
                    transition={{ duration: 0.5, repeat: Infinity }}
                  >
                    <Zap className="h-6 w-6" />
                  </motion.div>
                  <p className="text-lg font-black">NOUVELLE COURSE !</p>
                </div>
                <button onClick={onClose} className="p-1 rounded-full bg-white/20">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Contenu */}
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                <MapPin className="h-5 w-5 text-primary flex-shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Trajet</p>
                  <p className="font-bold text-sm">{course.quartier_depart} → {course.quartier_arrivee}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                <Package className="h-5 w-5 text-accent flex-shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Colis</p>
                  <p className="font-bold text-sm">{course.type_colis}</p>
                </div>
              </div>

              {course.prix && (
                <div className="text-center p-3 rounded-xl bg-green-50 border border-green-200">
                  <p className="text-2xl font-black text-green-700">{(course.gain_livreur || course.prix).toLocaleString()} F CFA</p>
                  <p className="text-xs text-green-600">Gain estimé</p>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={onClose}>
                  Ignorer
                </Button>
                <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold" onClick={handleAccept}>
                  Voir la course →
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}