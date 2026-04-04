import { motion, AnimatePresence } from "framer-motion";
import { Flame, X } from "lucide-react";
import { useState } from "react";

export default function ForteDemandeBanner({ coursesEnAttente, livreursActifs, disponible }) {
  const [dismissed, setDismissed] = useState(false);

  // Forte demande: 3+ courses en attente ET livreur hors ligne
  const showForte = !disponible && coursesEnAttente >= 3;
  // Très forte demande: 5+ courses et peu de livreurs
  const showUrgent = !disponible && coursesEnAttente >= 5 && livreursActifs <= 2;

  if (dismissed || (!showForte && !showUrgent)) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className={`mx-4 rounded-2xl p-4 shadow-lg ${
          showUrgent
            ? 'bg-gradient-to-r from-red-600 to-orange-600'
            : 'bg-gradient-to-r from-orange-500 to-amber-500'
        } text-white`}
      >
        <div className="flex items-start gap-3">
          <motion.div
            animate={{ rotate: [0, -15, 15, -15, 0] }}
            transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}
          >
            <Flame className="h-6 w-6 flex-shrink-0 mt-0.5" />
          </motion.div>
          <div className="flex-1">
            <p className="font-black text-base">
              {showUrgent ? '🚨 URGENCE — Forte demande !' : '🔥 Beaucoup de courses disponibles !'}
            </p>
            <p className="text-sm font-medium mt-0.5 opacity-90">
              {coursesEnAttente} courses en attente maintenant.
              {showUrgent ? ' Très peu de livreurs en ligne !' : ' Mettez-vous en ligne pour gagner de l\'argent.'}
            </p>
          </div>
          <button onClick={() => setDismissed(true)} className="p-1 rounded-full bg-white/20 flex-shrink-0">
            <X className="h-3 w-3" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}