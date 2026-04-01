import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { AlertCircle, Trash2, RotateCcw, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import moment from "moment";

const PROFILE_CFG = {
  client: { emoji: "👤", label: "Client", desc: "Client CDL" },
  livreur: { emoji: "🛵", label: "Livreur", desc: "Courrier/Livreur" },
  partenaire: { emoji: "🏪", label: "Partenaire", desc: "Commerce partenaire" },
  commercial: { emoji: "📣", label: "Commercial", desc: "Recruteur commercial" },
};

export default function PendingProfiles({ pendingProfiles, onProfileChange }) {
  const [cancelDialog, setCancelDialog] = useState(null);
  const [canceling, setCanceling] = useState(null);

  const handleCancel = async () => {
    if (!cancelDialog) return;
    console.log("[PendingProfiles] Annulation du profil:", cancelDialog.id);
    setCanceling(cancelDialog.id);

    try {
      const result = await base44.functions.invoke("cancelProfileRequest", {
        profile_id: cancelDialog.id,
      });
      console.log("[PendingProfiles] Résultat annulation:", result.data);

      if (result.data?.success) {
        toast.success("Demande annulée avec succès");
        setCancelDialog(null);
        onProfileChange?.();
      } else {
        toast.error(result.data?.error || "Erreur lors de l'annulation");
      }
    } catch (err) {
      console.error("[PendingProfiles] Exception annulation:", err);
      toast.error("Erreur réseau: " + err.message);
    }

    setCanceling(null);
  };

  if (!pendingProfiles || pendingProfiles.length === 0) {
    return null;
  }

  console.log("[PendingProfiles] Affichage", pendingProfiles.length, "profils en attente");

  return (
    <div className="space-y-3 pb-4">
      <div className="flex items-center gap-2 px-4 text-sm font-semibold text-amber-700">
        <Clock className="h-4 w-4" />
        Demandes en attente de validation ({pendingProfiles.length})
      </div>

      {pendingProfiles.map((profile) => {
        const cfg = PROFILE_CFG[profile.profile_type];
        if (!cfg) return null;

        const createdDate = moment(profile.created_date).format("DD/MM/YYYY HH:mm");
        const daysAgo = moment().diff(moment(profile.created_date), "days");

        return (
          <Card key={profile.id} className="border-l-4 border-l-amber-500 bg-amber-50/50">
            <CardContent className="p-4 space-y-3">
              {/* En-tête */}
              <div className="flex items-start gap-3">
                <div className="text-2xl flex-shrink-0">{cfg.emoji}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{cfg.label}</p>
                  <p className="text-xs text-muted-foreground">{cfg.desc}</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-200 text-amber-800 flex-shrink-0">
                  ⏳ En attente
                </span>
              </div>

              {/* Info statut */}
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-white/60 border border-amber-200 text-xs text-amber-700">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Votre demande est en cours d'examen</p>
                  <p className="text-amber-600 text-[10px] mt-0.5">
                    Envoyée le {createdDate} ({daysAgo === 0 ? "aujourd'hui" : `il y a ${daysAgo}j`})
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 text-xs h-9"
                  onClick={() => {
                    console.log("[PendingProfiles] Ouverture dialog annulation pour:", profile.id);
                    setCancelDialog(profile);
                  }}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Annuler la demande
                </Button>
              </div>

              {/* Note légale */}
              <p className="text-[10px] text-muted-foreground text-center">
                L'équipe CDL examine votre demande. Vous serez notifié du résultat par email.
              </p>
            </CardContent>
          </Card>
        );
      })}

      {/* Dialog confirmation annulation */}
      <Dialog open={!!cancelDialog} onOpenChange={() => setCancelDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Annuler cette demande ?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Êtes-vous sûr de vouloir annuler votre demande de profil{" "}
              <strong>{cancelDialog ? PROFILE_CFG[cancelDialog.profile_type]?.label : ""}</strong> ?
            </p>
            <p className="text-xs text-red-600">
              ⚠️ Vous pourrez la recréer ultérieurement, mais devrez remplir le formulaire à nouveau.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setCancelDialog(null)}>
              Non, garder
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={canceling === cancelDialog?.id}
              onClick={handleCancel}
            >
              {canceling === cancelDialog?.id ? (
                <>
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                  Annulation...
                </>
              ) : (
                <>
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Oui, annuler
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}