import { useState, useRef, useEffect } from "react";
import { Loader2, ArrowLeft } from "lucide-react";
import { appParams } from "@/lib/app-params";
import { base44 } from "@/api/base44Client";

// Avec capacitor.config server.url = https://cdl.base44.app, les URLs relatives fonctionnent.
// En fallback file://, on utilise l'URL absolue.
function getBaseUrl() {
  if (typeof window === 'undefined') return 'https://cdl.base44.app';
  if (window.location?.protocol === 'file:') return 'https://cdl.base44.app';
  return ''; // URLs relatives — fonctionne sur web ET APK avec server.url configuré
}

export default function PhoneAuth() {
  const [step, setStep] = useState("phone");
  const [digits, setDigits] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [message, setMessage] = useState("");
  const codeInputRef = useRef(null);
  // Fallback si champ OTP stylé ne répond pas sur Android
  const [useFallback, setUseFallback] = useState(false);
  const fallbackRef = useRef(null);
  const focusTriesRef = useRef(0);

  // Auto-focus champ OTP avec détection d'échec sur Android WebView
  useEffect(() => {
    if (step !== "code") return;
    focusTriesRef.current = 0;

    const tryFocus = () => {
      const el = useFallback ? fallbackRef.current : codeInputRef.current;
      if (!el) return;
      el.focus();
      setTimeout(() => {
        if (document.activeElement !== el) {
          focusTriesRef.current += 1;
          if (focusTriesRef.current >= 2 && !useFallback) {
            setUseFallback(true);
            setTimeout(() => fallbackRef.current?.focus(), 100);
          }
        }
      }, 300);
    };

    const t1 = setTimeout(tryFocus, 150);
    const t2 = setTimeout(tryFocus, 600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [step, useFallback]);

  // ── SEND OTP ──────────────────────────────────────────────────────────────
  const sendOTP = async () => {
    if (digits.length !== 8) {
      setMessage("Numéro incomplet (8 chiffres requis)");
      return;
    }

    setLoading(true);
    setMessage("");

    const appId = appParams?.appId;
    if (!appId || appId === 'MISSING_APP_ID') {
      setMessage("Erreur de configuration — contacter le support");
      setLoading(false);
      return;
    }

    const fullPhone = "+226" + digits;
    const url = `${getBaseUrl()}/api/apps/${appId}/functions/sendOTP`;

    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: fullPhone }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);

      const data = await res.json();
      console.log("[PhoneAuth] sendOTP:", res.status, JSON.stringify(data));

      if (data?.success === true) {
        setStep("code");
        setMessage("");
      } else {
        // Afficher l'erreur Twilio réelle si disponible
        const errMsg = data?.twilio_message || data?.error || "Erreur d'envoi — réessayez";
        const errCode = data?.twilio_error_code ? ` (code ${data.twilio_error_code})` : "";
        setMessage(errMsg + errCode);
      }
    } catch (err) {
      if (err?.name === "AbortError") {
        setMessage("⏱️ Délai dépassé — vérifiez votre connexion");
      } else {
        setMessage("❌ Erreur réseau: " + (err?.message || "inconnue"));
      }
    } finally {
      setLoading(false);
    }
  };

  // ── VERIFY OTP ────────────────────────────────────────────────────────────
  const verifyOTP = async (codeToVerify) => {
    const otp = codeToVerify || code;
    if (otp.length !== 6) {
      setMessage("Le code doit contenir 6 chiffres");
      return;
    }
    if (digits.length !== 8) {
      setMessage("Numéro invalide");
      setStep("phone");
      return;
    }

    setVerifying(true);
    setMessage("");

    const appId = appParams?.appId;
    if (!appId || appId === 'MISSING_APP_ID') {
      setMessage("Erreur de configuration");
      setVerifying(false);
      return;
    }

    const fullPhone = "+226" + digits;
    const url = `${getBaseUrl()}/api/apps/${appId}/functions/verifyOTPWithRedirect`;

    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: fullPhone, code: otp }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);

      const data = await res.json();
      console.log("[PhoneAuth] verifyOTP:", res.status, data?.success, data?.user_type);

      if (data?.success === true) {
        const { login_email, login_password, redirect_url } = data;
        setStep("loading");

        // Créer la session Base44
        let loginOk = false;
        if (login_email && login_password) {
          try {
            console.log("[PhoneAuth] 🔑 loginViaEmailPassword:", login_email);
            const result = await base44.auth.loginViaEmailPassword(login_email, login_password);
            const accessToken = result?.access_token || result?.token;
            if (accessToken) {
              try { localStorage.setItem("base44_access_token", accessToken); } catch (_) {}
              try { base44.auth.setToken(accessToken); } catch (_) {}
              loginOk = true;
              console.log("[PhoneAuth] ✅ Token persisté");
            } else {
              console.warn("[PhoneAuth] ⚠️ Aucun token:", JSON.stringify(result));
            }
          } catch (loginErr) {
            console.warn("[PhoneAuth] loginViaEmailPassword échoué:", loginErr?.message);
            // Tenter register si login échoue (compte pas encore créé côté auth)
            if (loginErr?.message?.includes('credentials') || loginErr?.status === 401 || loginErr?.status === 400) {
              try {
                console.log("[PhoneAuth] 🆕 Tentative register:", login_email);
                const regResult = await base44.auth.register({ email: login_email, password: login_password });
                const accessToken = regResult?.access_token || regResult?.token;
                if (accessToken) {
                  try { localStorage.setItem("base44_access_token", accessToken); } catch (_) {}
                  try { base44.auth.setToken(accessToken); } catch (_) {}
                  loginOk = true;
                  console.log("[PhoneAuth] ✅ Register + token persisté");
                }
              } catch (regErr) {
                console.error("[PhoneAuth] ❌ Register aussi échoué:", regErr?.message);
              }
            }
          }
        }

        if (!loginOk) {
          console.warn("[PhoneAuth] ⚠️ Session non créée — rechargement quand même");
        }

        const safeUrl = (redirect_url || "/").startsWith("/") ? redirect_url : "/";
        // Délai pour s'assurer que localStorage est propagé (APK Android WebView)
        setTimeout(() => { window.location.href = safeUrl; }, 1000);

      } else {
        const errorMsg = data?.error || "Code incorrect ou expiré";
        setMessage(errorMsg);
        setCode("");
        setTimeout(() => {
          const el = useFallback ? fallbackRef.current : codeInputRef.current;
          el?.focus();
        }, 100);
      }
    } catch (err) {
      if (err?.name === "AbortError") {
        setMessage("⏱️ Délai dépassé — réessayez");
      } else {
        setMessage("❌ Erreur: " + (err?.message || "inconnue"));
      }
      setCode("");
      setTimeout(() => {
        const el = useFallback ? fallbackRef.current : codeInputRef.current;
        el?.focus();
      }, 100);
    } finally {
      setVerifying(false);
    }
  };

  // ── LOADING SCREEN ────────────────────────────────────────────────────────
  if (step === "loading") {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.logo}>CDL</div>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "20px" }}>
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
          <p style={styles.subtitle}>Connexion en cours...</p>
        </div>
      </div>
    );
  }

  // ── PHONE SCREEN ──────────────────────────────────────────────────────────
  if (step === "phone") {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.logo}>CDL</div>
          <h2 style={styles.title}>Connexion</h2>
          <p style={styles.subtitle}>Entrez votre numéro Burkina</p>

          <div style={styles.phoneRow}>
            <span style={styles.prefix}>+226</span>
            <input
              style={styles.phoneInput}
              type="text"
              inputMode="numeric"
              placeholder="XX XX XX XX"
              value={digits}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "");
                setDigits(v.slice(0, 8));
              }}
              maxLength="8"
              onKeyDown={(e) => { if (e.key === "Enter" && digits.length === 8) sendOTP(); }}
            />
          </div>

          <button
            style={{ ...styles.btn, opacity: digits.length === 8 && !loading ? 1 : 0.6 }}
            onClick={sendOTP}
            disabled={loading || digits.length !== 8}
          >
            {loading
              ? <><Loader2 className="h-4 w-4 animate-spin" style={{ marginRight: 8 }} />Envoi...</>
              : "Recevoir le code SMS"}
          </button>

          {message && <p style={styles.error}>{message}</p>}
        </div>
      </div>
    );
  }

  // ── OTP SCREEN ────────────────────────────────────────────────────────────
  const handleCodeChange = (val) => {
    const v = val.replace(/\D/g, "").slice(0, 6);
    setCode(v);
    if (v.length === 6) {
      // Auto-soumettre après un court délai
      setTimeout(() => verifyOTP(v), 300);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <button
          onClick={() => { setStep("phone"); setCode(""); setMessage(""); }}
          style={styles.backBtn}
        >
          <ArrowLeft size={18} /> Modifier
        </button>

        <div style={styles.logo}>CDL</div>
        <h2 style={styles.title}>Code reçu ?</h2>
        <p style={styles.subtitle}>SMS envoyé au +226{digits}</p>

        {/* Champ OTP principal */}
        {!useFallback ? (
          <input
            ref={codeInputRef}
            style={styles.otpInput}
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="• • • • • •"
            maxLength="6"
            value={code}
            onChange={(e) => handleCodeChange(e.target.value)}
            autoComplete="one-time-code"
            enterKeyHint="done"
            onKeyDown={(e) => { if (e.key === "Enter" && code.length === 6) verifyOTP(); }}
          />
        ) : (
          <>
            <p style={{ fontSize: "11px", color: "#22c55e", marginBottom: "4px", fontWeight: 600 }}>
              ✅ Saisie alternative activée
            </p>
            <input
              ref={fallbackRef}
              style={styles.otpFallback}
              type="number"
              inputMode="numeric"
              placeholder="123456"
              value={code}
              onChange={(e) => handleCodeChange(String(e.target.value))}
              autoComplete="one-time-code"
            />
          </>
        )}

        {/* Lien de bascule manuelle */}
        {!useFallback && (
          <button
            style={styles.altLink}
            onClick={() => { setUseFallback(true); setCode(""); setTimeout(() => fallbackRef.current?.focus(), 100); }}
          >
            Le clavier ne s'ouvre pas ? Appuyez ici
          </button>
        )}

        <button
          style={{ ...styles.btn, opacity: code.length === 6 && !verifying ? 1 : 0.6 }}
          onClick={() => verifyOTP()}
          disabled={verifying || code.length !== 6}
        >
          {verifying
            ? <><Loader2 className="h-4 w-4 animate-spin" style={{ marginRight: 8 }} />Vérification...</>
            : "Valider le code"}
        </button>

        {/* Renvoyer le code */}
        <button
          style={styles.resendBtn}
          onClick={() => { setStep("phone"); setCode(""); setMessage(""); }}
        >
          Renvoyer un code
        </button>

        {message && <p style={styles.error}>{message}</p>}
      </div>
    </div>
  );
}

// Injection style placeholder
if (typeof document !== 'undefined' && !document.getElementById('phoneauth-style')) {
  const s = document.createElement('style');
  s.id = 'phoneauth-style';
  s.textContent = `
    input[type="tel"]::placeholder, input[type="text"]::placeholder,
    input[type="number"]::placeholder { color: #aaa !important; }
  `;
  document.head.appendChild(s);
}

const styles = {
  container: {
    minHeight: "100vh",
    background: "linear-gradient(160deg, #1a6bbf 0%, #0a3d7a 100%)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontFamily: "Inter, system-ui, sans-serif",
    padding: "24px 16px",
  },
  card: {
    background: "white",
    padding: "40px 28px 32px",
    borderRadius: "24px",
    width: "100%",
    maxWidth: "360px",
    textAlign: "center",
    boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
    position: "relative",
  },
  backBtn: {
    position: "absolute",
    top: "16px",
    left: "16px",
    background: "transparent",
    border: "none",
    color: "#1a6bbf",
    fontWeight: "600",
    cursor: "pointer",
    fontSize: "14px",
    display: "flex",
    alignItems: "center",
    gap: "4px",
    padding: "8px",
    borderRadius: "8px",
  },
  logo: {
    fontSize: "40px",
    fontWeight: "900",
    color: "#1a6bbf",
    letterSpacing: "3px",
    marginBottom: "8px",
  },
  title: {
    fontSize: "22px",
    fontWeight: "700",
    color: "#111",
    margin: "4px 0 6px",
  },
  subtitle: {
    fontSize: "13px",
    color: "#888",
    marginBottom: "24px",
  },
  phoneRow: {
    display: "flex",
    alignItems: "center",
    border: "2px solid #e2e8f0",
    borderRadius: "14px",
    background: "#f8fafc",
    marginBottom: "16px",
    overflow: "hidden",
  },
  prefix: {
    padding: "14px 10px 14px 16px",
    fontSize: "16px",
    fontWeight: "700",
    color: "#1a6bbf",
    whiteSpace: "nowrap",
    borderRight: "2px solid #e2e8f0",
  },
  phoneInput: {
    flex: 1,
    padding: "14px 12px",
    border: "none",
    background: "transparent",
    fontSize: "18px",
    fontFamily: "monospace",
    color: "#111",
    outline: "none",
    letterSpacing: "2px",
  },
  otpInput: {
    width: "100%",
    padding: "18px 10px",
    marginBottom: "8px",
    borderRadius: "16px",
    border: "2px solid #1a6bbf",
    fontSize: "34px",
    fontWeight: "700",
    letterSpacing: "12px",
    boxSizing: "border-box",
    fontFamily: "monospace",
    color: "#111",
    textAlign: "center",
    background: "#f0f7ff",
    outline: "none",
    pointerEvents: "auto",
    touchAction: "manipulation",
    WebkitUserSelect: "text",
    userSelect: "text",
    cursor: "text",
    display: "block",
  },
  otpFallback: {
    width: "100%",
    padding: "18px 10px",
    marginBottom: "8px",
    borderRadius: "14px",
    border: "3px solid #22c55e",
    fontSize: "28px",
    fontWeight: "700",
    letterSpacing: "8px",
    boxSizing: "border-box",
    fontFamily: "monospace",
    color: "#111",
    textAlign: "center",
    background: "#f0fff4",
    outline: "none",
    display: "block",
  },
  altLink: {
    background: "none",
    border: "none",
    color: "#aaa",
    fontSize: "11px",
    cursor: "pointer",
    textDecoration: "underline",
    marginBottom: "14px",
    padding: "4px",
  },
  btn: {
    width: "100%",
    padding: "15px",
    marginBottom: "10px",
    background: "linear-gradient(135deg, #1a6bbf, #0a3d7a)",
    color: "white",
    border: "none",
    borderRadius: "14px",
    fontWeight: "700",
    fontSize: "16px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    boxShadow: "0 4px 15px rgba(26,107,191,0.3)",
    transition: "opacity 0.2s",
  },
  resendBtn: {
    background: "none",
    border: "none",
    color: "#1a6bbf",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
    marginBottom: "8px",
    padding: "4px",
    textDecoration: "underline",
  },
  error: {
    color: "#dc2626",
    fontSize: "13px",
    marginTop: "10px",
    fontWeight: "500",
    lineHeight: "1.4",
  },
};