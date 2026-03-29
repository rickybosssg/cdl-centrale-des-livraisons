import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function DeleteUserButton({ email, userName, onDeleted }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      // Récupérer l'utilisateur et le supprimer
      const users = await base44.entities.User.filter({ email });
      if (users.length > 0) {
        await base44.asServiceRole.entities.User.delete(users[0].id);
        toast.success(`${userName} a été supprimé`);
        onDeleted?.();
      }
    } catch (err) {
      toast.error("Erreur lors de la suppression: " + err.message);
    }
    setDeleting(false);
  };

  return (
    <>
      {!showConfirm ? (
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setShowConfirm(true)}
          className="w-full"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Supprimer cet utilisateur
        </Button>
      ) : (
        <div className="space-y-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700 font-semibold">
            ⚠️ Êtes-vous sûr ?
          </p>
          <p className="text-xs text-red-600">
            Cette action supprimera définitivement {userName} et toutes ses données.
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowConfirm(false)}
              className="flex-1"
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1"
            >
              {deleting ? "Suppression..." : "Confirmer la suppression"}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}