import { MapPin, Phone, Package, Clock, User } from "lucide-react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import StatusBadge from "./StatusBadge";
import moment from "moment";

export default function CourseCard({ course, onClick, children }) {
  return (
    <motion.div
      whileTap={onClick ? { scale: 0.97 } : {}}
      transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
      style={{ willChange: "transform" }}
    >
    <Card 
      className="cursor-pointer border-l-4 border-l-primary rounded-2xl overflow-hidden"
      onClick={() => onClick?.(course)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-accent" />
            <span className="text-sm font-medium">{course.type_colis}</span>
          </div>
          <StatusBadge statut={course.statut} />
        </div>

        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <div className="flex flex-col items-center mt-1">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <div className="h-6 w-0.5 bg-muted" />
              <div className="h-2 w-2 rounded-full bg-red-500" />
            </div>
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium">{course.quartier_depart}</p>
              <p className="text-sm text-muted-foreground">{course.quartier_arrivee}</p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {moment(course.created_date).fromNow()}
            </div>
            {course.prix && (
              <span className="text-sm font-bold text-primary">{course.prix} FCFA</span>
            )}
          </div>

          {course.livreur_name && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <User className="h-3 w-3" />
              {course.livreur_name}
            </div>
          )}
        </div>

        {children && <div className="mt-3 pt-3 border-t">{children}</div>}
      </CardContent>
    </Card>
    </motion.div>
  );
}