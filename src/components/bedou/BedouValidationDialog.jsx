/**
 * BedouValidationDialog — Dialog isolé pour valider/refuser une demande Bedou
 *
 * CRITIQUE : Ce composant est MONTÉ uniquement quand ouvert (pas de Dialog open={false})
 * Cela évite les bugs APK où onOpenChange ferme accidentellement la fenêtre pendant processing.
 *
 * Le composant gère son propre état processing/error — jamais partagé avec le parent.
 */
import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import moment from "moment";

const L = (tag, msg, data) => {
  const line = `[${tag}] ${msg}`;
  if (data !== undefined) console.log(line, data);
  else console.log(line);
};

export default function BedouValidationDialog({ request, onClose, onSuccess }) {
  const [comment, setComment] = useState(request.motif_refus || "");
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [step, setStep] = useState(null); // étape courante pour affichage

  const montant = request.montant || 0;
  const bonus = request.bonus || 0;
  const totalCredit = request.montant_total || (montant + bonus);
  const type = request.type || "recharge";
  const clientId = request.user_id || request.user_email;
  const preuveUrl = request.preuve_paiement_url || request.preuve_paiement;

  // ── VALIDER ───────────────────────────────────────────────────────────────
  const handleValider = async () => {
    L("BEDOU_VALIDATE_CLICK", `request_id=${request.id} | type=${type} | statut=${request.statut}`);

    // Guard anti-double-clic
    if (processing) {
      L("BEDOU_VALIDATE_CLICK", "ignoré — processing=true");
      return;
    }
    if (request.statut !== "en_attente") {
      toast.error("Cette demande a déjà été traitée.");
      onClose();
      return;
    }

    L("BEDOU_VALIDATE_START", `request_id=${request.id}`);
    L("BEDOU_VALIDATE_REQUEST_ID", request.id);
    L("BEDOU_VALIDATE_CLIENT_ID", clientId);
    L("BEDOU_VALIDATE_TOTAL_CREDIT", `montant=${montant} | bonus=${bonus} | total=${totalCredit}`);

    setProcessing(true);
    setErrorMsg(null);
    setStep("⏳ Connexion au serveur...");

    try {
      setStep("💳 Crédit du solde en cours...");

      const res = await base44.functions.invoke("validateBedouRequest", {
        request_id: request.id,
        type,
        action: "valider",
      });

      const d = res?.data;

      // Cas : déjà traitée (409 renvoyé en 200 avec already_processed=true)
      if (d?.already_processed) {
        L("BEDOU_VALIDATE_ERROR", "already_processed=true — aucun double crédit");
        toast.warning("⚠️ Demande déjà traitée — aucun double crédit.");
        onSuccess();
        return;
      }

      if (!d?.success) {
        const errMsg = d?.error || "Réponse inattendue du serveur";
        L("BEDOU_VALIDATE_ERROR", `success=false | error=${errMsg}`);
        setErrorMsg(`❌ Erreur serveur : ${errMsg}`);
        setProcessing(false);
        setStep(null);
        return;
      }

      // ── Tout s'est bien passé ──────────────────────────────────────────
      L("BEDOU_VALIDATE_OLD_BALANCE", d.ancien_solde);
      L("BEDOU_VALIDATE_NEW_BALANCE", d.nouveau_solde);
      L("BEDOU_VALIDATE_TOTAL_CREDIT", d.montant_credite);
      L("BEDOU_VALIDATE_TRANSACTION_CREATED", "true");
      L("BEDOU_VALIDATE_STATUS_UPDATED", "valide");
      L("BEDOU_VALIDATE_NOTIFICATION_SENT", `fcm_sent=${d.fcm_sent} | fcm_failed=${d.fcm_failed} | client_notified=${d.notification_client_sent}`);
      L("BEDOU_VALIDATE_SUCCESS", `request_id=${d.recharge_id} | old=${d.ancien_solde} | new=${d.nouveau_solde} | credite=${d.montant_credite} | delay=${d.delay_ms}ms`);

      const notifIcon = d.notification_client_sent ? `✅ push (${d.fcm_sent}/${(d.fcm_sent || 0) + (d.fcm_failed || 0)})` : "⚠️ pas de token";
      toast.success(`✅ Recharge validée ! ${(d.montant_credite || totalCredit).toLocaleString()} F CFA crédités — Notif: ${notifIcon}`, { duration: 5000 });

      setStep("✅ Validation réussie !");
      // Fermer après un court délai pour que l'admin voie la confirmation
      setTimeout(() => onSuccess(), 400);

    } catch (err) {
      L("BEDOU_VALIDATE_ERROR", `exception | message=${err?.message} | request_id=${request.id}`);

      let msg = err?.message || "Erreur inconnue";

      // 409 — déjà traitée
      if (err?.response?.status === 409 || msg.includes("déjà") || msg.includes("already")) {
        toast.warning("⚠️ Demande déjà traitée.");
        onSuccess();
        return;
      }

      // 403 — droits insuffisants
      if (err?.response?.status === 403 || msg.includes("403") || msg.includes("Admin requis")) {
        msg = "Session expirée ou droits insuffisants — reconnectez-vous.";
      }

      // 401 — non authentifié
      if (err?.response?.status === 401 || msg.includes("401") || msg.includes("authentifi")) {
        msg = "Session expirée — reconnectez-vous à l'application.";
      }

      setErrorMsg(`❌ ${msg}`);
      toast.error(`❌ Erreur validation : ${msg}`);
      setProcessing(false);
      setStep(null);
    }
  };

  // ── REFUSER ───────────────────────────────────────────────────────────────
  const handleRefuser = async () => {
    if (!comment.trim()) {
      toast.error("Veuillez indiquer un motif de refus");
      return;
    }
    if (processing) return;

    setProcessing(true);
    setErrorMsg(null);
    setStep("⏳ Refus en cours...");

    try {
      const res = await base44.functions.invoke("validateBedouRequest", {
        request_id: request.id,
        type,
        action: "refuser",
        motif_refus: comment.trim(),
      });

      if (res.data?.already_processed) {
        toast.warning("⚠️ Demande déjà traitée.");
        onSuccess();
        return;
      }

      toast.success("Demande refusée — client notifié");
      setTimeout(() => onSuccess(), 300);

    } catch (err) {
      const msg = err?.message || "Erreur inconnue";
      setErrorMsg(`❌ ${msg}`);
      toast.error("Erreur refus : " + msg);
      setProcessing(false);
      setStep(null);
    }
  };

  // ── RENDU — overlay modal natif (pas Dialog shadcn) ───────────────────────
  // On utilise un overlay React pur pour éviter les fermetures accidentelles sur APK
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.55)" }}
    >
      {/* Bloquer les clics sur l'overlay pendant processing */}
      {!processing && (
        <div
          className="absolute inset-0"
          onClick={onClose}
          aria-label="Fermer"
        />
      )}

      <div
        className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl z-10 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b">
          <h2 className="text-base font-bold text-gray-900">Traiter la demande Bedou</h2>
          {!processing && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">&times;</button>
          )}
        </div>

        <div className="p-5 space-y-4">
          {/* Infos demande */}
          <div className="p-3 rounded-xl bg-gray-50 border space-y-1.5 text-sm">
            <p className="font-bold text-gray-800">{request.user_nom || request.user_name}</p>
            <p className="text-xs text-gray-500">{request.user_email}</p>
            <div className="flex items-center justify-between mt-2">
              <div>
                <p className="text-xl font-extrabold text-primary">{montant.toLocaleString()} FCFA</p>
                {bonus > 0 && (
                  <p className="text-xs text-amber-600 font-semibold">🎁 + {bonus.toLocaleString()} F bonus = <strong>{totalCredit.toLocaleString()} F total</strong></p>
                )}
              </div>
              <div className="text-right text-xs text-gray-400">
                <p>{type === "recharge" ? "🔄 Recharge" : "💸 Retrait"}</p>
                <p>{request.methode_paiement || request.methode || "—"}</p>
                <p>{moment(request.created_date).format("DD/MM/YYYY HH:mm")}</p>
              </div>
            </div>
          </div>

          {/* Preuve paiement */}
          {type === "recharge" && preuveUrl && (
            <div
              className="rounded-xl overflow-hidden border-2 border-blue-200 cursor-pointer"
              onClick={() => window.open(preuveUrl, "_blank")}
            >
              <img
                src={preuveUrl}
                alt="Preuve de paiement"
                className="w-full max-h-44 object-contain bg-gray-50"
              />
              <div className="bg-blue-50 text-blue-700 text-xs py-1.5 text-center font-medium">
                🔍 Cliquer pour agrandir
              </div>
            </div>
          )}

          {/* Étape en cours */}
          {step && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-700 font-medium">
              {processing && step !== "✅ Validation réussie !" && (
                <span className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-600 rounded-full animate-spin flex-shrink-0" />
              )}
              {step}
            </div>
          )}

          {/* Erreur visible dans la fenêtre */}
          {errorMsg && (
            <div className="px-3 py-3 rounded-xl bg-red-50 border border-red-300 text-sm text-red-700 font-semibold">
              {errorMsg}
              <button
                className="block mt-2 text-xs text-red-500 underline"
                onClick={() => setErrorMsg(null)}
              >
                Effacer l'erreur et réessayer
              </button>
            </div>
          )}

          {/* Champ motif */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-600">Commentaire (obligatoire pour refus)</label>
            <Textarea
              placeholder="Motif de refus ou note interne..."
              value={comment}
              onChange={e => setComment(e.target.value)}
              rows={2}
              disabled={processing}
            />
          </div>

          {/* Boutons d'action */}
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onClose}
              disabled={processing}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={handleRefuser}
              disabled={processing || !comment.trim()}
            >
              {processing && step?.includes("Refus") ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Refus...
                </span>
              ) : "❌ Refuser"}
            </Button>
            <Button
              className="flex-[1.4] bg-green-600 hover:bg-green-700 text-white font-bold"
              onClick={handleValider}
              disabled={processing}
            >
              {processing && !step?.includes("Refus") ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Traitement...
                </span>
              ) : "✅ Valider"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}