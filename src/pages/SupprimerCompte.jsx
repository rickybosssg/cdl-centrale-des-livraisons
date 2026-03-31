import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function SupprimerCompte() {
  const navigate = useNavigate();
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1); // 1=info, 2=confirm

  const handleDelete = async () => {
    if (!confirmed) {
      toast.error("Veuillez cocher la case de confirmation");
      return;
    }
    setLoading(true);
    try {
      const me = await base44.auth.me();
      // Marquer le compte comme "demande_suppression"
      await base44.auth.updateMe({
        demande_suppression: true,
        demande_suppression_at: new Date().toISOString(),
        statut_compte: "demande_suppression",
      });
      // Créer une notification admin
      await base44.entities.Notification.create({
        destinataire_email: "weezyh2@gmail.com",
        destinataire_role: "admin",
        titre: "🗑️ Demande de suppression de compte",
        message: `L'utilisateur ${me.full_name} (${me.email}) a demandé la suppression de son compte.`,
        type: "warning",
        lue: false,
      });
      toast.success("Votre demande de suppression a été enregistrée. Votre compte sera supprimé sous 30 jours.");
      setTimeout(() => {
        base44.auth.logout();
      }, 3000);
    } catch (err) {
      toast.error("Erreur : " + err.message);
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-4 pb-16 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold text-destructive">Supprimer mon compte</h1>
      </div>

      {step === 1 && (
        <div className="space-y-5">
          <div className="rounded-2xl bg-red-50 border border-red-200 p-5 space-y-3">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-red-500 flex-shrink-0" />
              <p className="font-semibold text-red-800">Action irréversible</p>
            </div>
            <p className="text-sm text-red-700 leading-relaxed">
              La suppression de votre compte entraîne la perte définitive de :
            </p>
            <ul className="text-sm text-red-700 space-y-1 list-disc list-inside">
              <li>Votre profil et vos informations personnelles</li>
              <li>Votre historique de courses / commandes</li>
              <li>Vos gains non encaissés</li>
              <li>Vos évaluations et avis</li>
            </ul>
          </div>

          <div className="rounded-xl bg-muted p-4 space-y-2">
            <p className="text-sm font-medium">📋 Ce qui se passe après votre demande :</p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Votre compte est désactivé immédiatement</li>
              <li>Vos données sont effacées sous 30 jours</li>
              <li>Les données légalement requises (transactions) sont conservées 5 ans</li>
            </ul>
          </div>

          <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 space-y-2">
            <p className="text-sm font-medium text-blue-800">💡 Alternative</p>
            <p className="text-sm text-blue-700">
              Si vous avez un problème, contactez-nous d'abord via WhatsApp. Nous pouvons souvent résoudre le problème sans supprimer votre compte.
            </p>
            <a
              href="https://wa.me/message/EH7SMNHNHL7RN1?text=Bonjour+CDL,+j'ai+un+problème+avec+mon+compte."
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-green-600 font-semibold underline"
            >
              💬 Contacter CDL sur WhatsApp
            </a>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => navigate(-1)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => setStep(2)}
            >
              Continuer
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <div className="rounded-2xl bg-red-50 border-2 border-red-300 p-5 text-center space-y-2">
            <Trash2 className="h-10 w-10 text-red-500 mx-auto" />
            <p className="font-bold text-red-800">Confirmation finale</p>
            <p className="text-sm text-red-700">Êtes-vous absolument certain de vouloir supprimer votre compte CDL ?</p>
          </div>

          <label className="flex items-start gap-3 cursor-pointer p-4 rounded-xl border-2 border-border hover:border-destructive transition-colors">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={e => setConfirmed(e.target.checked)}
              className="mt-0.5 h-5 w-5 accent-red-600 cursor-pointer flex-shrink-0"
            />
            <span className="text-sm leading-relaxed">
              Je comprends que cette action est <strong>irréversible</strong> et que toutes mes données seront supprimées définitivement sous 30 jours.
            </span>
          </label>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setStep(1)} disabled={loading}>
              Retour
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={handleDelete}
              disabled={!confirmed || loading}
            >
              {loading ? "Traitement..." : "Supprimer définitivement"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}