import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const NUMEROS = {
  "Orange Money": { numero: "07XX XX XX XX", couleur: "orange", emoji: "🟠" },
  "Moov Money": { numero: "01XX XX XX XX", couleur: "blue", emoji: "🔵" },
  "Telecel Money": { numero: "03XX XX XX XX", couleur: "green", emoji: "🟢" },
};

export default function PaiementMobile({ course, onConfirmed }) {
  const [confirming, setConfirming] = useState(false);
  const info = NUMEROS[course.mode_paiement];

  if (!info || course.statut_paiement !== "en_attente") return null;

  const confirmerPaiement = async () => {
    setConfirming(true);
    await base44.entities.Course.update(course.id, { statut_paiement: "paye" });
    toast.success("Paiement confirmé !");
    onConfirmed?.();
    setConfirming(false);
  };

  return (
    <Card className="border-amber-200 bg-amber-50">
      <CardContent className="p-4 space-y-3">
        <p className="font-semibold text-amber-800">
          {info.emoji} Paiement {course.mode_paiement}
        </p>
        <div className="bg-white rounded-lg p-3 border border-amber-200 space-y-1">
          <p className="text-xs text-muted-foreground">Envoyez exactement</p>
          <p className="text-2xl font-black text-primary">{course.prix} FCFA</p>
          <p className="text-xs text-muted-foreground">au numéro CDL</p>
          <p className="text-lg font-bold">{info.numero}</p>
          <p className="text-xs text-muted-foreground">
            Référence : Course #{course.id?.slice(0, 8)}
          </p>
        </div>
        <p className="text-xs text-amber-700">
          ⚠️ Effectuez le transfert sur votre application {course.mode_paiement}, puis confirmez ici.
        </p>
        <Button
          className="w-full bg-green-600 hover:bg-green-700"
          onClick={confirmerPaiement}
          disabled={confirming}
        >
          <CheckCircle2 className="h-4 w-4 mr-2" />
          {confirming ? "Confirmation..." : "J'ai effectué le paiement"}
        </Button>
      </CardContent>
    </Card>
  );
}