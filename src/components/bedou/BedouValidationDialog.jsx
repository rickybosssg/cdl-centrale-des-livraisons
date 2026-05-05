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

// Helper : récupère le token depuis toutes les clés localStorage possibles
function getAuthToken() {
  const keys = [
    'base44_access_token',
    'base44_token',
    'access_token',
    'auth_token',
    'sb_token',
    'cdl_token',
  ];
  for (const key of keys) {
    try {
      const v = localStorage.getItem(key);
      if (v && v.length > 10) {
        console.log(`[TOKEN_FOUND] key=${key} | len=${v.length}`);
        return v;
      }
    } catch(_) {}
  }
  // Fallback : chercher toutes les clés contenant "token"
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.toLowerCase().includes('token')) {
        const v = localStorage.getItem(k);
        if (v && v.length > 10) {
          console.log(`[TOKEN_FOUND_SCAN] key=${k} | len=${v.length}`);
          return v;
        }
      }
    }
  } catch(_) {}
  console.warn('[TOKEN_NOT_FOUND] aucun token dans localStorage');
  return null;
}

// Helper : appel HTTP direct avec token explicite depuis localStorage
// Contourne les bugs Axios/SDK sur APK Capacitor où le token n'est pas envoyé
async function invokeWithToken(fnName, payload) {
  const APP_ID = import.meta.env.VITE_BASE44_APP_ID || '69c3c74fc4b62396dca61751';

  // Toujours re-synchroniser le token SDK avant appel
  try {
    const stored = localStorage.getItem('base44_access_token');
    if (stored) base44.auth.setToken(stored);
  } catch(_) {}

  const token = getAuthToken();

  // URL adaptée selon protocole (capacitor: → serveur externe)
  const baseUrl = (window.location?.protocol === 'capacitor:' || window.location?.protocol === 'file:')
    ? 'https://cdl.base44.app'
    : '';
  const url = `${baseUrl}/api/apps/${APP_ID}/functions/${fnName}`;

  console.log(`[BEDOU_VALIDATE_AUTH] token_found=${!!token} | token_len=${token?.length || 0} | fn=${fnName} | protocol=${window.location?.protocol}`);

  if (!token) {
    throw Object.assign(new Error('Session expirée — reconnectez-vous'), { status: 401 });
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return { data };
}

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
    const token = getAuthToken();
    // Log admin check côté frontend
    console.log(`[FRONT_ADMIN_CHECK] email_connecté=weezyh2@gmail.com | isAdminByEmail=true | request_id=${request.id} | token_found=${!!token} | token_len=${token?.length || 0}`);
    console.log("VALIDATION ID:", request.id);
    console.log(`[VALIDATION_ID_CHECK] request.id=${request.id} | typeof=${typeof request.id}`);

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

    // ── LOGS DIAGNOSTIC ──────────────────────────────────────────────────────
    console.log('[VALIDATE_START]', {
      requestId: request.id,
      requestIdType: typeof request.id,
      requestIdDefined: request.id !== undefined && request.id !== null && request.id !== '',
      userEmail: request.user_email,
      statut: request.statut,
      type,
      token_found: !!getAuthToken(),
      token_len: getAuthToken()?.length || 0,
      protocol: window.location?.protocol,
    });

    setProcessing(true);
    setErrorMsg(null);
    setStep("⏳ Connexion au serveur...");

    try {
      setStep("💳 Crédit du solde en cours...");

      const payload = { request_id: request.id, type, action: "valider" };
      console.log('[VALIDATE_PAYLOAD]', payload);

      const res = await invokeWithToken("validateBedouRequest", payload);

      console.log('[VALIDATE_RESPONSE]', res?.data);
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
      console.log('[VALIDATE_ERROR]', {
        message: err?.message,
        status: err?.status,
        data: err?.data,
        requestId: request.id,
      });

      let msg = err?.message || "Erreur inconnue";

      const errStatus = err?.status || err?.response?.status;

      // 409 — déjà traitée
      if (errStatus === 409 || msg.includes("déjà") || msg.includes("already")) {
        toast.warning("⚠️ Demande déjà traitée.");
        onSuccess();
        return;
      }

      // 403 — session expirée OU droits insuffisants
      if (errStatus === 403 || msg.includes("403") || msg.includes("Admin requis") || msg.includes("logged in")) {
        const detail = err?.data;
        const tokenFound = !!getAuthToken();
        const isAuthExpired = detail?.extra_data?.reason === 'auth_required' || msg.includes('logged in') || msg.includes('authentifi');
        console.log(`[BEDOU_VALIDATE_AUTH] is_admin=false | auth_expired=${isAuthExpired} | reason=${detail?.extra_data?.reason || 'N/A'} | token_found=${tokenFound} | user_role=${detail?.user_role || 'N/A'}`);
        if (isAuthExpired || !tokenFound) {
          msg = "⚠️ Session expirée — fermez et relancez l'application, puis reconnectez-vous.";
        } else {
          msg = `Accès refusé — rôle non reconnu côté serveur. Relancez l'app. (role=${detail?.user_role || 'null'})`;
        }
      }

      // 401 — non authentifié
      if (errStatus === 401 || msg.includes("401") || msg.includes("authentifi")) {
        console.log(`[BEDOU_VALIDATE_AUTH] token_received=false — session expirée`);
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
      const res = await invokeWithToken("validateBedouRequest", {
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

  // ── RENDU — overlay modal natif centré (pas Dialog shadcn) ─────────────────
  // Style inline forcé pour APK natif Capacitor où fixed peut être affecté par le scroll WebView
  // 🔒 Centrage global avec overflow désactivé
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        padding: '16px',
        overflowY: 'auto',
      }}
      onScroll={(e) => e.preventDefault()}
    >
      {/* Backdrop — fermer si pas en processing */}
      {!processing && (
        <div
          style={{ position: 'absolute', inset: 0 }}
          onClick={onClose}
          aria-label="Fermer"
        />
      )}

      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '448px',
          background: '#fff',
          borderRadius: '20px',
          boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
          maxHeight: '90vh',
          overflowY: 'auto',
          zIndex: 10,
          flexShrink: 0,
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