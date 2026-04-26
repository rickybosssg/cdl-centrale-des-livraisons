/**
 * PhoneOtpFlow — Flux complet connexion/inscription par OTP
 *
 * Étapes :
 *  1. Saisie du numéro + envoi OTP
 *  2. Vérification code OTP
 *  3. (nouvel utilisateur) Écran code promo commercial
 *  → Si existant : onSuccess() directement
 *  → Si nouveau  : stocke le numéro + code promo, onNewUser() → RoleSetup
 */
import { useState, useEffect, useRef } from "react";
import { Loader2, ArrowLeft } from "lucide-react";
import { base44 } from "@/api/base44Client";

const BLUE = "#1877f2";
// AppID hardcodé — identique à VITE_BASE44_APP_ID, requis pour appels non-authentifiés depuis APK
const APP_ID = "69c3c74fc4b62396dca61751";

function saveToken(token) {
  try { localStorage.setItem("base44_access_token", token); } catch (_) {}
  try { base44.auth.setToken(token); } catch (_) {}
}

// Appelle une fonction backend SANS authentification (user non connecté)
// Évite le 403 que base44.functions.invoke() génère quand pas de session
async function callPublicFunction(name, payload) {
  const url = `https://cdl.base44.app/api/apps/${APP_ID}/functions/${name}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Erreur ${res.status}`);
  return data;
}

function formatPhoneDisplay(raw) {
  let n = raw.replace(/\D/g, "");
  if (n.startsWith("226")) n = n.slice(3);
  return n;
}

export default function PhoneOtpFlow({ onSuccess, onNewUser, onBack }) {
  const [step, setStep]           = useState("phone"); // "phone" | "otp" | "promo"
  const [phoneLocal, setPhoneLocal] = useState("");
  const [otp, setOtp]             = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [promoStatus, setPromoStatus] = useState(null); // null | "valid" | "invalid"
  const [promoData, setPromoData] = useState(null);
  const [checkingPromo, setCheckingPromo] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [message, setMessage]     = useState("");
  const [countdown, setCountdown] = useState(0);
  const otpRef = useRef(null);

  // Pré-remplir depuis localStorage si code promo URL détecté
  useEffect(() => {
    const saved = localStorage.getItem("cdl_promo_code");
    if (saved) setPromoCode(saved);
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const fullPhone = "+226" + phoneLocal.replace(/\D/g, "");

  // ── Étape 1 : envoi OTP ──────────────────────────────────────────────────
  const sendOtp = async () => {
    const digits = phoneLocal.replace(/\D/g, "");
    if (digits.length < 8) { setMessage("Numéro invalide — 8 chiffres attendus"); return; }
    setLoading(true); setMessage("");
    try {
      const data = await callPublicFunction("phoneOtp", { action: "send", phone: fullPhone });
      if (data?.success) {
        setStep("otp");
        setCountdown(60);
        setOtp("");
        setTimeout(() => otpRef.current?.focus(), 300);
      } else {
        setMessage(data?.error || "Impossible d'envoyer le SMS. Réessayez.");
      }
    } catch (err) {
      setMessage(err?.message || "Erreur réseau — réessayez.");
    } finally { setLoading(false); }
  };

  // ── Étape 2 : vérification OTP ───────────────────────────────────────────
  const verifyOtp = async () => {
    if (otp.length < 6) { setMessage("Saisissez les 6 chiffres du code"); return; }
    setLoading(true); setMessage("");
    try {
      const d = await callPublicFunction("phoneOtp", { action: "verify", phone: fullPhone, code: otp });
      if (d?.success && d?.access_token) {
        saveToken(d.access_token);
        localStorage.setItem("cdl_verified_phone", fullPhone);
        if (d.is_new_user) {
          setStep("promo");
        } else {
          onSuccess();
        }
      } else {
        setMessage(d?.error || "Code incorrect ou expiré.");
        setOtp("");
      }
    } catch (err) {
      setMessage(err?.message || "Erreur vérification.");
    } finally { setLoading(false); }
  };

  // ── Étape 3 : vérification code promo ───────────────────────────────────
  const checkPromo = async () => {
    if (!promoCode.trim()) return;
    setCheckingPromo(true);
    try {
      const codes = await base44.entities.CodePromo.filter({ code: promoCode.trim().toUpperCase(), statut: "valide", actif: true });
      if (codes.length > 0) {
        setPromoData(codes[0]);
        setPromoStatus("valid");
      } else {
        setPromoStatus("invalid");
      }
    } catch (_) {
      setPromoStatus("invalid");
    } finally { setCheckingPromo(false); }
  };

  const continueToRoleSetup = () => {
    // Sauvegarder le code promo validé si applicable
    if (promoStatus === "valid" && promoData) {
      localStorage.setItem("cdl_promo_code", promoData.code);
    } else {
      localStorage.removeItem("cdl_promo_code");
    }
    onNewUser();
  };

  // ── RENDU ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ width: "100%" }}>

      {/* ─── ÉTAPE NUMÉRO ─── */}
      {step === "phone" && (
        <>
          <button type="button" onClick={onBack} style={s.backBtn}>
            <ArrowLeft size={14} style={{ marginRight: 4 }} /> Retour à la connexion
          </button>
          <h2 style={s.title}>Connexion par téléphone</h2>
          <p style={s.sub}>Numéro Burkina Faso (+226)</p>
          <div style={s.phoneWrap}>
            <div style={s.prefix}>🇧🇫 +226</div>
            <input
              style={s.phoneInput}
              type="tel"
              inputMode="numeric"
              placeholder="XX XX XX XX"
              value={phoneLocal}
              maxLength={10}
              onChange={e => { setPhoneLocal(formatPhoneDisplay(e.target.value)); setMessage(""); }}
              onKeyDown={e => e.key === "Enter" && sendOtp()}
              autoComplete="tel-national"
            />
          </div>
          {message && <p style={s.error}>{message}</p>}
          <button style={{ ...s.btn, opacity: loading ? 0.7 : 1 }} onClick={sendOtp} disabled={loading} type="button">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" style={{ marginRight: 8 }} /> : null}
            {loading ? "Envoi en cours..." : "📲 Recevoir le code SMS"}
          </button>
        </>
      )}

      {/* ─── ÉTAPE OTP ─── */}
      {step === "otp" && (
        <>
          <button type="button" onClick={() => { setStep("phone"); setOtp(""); setMessage(""); }} style={s.backBtn}>
            <ArrowLeft size={14} style={{ marginRight: 4 }} /> Changer de numéro
          </button>
          <h2 style={s.title}>Vérifier votre numéro</h2>
          <p style={s.sub}>Code envoyé au <strong>{fullPhone}</strong></p>
          <p style={s.sub2}>Saisissez le code à 6 chiffres reçu par SMS</p>
          <input
            ref={otpRef}
            style={s.otpInput}
            type="tel"
            inputMode="numeric"
            maxLength={6}
            placeholder="• • • • • •"
            value={otp}
            onChange={e => { setOtp(e.target.value.replace(/\D/g, "")); setMessage(""); }}
            onKeyDown={e => e.key === "Enter" && verifyOtp()}
            autoComplete="one-time-code"
            autoFocus
          />
          {message && <p style={s.error}>{message}</p>}
          <button style={{ ...s.btn, opacity: loading || otp.length < 6 ? 0.7 : 1 }} onClick={verifyOtp} disabled={loading || otp.length < 6} type="button">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" style={{ marginRight: 8 }} /> : null}
            {loading ? "Vérification..." : "✅ Valider le code"}
          </button>
          <button type="button" style={{ ...s.resendBtn, opacity: countdown > 0 ? 0.5 : 1 }} disabled={countdown > 0} onClick={sendOtp}>
            {countdown > 0 ? `Renvoyer dans ${countdown}s` : "📩 Renvoyer le code"}
          </button>
        </>
      )}

      {/* ─── ÉTAPE CODE PROMO ─── */}
      {step === "promo" && (
        <>
          <div style={s.promoHeader}>
            <div style={{ fontSize: "40px", marginBottom: "8px" }}>🎁</div>
            <h2 style={s.title}>Bienvenue sur CDL !</h2>
            <p style={s.sub}>Avez-vous un code promo d'un commercial CDL ?</p>
          </div>

          {promoStatus === "valid" ? (
            <div style={s.promoSuccess}>
              <p style={{ fontWeight: "700", color: "#15803d", fontSize: "14px" }}>
                ✅ Code <strong>{promoData?.code}</strong> appliqué !
              </p>
              <p style={{ fontSize: "12px", color: "#166534", marginTop: "4px" }}>
                🎉 -15% sur votre 1ère course activé
              </p>
              <button
                type="button"
                onClick={() => { setPromoStatus(null); setPromoData(null); setPromoCode(""); }}
                style={{ fontSize: "11px", color: "#dc2626", background: "none", border: "none", cursor: "pointer", marginTop: "6px" }}
              >
                Retirer le code
              </button>
            </div>
          ) : (
            <>
              <div style={s.promoInputRow}>
                <input
                  style={s.promoInput}
                  type="text"
                  placeholder="Ex: COMMERCIAL123"
                  value={promoCode}
                  onChange={e => { setPromoCode(e.target.value.toUpperCase()); setPromoStatus(null); }}
                  onKeyDown={e => e.key === "Enter" && checkPromo()}
                />
                <button
                  type="button"
                  style={{ ...s.promoOkBtn, opacity: checkingPromo || !promoCode.trim() ? 0.6 : 1 }}
                  onClick={checkPromo}
                  disabled={checkingPromo || !promoCode.trim()}
                >
                  {checkingPromo ? "..." : "OK"}
                </button>
              </div>
              {promoStatus === "invalid" && (
                <p style={s.error}>Code invalide ou non actif. Vous pouvez continuer sans code.</p>
              )}
            </>
          )}

          <button style={{ ...s.btn, marginTop: "20px" }} onClick={continueToRoleSetup} type="button">
            {promoStatus === "valid" ? "Continuer avec le code →" : "Continuer sans code →"}
          </button>
          <p style={{ fontSize: "11px", color: "#94a3b8", textAlign: "center", marginTop: "8px" }}>
            Le code promo est totalement facultatif
          </p>
        </>
      )}
    </div>
  );
}

const s = {
  backBtn: { display: "flex", alignItems: "center", background: "none", border: "none", color: "#94a3b8", fontSize: "12px", cursor: "pointer", marginBottom: "14px", padding: 0 },
  title: { fontSize: "18px", fontWeight: "700", color: "#111", margin: "0 0 6px", textAlign: "center" },
  sub: { fontSize: "12px", color: "#64748b", textAlign: "center", margin: "0 0 12px" },
  sub2: { fontSize: "12px", color: "#64748b", textAlign: "center", margin: "0 0 16px" },
  phoneWrap: { display: "flex", alignItems: "center", border: "2px solid #e2e8f0", borderRadius: "12px", background: "#f8fafc", marginBottom: "12px", overflow: "hidden" },
  prefix: { padding: "14px 12px", background: "#f1f5f9", borderRight: "2px solid #e2e8f0", fontSize: "14px", fontWeight: "600", color: "#334155", flexShrink: 0 },
  phoneInput: { flex: 1, padding: "14px 12px", border: "none", background: "transparent", fontSize: "18px", color: "#111", outline: "none", letterSpacing: "2px", fontWeight: "600" },
  otpInput: { width: "100%", padding: "18px", border: "2px solid #e2e8f0", borderRadius: "14px", background: "#f8fafc", fontSize: "28px", color: "#111", outline: "none", textAlign: "center", letterSpacing: "10px", fontWeight: "700", boxSizing: "border-box", marginBottom: "12px" },
  btn: { width: "100%", padding: "15px", marginBottom: "10px", background: BLUE, color: "white", border: "none", borderRadius: "14px", fontWeight: "700", fontSize: "15px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 15px rgba(24,119,242,0.35)" },
  error: { color: "#dc2626", fontSize: "13px", marginBottom: "12px", fontWeight: "500", textAlign: "left" },
  resendBtn: { width: "100%", padding: "10px", background: "none", border: "2px solid #e2e8f0", borderRadius: "12px", color: "#475569", fontSize: "13px", fontWeight: "600", cursor: "pointer", marginBottom: "8px" },
  promoHeader: { textAlign: "center", marginBottom: "16px" },
  promoInputRow: { display: "flex", gap: "8px", marginBottom: "8px" },
  promoInput: { flex: 1, padding: "13px 14px", border: "2px solid #e2e8f0", borderRadius: "12px", background: "#f8fafc", fontSize: "15px", color: "#111", outline: "none", fontWeight: "600", letterSpacing: "1px" },
  promoOkBtn: { padding: "13px 18px", background: BLUE, color: "white", border: "none", borderRadius: "12px", fontWeight: "700", fontSize: "14px", cursor: "pointer" },
  promoSuccess: { background: "#f0fdf4", border: "1px solid #86efac", borderRadius: "12px", padding: "14px 16px", textAlign: "center", marginBottom: "4px" },
};