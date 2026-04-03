import { MapPin, Phone, Package, Clock, User, Zap, Send, RefreshCw } from "lucide-react";
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
      className={`cursor-pointer border-l-4 rounded-2xl overflow-hidden ${
        course.urgence === 'tres_urgent' ? 'border-l-red-500' :
        course.urgence === 'urgent' ? 'border-l-orange-500' : 'border-l-primary'
      }`}
      onClick={() => onClick?.(course)}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-2 flex-wrap mb-3">
          {course.source === 'mall' && (
            <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">
              🏪 MALL
            </span>
          )}
          {course.type_mission === 'envoyer' && (
            <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
              <Send className="h-2.5 w-2.5" />ENVOYER
            </span>
          )}
          {course.type_mission === 'recuperer' && (
            <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-accent/10 text-accent">
              <RefreshCw className="h-2.5 w-2.5" />RÉCUPÉRER
            </span>
          )}
          <Package className="h-4 w-4 text-accent" />
          <span className="text-sm font-medium">{course.type_colis}</span>
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

          {course.client_name && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <User className="h-3 w-3" />
              <span className="font-medium">Client:</span> {course.client_name}
            </div>
          )}
          {course.livreur_name && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <User className="h-3 w-3" />
              <span className="font-medium">Livreur:</span> {course.livreur_name}
            </div>
          )}
        </div>

        {children && <div className="mt-3 pt-3 border-t">{children}</div>}
      </CardContent>
    </Card>
    </motion.div>
  );
}