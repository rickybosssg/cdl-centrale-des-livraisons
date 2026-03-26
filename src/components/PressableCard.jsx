import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export default function PressableCard({ children, className, onClick, ...props }) {
  return (
    <motion.div
      whileTap={onClick ? { scale: 0.97 } : {}}
      transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
      onClick={onClick}
      className={cn(
        "rounded-2xl border bg-card text-card-foreground shadow-sm",
        onClick && "cursor-pointer active:shadow-md",
        className
      )}
      style={{ willChange: "transform" }}
      {...props}
    >
      {children}
    </motion.div>
  );
}