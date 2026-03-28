import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function SplashWelcome({ prenom, onDone }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDone, 600); // attendre la fin de l'animation de sortie
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.05 }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-primary"
        >
          {/* Logo */}
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
            className="mb-6"
          >
            <img
              src="https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg"
              alt="CDL"
              className="h-24 w-24 rounded-2xl object-cover shadow-2xl border-4 border-white/30"
            />
          </motion.div>

          {/* Texte bienvenue */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="text-center space-y-1"
          >
            <p className="text-white/80 text-lg font-medium tracking-widest uppercase">
              Bienvenue
            </p>
            <p className="text-white text-3xl font-bold">
              {prenom} 👋
            </p>
          </motion.div>

          {/* Sous-titre */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.5 }}
            className="text-white/60 text-sm mt-4"
          >
            Centrale des Livraisons – Ouagadougou
          </motion.p>

          {/* Barre de progression */}
          <motion.div
            className="absolute bottom-12 w-32 h-1 bg-white/20 rounded-full overflow-hidden"
          >
            <motion.div
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 2.5, ease: "linear" }}
              className="h-full bg-white rounded-full"
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}