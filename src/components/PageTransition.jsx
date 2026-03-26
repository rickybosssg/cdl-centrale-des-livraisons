import { motion, AnimatePresence } from "framer-motion";
import { useLocation, Outlet } from "react-router-dom";

const variants = {
  initial: { opacity: 0, x: 18, y: 0 },
  animate: { opacity: 1, x: 0, y: 0 },
  exit: { opacity: 0, x: -18, y: 0 },
};

export default function PageTransition() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        variants={variants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        style={{ willChange: "opacity, transform" }}
      >
        <Outlet />
      </motion.div>
    </AnimatePresence>
  );
}