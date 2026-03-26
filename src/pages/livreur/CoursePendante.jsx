import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { CheckCircle2, XCircle, MapPin, Phone, Package, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { reassignerCourse } from "@/lib/dispatch";

export default function CoursePendante({ course, onRespond }) {
  const [remaining, setRemaining] = useState(30);
  const [responding, setResponding] = useState(false);

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

  const handleTimeout = async () => {
    if (responding) return;
    setResponding(true);
    const hist = course.historique_assignation ? JSON.parse(course.historique_assignation) : [];
    const updated = hist.map(h =>
      h.livreur_email === course.livreur_email && h.statut === "proposee"
        ? { ...h, statut: "sans_reponse" }
        : h
    );
    await base44.entities.Course.update(course.id, {
      statut: "en_attente",
      historique_assignation: JSON.stringify(updated),
      livreur_email: "",
      livreur_name: "",
    });
    await reassignerCourse({ ...course, statut: "en_attente" });
    onRespond?.();
  };

  const accepter = async () => {
    setResponding(true);
    const hist = course.historique_assignation ? JSON.parse(course.historique_assignation) : [];
    const updated = hist.map(h =>
      h.livreur_email === course.livreur_email && h.statut === "proposee"
        ? { ...h, statut: "acceptee" }
        : h
    );
    await base44.entities.Course.update(course.id, {
      statut: "acceptee",
      date_acceptation: new Date().toISOString(),
      historique_assignation: JSON.stringify(updated),
    });
    toast.success("Course acceptée !");
    onRespond?.();
  };

  const refuser = async () => {
    setResponding(true);
    const hist = course.historique_assignation ? JSON.parse(course.historique_assignation) : [];
    const updated = hist.map(h =>
      h.livreur_email === course.livreur_email && h.statut === "proposee"
        ? { ...h, statut: "refusee" }
        : h
    );
    await base44.entities.Course.update(course.id, {
      statut: "en_attente",
      historique_assignation: JSON.stringify(updated),
      livreur_email: "",
      livreur_name: "",
    });
    await reassignerCourse({ ...course, statut: "en_attente" });
    toast.info("Course refusée. Réassignation en cours...");
    onRespond?.();
  };

  const pct = (remaining / 30) * 100;
  const urgent = remaining <= 10;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center p-4">
      <Card className="w-full max-w-sm animate-in slide-in-from-bottom duration-300">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-lg">Nouvelle course ! 🛵</h2>
            <div className={`flex items-center gap-1.5 ${urgent ? "text-red-500" : "text-amber-500"}`}>
              <Clock className="h-4 w-4" />
              <span className="text-2xl font-bold">{remaining}s</span>
            </div>
          </div>

          {/* Timer bar */}
          <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${urgent ? "bg-red-500" : "bg-primary"}`}
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* Details */}
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <div className="flex flex-col items-center mt-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-green-500" />
                <div className="h-6 w-0.5 bg-muted" />
                <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
              </div>
              <div className="space-y-2">
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
              <div>
                <p className="text-xs text-muted-foreground">Type de colis</p>
                <p className="text-sm font-medium">{course.type_colis}</p>
              </div>
              <span className="ml-auto font-bold text-primary">{course.prix} FCFA</span>
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
              className="flex-1 bg-green-600 hover:bg-green-700"
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