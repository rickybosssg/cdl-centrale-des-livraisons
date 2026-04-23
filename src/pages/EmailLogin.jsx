import { useState, useEffect, useRef } from "react";
import { Loader2, Eye, EyeOff, Mail, Lock, Phone, ArrowLeft } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

const BLUE  = "#1877f2";
const GREEN = "#16a34a";

function saveToken(token) {
  try { localStorage.setItem("base44_access_token", token); } catch (_) {}
  try { base44.auth.setToken(token); } catch (_) {}
}

// ── Normalisation numéro Burkina Faso ──────────────────────────────────────
function formatPhoneDisplay(raw) {
  let n = raw.replace(/\D/g, "");
  if (n.startsWith("226")) n = n.slice(3);
  return n;
}

// ── Composant OTP Phone ────────────────────────────────────────────────────
function PhoneOtpFlow({ onSuccess, onBack }) {
  const [phoneLocal, setPhoneLocal] = useState("");
  const [otpStep, setOtpStep]       = useState("phone"); // "phone" | "otp"
  const [otp, setOtp]               = useState("");
  const [loading, setLoading]       = useState(false);
  const [message, setMessage]       = useState("");
  const [countdown, setCountdown]   = useState(0);
  const otpRef = useRef(null);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const fullPhone = "+226" + phoneLocal.replace(/\D/g, "");

  const sendOtp = async () => {
    const digits = phoneLocal.replace(/\D/g, "");
    if (digits.length < 8) { setMessage("Numéro invalide — 8 chiffres attendus"); return; }
    setLoading(true); setMessage("");
    try {
      const res = await base44.functions.invoke("phoneOtp", { action: "send", phone: fullPhone });
      if (res.data?.success) {
        setOtpStep("otp");
        setCountdown(60);
        setOtp("");
        setTimeout(() => otpRef.current?.focus(), 300);
      } else {
        setMessage(res.data?.error || "Impossible d'envoyer le SMS. Réessayez.");
      }
    } catch (err) {
      setMessage(err?.message || "Erreur réseau — réessayez.");
    } finally { setLoading(false); }
  };

  const verifyOtp = async () => {
    if (otp.length < 6) { setMessage("Saisissez les 6 chiffres du code"); return; }
    setLoading(true); setMessage("");
    try {
      const res = await base44.functions.invoke("phoneOtp", { action: "verify", phone: fullPhone, code: otp });
      if (res.data?.success && res.data?.access_token) {
        saveToken(res.data.access_token);
        onSuccess();
      } else {
        setMessage(res.data?.error || "Code incorrect ou expiré.");
        setOtp("");
      }
    } catch (err) {
      setMessage(err?.message || "Erreur vérification.");
    } finally { setLoading(false); }
  };

  return (
    <div style={{ width: "100%" }}>
      {/* Retour */}
      <button type="button" onClick={onBack} style={sp.backBtn}>
        <ArrowLeft size={14} style={{ marginRight: 4 }} /> Retour à la connexion
      </button>

      <h2 style={sp.title}>
        {otpStep === "phone" ? "Connexion par téléphone" : "Vérifier votre numéro"}
      </h2>

      {otpStep === "phone" && (
        <>
          <p style={sp.sub}>Numéro Burkina Faso (+226)</p>
          <div style={sp.phoneWrap}>
            <div style={sp.prefix}>🇧🇫 +226</div>
            <input
              style={sp.phoneInput}
              type="tel"
              inputMode="numeric"
              placeholder="07 XX XX XX"
              value={phoneLocal}
              maxLength={10}
              onChange={e => { setPhoneLocal(formatPhoneDisplay(e.target.value)); setMessage(""); }}
              onKeyDown={e => e.key === "Enter" && sendOtp()}
              autoComplete="tel-national"
            />
          </div>
          {message && <p style={sp.error}>{message}</p>}
          <button
            style={{ ...sp.btn, opacity: loading ? 0.7 : 1 }}
            onClick={sendOtp}
            disabled={loading}
            type="button"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" style={{ marginRight: 8 }} /> : null}
            {loading ? "Envoi en cours..." : "📲 Recevoir le code SMS"}
          </button>
        </>
      )}

      {otpStep === "otp" && (
        <>
          <p style={sp.sub}>
            Code envoyé au <strong>{fullPhone}</strong>
          </p>
          <p style={sp.sub2}>Saisissez le code à 6 chiffres reçu par SMS</p>
          <input
            ref={otpRef}
            style={sp.otpInput}
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
          {message && <p style={sp.error}>{message}</p>}
          <button
            style={{ ...sp.btn, opacity: loading ? 0.7 : 1 }}
            onClick={verifyOtp}
            disabled={loading || otp.length < 6}
            type="button"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" style={{ marginRight: 8 }} /> : null}
            {loading ? "Vérification..." : "✅ Valider le code"}
          </button>
          <button
            type="button"
            style={{ ...sp.resendBtn, opacity: countdown > 0 ? 0.5 : 1 }}
            disabled={countdown > 0}
            onClick={sendOtp}
          >
            {countdown > 0 ? `Renvoyer dans ${countdown}s` : "📩 Renvoyer le code"}
          </button>
          <button
            type="button"
            onClick={() => { setOtpStep("phone"); setOtp(""); setMessage(""); }}
            style={sp.changePhone}
          >
            Changer de numéro
          </button>
        </>
      )}
    </div>
  );
}

const sp = {
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
  changePhone: { display: "block", width: "100%", background: "none", border: "none", color: "#94a3b8", fontSize: "12px", cursor: "pointer", textDecoration: "underline", textAlign: "center", padding: "4px" },
};

export default function EmailLogin() {
  const { checkAppState } = useAuth();
  const [mode, setMode] = useState("login"); // "login" | "register" | "forgot" | "phone"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Gérer le retour OAuth token dans l'URL (Google redirect legacy)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("access_token") || params.get("token");
    if (token) {
      saveToken(token);
      window.history.replaceState({}, "", "/connexion");
      navigateHome();
    }
  }, []);

  const navigateHome = async () => {
    try { await checkAppState(); } catch (_) {}
    window.location.replace("/");
  };

  const handleLogin = async () => {
    if (!email || !password) { setMessage("Email et mot de passe requis"); return; }
    setLoading(true); setMessage("");
    try {
      const result = await base44.auth.loginViaEmailPassword(email.trim().toLowerCase(), password);
      const token = result?.access_token || result?.token;
      if (token) saveToken(token);
      await navigateHome();
    } catch (err) {
      const status = err?.status || err?.response?.status;
      setMessage(status === 401 || status === 400 || (err?.message || "").includes("credentials")
        ? "Email ou mot de passe incorrect"
        : "Erreur de connexion — réessayez");
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!email || !password) { setMessage("Email et mot de passe requis"); return; }
    if (password.length < 6) { setMessage("Mot de passe trop court (6 caractères minimum)"); return; }
    if (password !== confirmPassword) { setMessage("Les mots de passe ne correspondent pas"); return; }
    setLoading(true); setMessage("");
    try {
      const result = await base44.auth.register({ email: email.trim().toLowerCase(), password });
      const token = result?.access_token || result?.token;
      if (token) {
        saveToken(token);
        await navigateHome();
      } else {
        setSuccessMsg("Compte créé ! Vérifiez votre email puis connectez-vous.");
        setMode("login");
        setPassword(""); setConfirmPassword("");
        setLoading(false);
      }
    } catch (err) {
      const msg = err?.message || "";
      setMessage(msg.toLowerCase().includes("exist") || msg.toLowerCase().includes("already")
        ? "Un compte existe déjà avec cet email"
        : "Erreur lors de la création — réessayez");
      setLoading(false);
    }
  };

  const handleForgot = async () => {
    if (!email) { setMessage("Entrez votre adresse email"); return; }
    setLoading(true); setMessage("");
    try {
      await base44.auth.sendPasswordResetEmail(email.trim().toLowerCase());
      setSuccessMsg("Email de réinitialisation envoyé ! Vérifiez votre boîte mail.");
      setMode("login");
    } catch (_) {
      setMessage("Impossible d'envoyer l'email — vérifiez l'adresse");
    } finally { setLoading(false); }
  };

  const submit = mode === "login" ? handleLogin : mode === "register" ? handleRegister : handleForgot;

  return (
    <div style={s.container}>
      <div style={s.card}>

        {/* ── Mode téléphone OTP ── */}
        {mode === "phone" && (
          <PhoneOtpFlow
            onSuccess={navigateHome}
            onBack={() => { setMode("login"); setMessage(""); }}
          />
        )}

        {mode !== "phone" && (<>

        {/* Logo */}
        <div style={s.logoBox}>
          <img
            src="https://media.base44.com/images/public/69c3c74fc4b62396dca61751/1eb51398f_Screenshot_20260330_132434_WhatsApp.jpg"
            alt="CDL"
            style={s.logoImg}
            onError={e => { e.target.style.display = "none"; }}
          />
          <div style={s.logoText}>CDL</div>
          <p style={s.logoSub}>Centrale des Livraisons</p>
        </div>

        {/* Titre */}
        <h2 style={s.title}>
          {mode === "login" ? "Connexion"
            : mode === "register" ? "Créer un compte"
            : "Mot de passe oublié"}
        </h2>

        {/* Message succès */}
        {successMsg && <div style={s.successBox}>{successMsg}</div>}

        {/* Email */}
        <div style={s.fieldWrap}>
          <Mail size={16} style={s.fieldIcon} />
          <input
            style={s.input}
            type="email"
            placeholder="Adresse email"
            value={email}
            onChange={e => { setEmail(e.target.value); setMessage(""); }}
            onKeyDown={e => e.key === "Enter" && submit()}
            autoComplete="email"
            inputMode="email"
          />
        </div>

        {/* Mot de passe */}
        {mode !== "forgot" && (
          <div style={s.fieldWrap}>
            <Lock size={16} style={s.fieldIcon} />
            <input
              style={{ ...s.input, paddingRight: "44px" }}
              type={showPassword ? "text" : "password"}
              placeholder="Mot de passe"
              value={password}
              onChange={e => { setPassword(e.target.value); setMessage(""); }}
              onKeyDown={e => e.key === "Enter" && submit()}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
            />
            <button style={s.eyeBtn} type="button" onClick={() => setShowPassword(v => !v)}>
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        )}

        {/* Confirmation mot de passe (register) */}
        {mode === "register" && (
          <div style={s.fieldWrap}>
            <Lock size={16} style={s.fieldIcon} />
            <input
              style={s.input}
              type={showPassword ? "text" : "password"}
              placeholder="Confirmer le mot de passe"
              value={confirmPassword}
              onChange={e => { setConfirmPassword(e.target.value); setMessage(""); }}
              onKeyDown={e => e.key === "Enter" && submit()}
              autoComplete="new-password"
            />
          </div>
        )}

        {/* Erreur */}
        {message && <p style={s.error}>{message}</p>}

        {/* Bouton principal */}
        <button style={{ ...s.btn, opacity: loading ? 0.7 : 1 }} onClick={submit} disabled={loading}>
          {loading
            ? <><Loader2 className="h-4 w-4 animate-spin" style={{ marginRight: 8 }} />Connexion en cours...</>
            : mode === "login" ? "Se connecter"
            : mode === "register" ? "Créer mon compte"
            : "Envoyer le lien"}
        </button>

        {/* Mot de passe oublié */}
        {mode === "login" && (
          <button style={s.linkBtn} onClick={() => { setMode("forgot"); setMessage(""); setSuccessMsg(""); }}>
            Mot de passe oublié ?
          </button>
        )}

        {/* Toggle login ↔ register */}
        {mode === "login" ? (
          <div style={s.registerBox}>
            <span style={s.registerText}>Pas encore de compte ?</span>
            <button style={s.registerBtn} onClick={() => { setMode("register"); setMessage(""); setSuccessMsg(""); }}>
              Créer un compte →
            </button>
          </div>
        ) : (
          <div style={s.toggleRow}>
            <button style={s.toggleBtn} onClick={() => { setMode("login"); setMessage(""); setSuccessMsg(""); }}>
              ← Retour à la connexion
            </button>
          </div>
        )}

        {/* Séparateur + bouton téléphone */}
        {(mode === "login" || mode === "register") && (
          <>
            <div style={s.divider}>
              <div style={s.dividerLine} /><span style={s.dividerText}>ou</span><div style={s.dividerLine} />
            </div>
            <button
              type="button"
              style={s.phoneBtn}
              onClick={() => { setMode("phone"); setMessage(""); setSuccessMsg(""); }}
            >
              <Phone size={16} style={{ marginRight: 8, flexShrink: 0 }} />
              Continuer avec mon numéro de téléphone
            </button>
          </>
        )}

        </>)}
      </div>
    </div>
  );
}

const s = {
  container: {
    minHeight: "100vh",
    background: `linear-gradient(135deg, ${BLUE} 0%, #0d47a1 100%)`,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontFamily: "Inter, system-ui, sans-serif",
    padding: "24px 16px",
  },
  card: {
    background: "white",
    padding: "36px 28px 32px",
    borderRadius: "24px",
    width: "100%",
    maxWidth: "380px",
    textAlign: "center",
    boxShadow: "0 24px 64px rgba(0,0,0,0.28)",
  },
  logoBox: {
    marginBottom: "20px",
  },
  logoImg: {
    width: "72px",
    height: "72px",
    borderRadius: "18px",
    objectFit: "cover",
    marginBottom: "8px",
    display: "block",
    margin: "0 auto 8px",
  },
  logoText: {
    fontSize: "28px",
    fontWeight: "900",
    color: BLUE,
    letterSpacing: "3px",
  },
  logoSub: {
    fontSize: "12px",
    color: "#94a3b8",
    margin: "2px 0 0",
    fontWeight: "500",
  },
  title: {
    fontSize: "20px",
    fontWeight: "700",
    color: "#111",
    margin: "0 0 20px",
  },
  successBox: {
    background: "#f0fdf4",
    border: "1px solid #86efac",
    borderRadius: "10px",
    padding: "12px 14px",
    fontSize: "13px",
    color: "#15803d",
    marginBottom: "16px",
    textAlign: "left",
    lineHeight: "1.5",
  },
  fieldWrap: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    border: "2px solid #e2e8f0",
    borderRadius: "12px",
    background: "#f8fafc",
    marginBottom: "12px",
  },
  fieldIcon: {
    flexShrink: 0,
    margin: "0 10px 0 14px",
    color: "#94a3b8",
  },
  input: {
    flex: 1,
    padding: "14px 12px 14px 0",
    border: "none",
    background: "transparent",
    fontSize: "15px",
    color: "#111",
    outline: "none",
    width: "100%",
    minWidth: 0,
  },
  eyeBtn: {
    position: "absolute",
    right: "12px",
    background: "none",
    border: "none",
    color: "#94a3b8",
    cursor: "pointer",
    padding: "8px",
    display: "flex",
    alignItems: "center",
  },
  error: {
    color: "#dc2626",
    fontSize: "13px",
    marginBottom: "12px",
    fontWeight: "500",
    textAlign: "left",
    lineHeight: "1.4",
  },
  btn: {
    width: "100%",
    padding: "15px",
    marginBottom: "10px",
    background: BLUE,
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
    boxShadow: `0 4px 15px rgba(24,119,242,0.35)`,
    transition: "opacity 0.2s",
  },
  linkBtn: {
    background: "none",
    border: "none",
    color: BLUE,
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
    marginBottom: "12px",
    padding: "4px",
    textDecoration: "underline",
    display: "block",
    width: "100%",
    textAlign: "center",
  },
  toggleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    flexWrap: "wrap",
    marginTop: "4px",
  },
  toggleText: {
    fontSize: "13px",
    color: "#666",
  },
  toggleBtn: {
    background: "none",
    border: "none",
    color: BLUE,
    fontSize: "13px",
    fontWeight: "700",
    cursor: "pointer",
    padding: "4px",
    textDecoration: "underline",
  },
  divider: { display: "flex", alignItems: "center", gap: "10px", margin: "12px 0 10px" },
  dividerLine: { flex: 1, height: "1px", background: "#e2e8f0" },
  dividerText: { fontSize: "12px", color: "#94a3b8", fontWeight: "500", whiteSpace: "nowrap" },
  phoneBtn: {
    width: "100%",
    padding: "13px 16px",
    marginBottom: "8px",
    background: "#f8fafc",
    color: "#334155",
    border: "2px solid #e2e8f0",
    borderRadius: "14px",
    fontWeight: "600",
    fontSize: "14px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "border-color 0.2s",
  },
  registerBox: {
    marginTop: "8px",
    background: "linear-gradient(135deg, #16a34a 0%, #15803d 100%)",
    borderRadius: "14px",
    padding: "14px 18px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    boxShadow: "0 4px 12px rgba(22,163,74,0.25)",
  },
  registerText: {
    fontSize: "13px",
    color: "#dcfce7",
    fontWeight: "500",
  },
  registerBtn: {
    background: "white",
    border: "none",
    color: "#15803d",
    fontSize: "13px",
    fontWeight: "800",
    cursor: "pointer",
    padding: "8px 16px",
    borderRadius: "10px",
    whiteSpace: "nowrap",
    boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
  },
};