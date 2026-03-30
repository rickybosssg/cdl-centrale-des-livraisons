import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { CheckCircle2, XCircle, MapPin, Phone, Package, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { reassignerCourse } from "@/lib/dispatch";

export default function CoursePendante({ course, onRespond }) {
  const TIMER = 60;
  const [remaining, setRemaining] = useState(TIMER);
  const [responding, setResponding] = useState(false);

  const accepter = async () => {
    setResponding(true);
    const user = await base44.auth.me();
    await base44.entities.Course.update(course.id, {
      statut: "acceptee",
      date_acceptation: new Date().toISOString(),
      telephone_livreur: user.telephone || "",
    });
    await base44.auth.updateMe({
      nombre_courses_actives: (user.nombre_courses_actives || 0) + 1,
      derniere_course_attribuee_at: new Date().toISOString(),
    });
    toast.success("✅ Course acceptée !");
    onRespond?.('accepted');
    setResponding(false);
  };

  const refuser = async () => {
    setResponding(true);
    await base44.functions.invoke('reDispatch', { course_id: course.id });
    const user = await base44.auth.me();
    await base44.auth.updateMe({
      nombre_courses_actives: Math.max(0, (user.nombre_courses_actives || 0) - 1),
    });
    toast.info("Course refusée");
    onRespond?.('refused');
    setResponding(false);
  };

  const handleTimeout = async () => {
    await base44.functions.invoke('reDispatch', { course_id: course.id });
    onRespond?.('timeout');
  };

  useEffect(() => {
    // Vibration à l'arrivée
    if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(r => {
        if (r <= 1) {
          clearInterval(interval);
          handleTimeout();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const gainLivreur = Math.round((course.prix || 0) * 0.8);
  const pct = (remaining / TIMER) * 100;
  const urgent = remaining <= 10;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center p-4" style={{backdropFilter:'blur(4px)'}}>
      <Card className="w-full max-w-sm animate-in slide-in-from-bottom duration-300 shadow-2xl">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
            <h2 className="font-bold text-lg">🛵 Nouvelle course !</h2>
            {(course.urgence === 'tres_urgent' || course.niveau_urgence === 'tres_urgent') && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 animate-pulse">🚨 TRÈS URGENT</span>
            )}
            {(course.urgence === 'urgent' || course.niveau_urgence === 'urgent') && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">🔔 URGENT</span>
            )}
          </div>
            <div className={`flex items-center gap-1.5 ${urgent ? "text-red-500 animate-pulse" : "text-amber-500"}`}>
              <Clock className="h-4 w-4" />
              <span className="text-2xl font-bold tabular-nums">{remaining}s</span>
            </div>
          </div>

          {/* Timer bar */}
          <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${urgent ? "bg-red-500" : "bg-primary"}`}
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* Gain mis en avant */}
          <div className="flex items-center justify-center gap-2 py-2 rounded-xl bg-green-50 border border-green-200">
            <span className="text-2xl font-black text-green-600">+{gainLivreur.toLocaleString()} FCFA</span>
            <span className="text-xs text-green-500 font-medium">votre gain</span>
          </div>

          {/* Details */}
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <div className="flex flex-col items-center mt-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-green-500" />
                <div className="h-6 w-0.5 bg-muted" />
                <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
              </div>
              <div className="space-y-2 flex-1">
                <div>
                  <p className="text-xs text-muted-foreground">Départ</p>
                  <p className="font-semibold">{course.quartier_depart}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Arrivée</p>
                  <p className="font-semibold">{course.quartier_arrivee}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
              <Package className="h-4 w-4 text-accent" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Type de colis</p>
                <p className="text-sm font-medium">{course.type_colis}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Prix client</p>
                <p className="font-bold text-primary">{course.prix} FCFA</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 rounded-lg bg-muted/50">
                <p className="text-muted-foreground">Expéditeur</p>
                <p className="font-medium">{course.telephone_expediteur}</p>
              </div>
              <div className="p-2 rounded-lg bg-muted/50">
                <p className="text-muted-foreground">Destinataire</p>
                <p className="font-medium">{course.telephone_destinataire}</p>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 border-red-300 text-red-600 hover:bg-red-50"
              onClick={refuser}
              disabled={responding}
            >
              <XCircle className="h-4 w-4 mr-1" />
              Refuser
            </Button>
            <Button
              className="flex-1 bg-green-600 hover:bg-green-700 text-base font-bold"
              onClick={accepter}
              disabled={responding}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Accepter
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}