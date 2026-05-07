/**
 * BedouValidationDialog — Dialog isolé pour valider/refuser une demande Bedou
 * Utilise adminValidateBedouRecharge — auth email-only, sans dépendance au rôle JWT
 */
import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import moment from "moment";

// Appel unique via SDK — aucun fallback fetch, aucun passage par validateBedouRequest
async function callAdminValidate(payload) {
  console.log('[ADMIN_VALIDATE_CALL]', {
    method_used: 'base44.functions.invoke',
    fallback_fetch_used: false,
    function_called: 'adminValidateBedouRecharge',
    payload,
  });

  const res = await base44.functions.invoke('adminValidateBedouRecharge', payload);
  const data = res?.data ?? res;

  console.log('[ADMIN_VALIDATE_RESPONSE]', {
    method_used: 'base44.functions.invoke',
    fallback_fetch_used: false,
    function_called: 'adminValidateBedouRecharge',
    backend_status: 200,
    notification_sent: data?.notification_client_sent ?? false,
    data,
  });

  return data;
}

export default function BedouValidationDialog({ request, onClose, onSuccess }) {
  const [comment, setComment] = useState(request.motif_refus || "");
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [step, setStep] = useState(null);
  const [diag, setDiag] = useState(null); // diagnostic affiché dans l'UI

  const montant = request.montant || 0;
  const bonus = request.bonus || 0;
  const totalCredit = request.montant_total || (montant + bonus);
  const type = request.type || "recharge";
  const preuveUrl = request.preuve_paiement_url || request.preuve_paiement;

  const handleValider = async () => {
    if (processing) return;
    if (request.statut !== "en_attente") {
      toast.error("Cette demande a déjà été traitée.");
      onClose();
      return;
    }

    console.log('[VALIDATE_START]', {
      requestId: request.id,
      idDefined: !!request.id,
      userEmail: request.user_email,
      statut: request.statut,
      method_used: 'base44.functions.invoke',
    });

    setProcessing(true);
    setErrorMsg(null);
    setStep("⏳ Traitement en cours...");

    const diagState = {
      method_used: 'base44.functions.invoke',
      fallback_fetch_used: false,
      function_called: 'adminValidateBedouRecharge',
      request_id: request.id || 'UNDEFINED',
      api_called: false,
      backend_status: null,
      backend_response: null,
      notification_sent: null,
    };
    setDiag({ ...diagState });

    try {
      diagState.api_called = true;
      setDiag({ ...diagState });
      // Récupérer le mot de passe admin stocké localement (saisi à la connexion)
      const adminPwd = localStorage.getItem('cdl_admin_pwd') || localStorage.getItem('cdl_session_pwd') || '';
      const data = await callAdminValidate({
        request_id: request.id,
        action: 'validate',
        comment: comment.trim() || '',
        admin_secret: adminPwd,
      });
      diagState.backend_status = 200;
      diagState.backend_response = JSON.stringify(data).slice(0, 200);
      diagState.notification_sent = data?.notification_client_sent ?? false;
      setDiag({ ...diagState });

      if (data?.already_processed) {
        toast.warning("⚠️ Demande déjà traitée.");
        onSuccess();
        return;
      }

      const notifIcon = data.notification_client_sent ? `✅ push` : "⚠️ sans push";
      toast.success(`✅ Recharge validée ! ${(data.montant_credite || totalCredit).toLocaleString()} F CFA crédités — ${notifIcon}`, { duration: 5000 });
      setStep("✅ Validée !");
      // Log diagnostic refresh
      console.log('[BEDOU_REFRESH_CHECK]', {
        solde_bdd: data.nouveau_solde,
        montant_credite: data.montant_credite,
        refresh_forced: true,
        subscription_triggered: 'pending',
        note: 'onSuccess() forcera un reload bedouEngine.get_bedou dans MonBedou',
      });
      setTimeout(() => onSuccess(), 400);

    } catch (err) {
      diagState.backend_status = err?.status || 'ERR';
      diagState.backend_response = err?.message || 'Erreur inconnue';
      diagState.notification_sent = false;
      setDiag({ ...diagState });
      console.log('[VALIDATE_ERROR]', { message: err?.message, status: err?.status });
      const status = err?.status;
      let msg = err?.message || "Erreur inconnue";

      if (status === 409 || err?.data?.already_processed) {
        toast.warning("⚠️ Demande déjà traitée.");
        onSuccess();
        return;
      }
      if (status === 401) msg = "Session expirée — reconnectez-vous.";
      if (status === 403) msg = "Accès refusé — vérifiez votre session.";

      setErrorMsg(`❌ ${msg}`);
      toast.error(`Erreur : ${msg}`);
      setProcessing(false);
      setStep(null);
    }
  };

  const handleRefuser = async () => {
    if (!comment.trim()) { toast.error("Veuillez indiquer un motif de refus"); return; }
    if (processing) return;

    setProcessing(true);
    setErrorMsg(null);
    setStep("⏳ Refus en cours...");

    try {
      const adminPwd = localStorage.getItem('cdl_admin_pwd') || localStorage.getItem('cdl_session_pwd') || '';
      const data = await callAdminValidate({
        request_id: request.id,
        action: 'refuse',
        comment: comment.trim(),
        admin_secret: adminPwd,
      });

      if (data?.already_processed) {
        toast.warning("⚠️ Demande déjà traitée.");
        onSuccess();
        return;
      }

      toast.success("Demande refusée — client notifié");
      setTimeout(() => onSuccess(), 300);

    } catch (err) {
      console.log('[REFUSE_ERROR]', { message: err?.message, status: err?.status });
      const msg = err?.message || "Erreur inconnue";
      setErrorMsg(`❌ ${msg}`);
      toast.error("Erreur refus : " + msg);
      setProcessing(false);
      setStep(null);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0,
        width: '100vw', height: '100vh',
        zIndex: 99999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        padding: '16px', overflowY: 'auto',
      }}
    >
      {!processing && (
        <div style={{ position: 'absolute', inset: 0 }} onClick={onClose} />
      )}

      <div
        style={{
          position: 'relative', width: '100%', maxWidth: '448px',
          background: '#fff', borderRadius: '20px',
          boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
          maxHeight: '90vh', overflowY: 'auto', zIndex: 10, flexShrink: 0,
        }}
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
                  <p className="text-xs text-amber-600 font-semibold">
                    🎁 + {bonus.toLocaleString()} F bonus = <strong>{totalCredit.toLocaleString()} F total</strong>
                  </p>
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
              <img src={preuveUrl} alt="Preuve" className="w-full max-h-44 object-contain bg-gray-50" />
              <div className="bg-blue-50 text-blue-700 text-xs py-1.5 text-center font-medium">
                🔍 Cliquer pour agrandir
              </div>
            </div>
          )}

          {/* Étape en cours */}
          {step && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-700 font-medium">
              {processing && !step.includes("✅") && (
                <span className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-600 rounded-full animate-spin flex-shrink-0" />
              )}
              {step}
            </div>
          )}

          {/* Erreur */}
          {errorMsg && (
            <div className="px-3 py-3 rounded-xl bg-red-50 border border-red-300 text-sm text-red-700 font-semibold">
              {errorMsg}
              <button className="block mt-2 text-xs text-red-500 underline" onClick={() => setErrorMsg(null)}>
                Effacer et réessayer
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

          {/* ── BLOC DIAGNOSTIC ── */}
          {diag && (
            <div style={{ background: '#0f172a', borderRadius: '10px', padding: '10px 12px', fontSize: '11px', fontFamily: 'monospace', color: '#94a3b8', lineHeight: '1.8' }}>
              <p style={{ color: '#f8fafc', fontWeight: 'bold', marginBottom: '4px' }}>🔍 DIAGNOSTIC</p>
              <p><span style={{ color: '#64748b' }}>method_used = </span><span style={{ color: '#4ade80' }}>{diag.method_used}</span></p>
              <p><span style={{ color: '#64748b' }}>fallback_fetch_used = </span><span style={{ color: diag.fallback_fetch_used ? '#ef4444' : '#4ade80' }}>{String(diag.fallback_fetch_used)}</span></p>
              <p><span style={{ color: '#64748b' }}>function_called = </span><span style={{ color: '#4ade80' }}>{diag.function_called}</span></p>
              <p><span style={{ color: '#64748b' }}>request_id = </span><span style={{ color: diag.request_id === 'UNDEFINED' ? '#ef4444' : '#4ade80' }}>{diag.request_id}</span></p>
              <p><span style={{ color: '#64748b' }}>api_called = </span><span style={{ color: diag.api_called ? '#4ade80' : '#f59e0b' }}>{String(diag.api_called)}</span></p>
              <p><span style={{ color: '#64748b' }}>backend_status = </span><span style={{ color: diag.backend_status === 200 ? '#4ade80' : '#ef4444' }}>{diag.backend_status ?? '...'}</span></p>
              <p><span style={{ color: '#64748b' }}>notification_sent = </span><span style={{ color: diag.notification_sent ? '#4ade80' : '#f59e0b' }}>{diag.notification_sent == null ? '...' : String(diag.notification_sent)}</span></p>
              <p style={{ wordBreak: 'break-all' }}><span style={{ color: '#64748b' }}>backend_response = </span><span style={{ color: '#e2e8f0' }}>{diag.backend_response ?? '...'}</span></p>
            </div>
          )}

          {/* Boutons */}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={processing}>
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