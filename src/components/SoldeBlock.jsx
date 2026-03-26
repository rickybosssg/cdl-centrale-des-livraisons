import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function SoldeBlock({ user }) {
  if (user?.livreur_bloque) {
    return (
      <Card className="bg-red-50 border-red-300">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-red-700">Compte bloqué</p>
              <p className="text-xs text-red-600 mt-1">
                Votre compte est temporairement bloqué. Veuillez contacter l'administration CDL.
              </p>
              {user.motif_blocage && (
                <p className="text-xs text-red-500 mt-1">Motif : {user.motif_blocage}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const solde = user?.solde_commission_du || 0;
  if (solde <= 0) return null;

  return (
    <Card className="bg-amber-50 border-amber-200">
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <p className="text-xs font-medium text-amber-700">Vous avez un solde impayé envers CDL</p>
          </div>
          <p className="text-sm font-bold text-amber-700">{Math.round(solde).toLocaleString()} F</p>
        </div>
      </CardContent>
    </Card>
  );
}