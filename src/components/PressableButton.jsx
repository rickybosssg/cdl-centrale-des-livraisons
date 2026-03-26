import { motion } from "framer-motion";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

const PressableButton = forwardRef(({ 
  children, 
  className, 
  onClick, 
  disabled, 
  variant = "default",
  size = "default",
  asChild,
  ...props 
}, ref) => {
  const base = "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40";
  
  const variants = {
    default: "bg-primary text-primary-foreground shadow-md shadow-primary/30",
    destructive: "bg-destructive text-destructive-foreground shadow-md shadow-destructive/30",
    outline: "border border-input bg-background shadow-sm",
    secondary: "bg-secondary text-secondary-foreground shadow-sm",
    ghost: "hover:bg-accent/10",
    link: "text-primary underline-offset-4 hover:underline",
    success: "bg-green-600 text-white shadow-md shadow-green-600/30",
  };
  
  const sizes = {
    default: "h-10 px-5 py-2 text-sm",
    sm: "h-8 px-3 text-xs",
    lg: "h-12 px-8 text-base",
    icon: "h-9 w-9",
  };

  return (
    <motion.button
      ref={ref}
      whileTap={{ scale: disabled ? 1 : 0.95 }}
      transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
      className={cn(base, variants[variant] || variants.default, sizes[size] || sizes.default, className)}
      onClick={onClick}
      disabled={disabled}
      style={{ willChange: "transform" }}
      {...props}
    >
      {children}
    </motion.button>
  );
});

PressableButton.displayName = "PressableButton";
export default PressableButton;