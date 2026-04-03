import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { X, Phone, MapPin, Calendar, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import moment from "moment";
import { toast } from "sonner";

export default function FicheLivreur({ livreur, onClose, onUpdated }) {
  const [courses, setCourses] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      // Courses du livreur
      const coursesData = await base44.entities.Course.filter({ livreur_email: livreur.email }, "-created_date", 50);
      setCourses(coursesData);
      
      // Stats
      const delivered = coursesData.filter(c => c.statut === "livree").length;
      const totalGain = coursesData.filter(c => c.statut === "livree").reduce((sum, c) => sum + (c.gain_livreur || 0), 0);
      setStats({ delivered, totalGain });
      setLoading(false);
    };
    load();
  }, [livreur.email]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-background w-full max-w-lg rounded-2xl max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-background border-b px-4 py-3 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-base">{livreur.full_name}</h2>
            <div className="flex gap-2">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                livreur.statut_validation_livreur === "valide" ? "bg-green-100 text-green-700" : 
                livreur.statut_validation_livreur === "en_attente" ? "bg-amber-100 text-amber-700" : 
                "bg-red-100 text-red-700"
              }`}>
                {livreur.statut_validation_livreur === "valide" ? "Validé" : livreur.statut_validation_livreur === "en_attente" ? "En attente" : "Refusé"}
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${livreur.disponible ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}`}>
                {livreur.disponible ? "🟢 Actif" : "⚪ Inactif"}
              </span>
            </div>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-4 space-y-4">
          {/* Infos de base */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Téléphone</p>
                <p className="text-sm font-medium">{livreur.telephone}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Zone de travail</p>
                <p className="text-sm font-medium">{livreur.quartier || "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Inscrit depuis</p>
                <p className="text-sm font-medium">{moment(livreur.created_date).format("DD/MM/YYYY")}</p>
              </div>
            </div>
          </div>

          {/* Stats */}
          {!loading && stats && (
            <div className="grid grid-cols-2 gap-2">
              <Card className="text-center">
                <CardContent className="p-3">
                  <p className="text-xl font-bold text-green-600">{stats.delivered}</p>
                  <p className="text-[10px] text-muted-foreground">Livrées</p>
                </CardContent>
              </Card>
              <Card className="text-center">
                <CardContent className="p-3">
                  <p className="text-sm font-bold text-primary">{stats.totalGain.toLocaleString()} FCFA</p>
                  <p className="text-[10px] text-muted-foreground">Gains</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Moyen de déplacement */}
          {livreur.moyen_deplacement && (
            <div>
              <p className="text-xs font-semibold mb-2">Moyens de déplacement</p>
              <div className="flex gap-2">
                {JSON.parse(livreur.moyen_deplacement || "[]").map(m => (
                  <span key={m} className="text-xs bg-primary/10 text-primary px-3 py-1.5 rounded-full font-medium">
                    {m === "moto" ? "🛵 Moto" : "🚗 Véhicule"}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Courses récentes */}
          {courses.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-2">Courses récentes</p>
              <div className="space-y-2">
                {courses.slice(0, 5).map(course => (
                  <Card key={course.id}>
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground truncate">{course.quartier_depart} → {course.quartier_arrivee}</p>
                          <p className="text-xs font-medium">{moment(course.created_date).format("DD/MM/YY HH:mm")}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs font-bold text-primary">{course.gain_livreur || 0} FCFA</p>
                          <span className="text-[10px] inline-block px-1.5 py-0.5 rounded bg-muted">{course.statut}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}