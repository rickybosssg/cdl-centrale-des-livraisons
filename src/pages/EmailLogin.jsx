import { useState, useEffect } from "react";
import { Loader2, Eye, EyeOff, Mail, Lock } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

const BLUE = "#1877f2";
const APP_ID = "69c3c74fc4b62396dca61751";
const AUTH_BASE = `https://cdl.base44.app/api/apps/${APP_ID}/auth`;

function saveToken(token) {
  try { localStorage.setItem("base44_access_token", token); } catch (_) {}
  try { base44.auth.setToken(token); } catch (_) {}
}

async function authFetch(endpoint, body) {
  const res = await fetch(`${AUTH_BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

export default function EmailLogin() {
  const { checkAppState } = useAuth();
  const [mode, setMode] = useState("login"); // "login" | "register" | "forgot"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const navigateHome = async () => {
    try { await checkAppState(); } catch (_) {}
    window.location.replace("/");
  };

  const handleLogin = async () => {
    if (!email || !password) { setMessage("Email et mot de passe requis"); return; }
    setLoading(true); setMessage("");
    try {
      const { ok, status, data } = await authFetch("/login", {
        email: email.trim().toLowerCase(),
        password,
      });
      const token = data?.access_token || data?.token;
      if (ok && token) {
        saveToken(token);
        await navigateHome();
      } else {
        setMessage(status === 401 || status === 400
          ? "Email ou mot de passe incorrect"
          : (data?.error || data?.detail || "Erreur de connexion — réessayez"));
        setLoading(false);
      }
    } catch (err) {
      setMessage("Erreur réseau — vérifiez votre connexion");
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!email || !password) { setMessage("Email et mot de passe requis"); return; }
    if (password.length < 6) { setMessage("Mot de passe trop court (6 caractères minimum)"); return; }
    if (password !== confirmPassword) { setMessage("Les mots de passe ne correspondent pas"); return; }
    setLoading(true); setMessage("");
    try {
      const { ok, status, data } = await authFetch("/register", {
        email: email.trim().toLowerCase(),
        password,
      });
      const token = data?.access_token || data?.token;
      if (ok && token) {
        saveToken(token);
        await navigateHome();
      } else if (ok) {
        setSuccessMsg("Compte créé ! Vérifiez votre email puis connectez-vous.");
        setMode("login");
        setPassword(""); setConfirmPassword("");
        setLoading(false);
      } else {
        const msg = data?.error || data?.detail || "";
        setMessage(msg.toLowerCase().includes("exist") || msg.toLowerCase().includes("already")
          ? "Un compte existe déjà avec cet email"
          : "Erreur lors de la création — réessayez");
        setLoading(false);
      }
    } catch (err) {
      setMessage("Erreur réseau — vérifiez votre connexion");
      setLoading(false);
    }
  };

  const handleForgot = async () => {
    if (!email) { setMessage("Entrez votre adresse email"); return; }
    setLoading(true); setMessage("");
    try {
      const { ok } = await authFetch("/reset-password", { email: email.trim().toLowerCase() });
      if (ok) {
        setSuccessMsg("Email de réinitialisation envoyé ! Vérifiez votre boîte mail.");
        setMode("login");
      } else {
        setMessage("Impossible d'envoyer l'email — vérifiez l'adresse");
      }
    } catch (_) {
      setMessage("Impossible d'envoyer l'email — vérifiez l'adresse");
    } finally { setLoading(false); }
  };

  const submit = mode === "login" ? handleLogin : mode === "register" ? handleRegister : handleForgot;

  return (
    <div style={s.container}>
      <div style={s.card}>

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
  logoBox: { marginBottom: "20px" },
  logoImg: {
    width: "72px", height: "72px", borderRadius: "18px", objectFit: "cover",
    marginBottom: "8px", display: "block", margin: "0 auto 8px",
  },
  logoText: { fontSize: "28px", fontWeight: "900", color: BLUE, letterSpacing: "3px" },
  logoSub: { fontSize: "12px", color: "#94a3b8", margin: "2px 0 0", fontWeight: "500" },
  title: { fontSize: "20px", fontWeight: "700", color: "#111", margin: "0 0 20px" },
  successBox: {
    background: "#f0fdf4", border: "1px solid #86efac", borderRadius: "10px",
    padding: "12px 14px", fontSize: "13px", color: "#15803d",
    marginBottom: "16px", textAlign: "left", lineHeight: "1.5",
  },
  fieldWrap: {
    position: "relative", display: "flex", alignItems: "center",
    border: "2px solid #e2e8f0", borderRadius: "12px", background: "#f8fafc", marginBottom: "12px",
  },
  fieldIcon: { flexShrink: 0, margin: "0 10px 0 14px", color: "#94a3b8" },
  input: {
    flex: 1, padding: "14px 12px 14px 0", border: "none", background: "transparent",
    fontSize: "15px", color: "#111", outline: "none", width: "100%", minWidth: 0,
  },
  eyeBtn: {
    position: "absolute", right: "12px", background: "none", border: "none",
    color: "#94a3b8", cursor: "pointer", padding: "8px", display: "flex", alignItems: "center",
  },
  error: { color: "#dc2626", fontSize: "13px", marginBottom: "12px", fontWeight: "500", textAlign: "left", lineHeight: "1.4" },
  btn: {
    width: "100%", padding: "15px", marginBottom: "10px", background: BLUE, color: "white",
    border: "none", borderRadius: "14px", fontWeight: "700", fontSize: "16px", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
    boxShadow: `0 4px 15px rgba(24,119,242,0.35)`, transition: "opacity 0.2s",
  },
  linkBtn: {
    background: "none", border: "none", color: BLUE, fontSize: "13px", fontWeight: "600",
    cursor: "pointer", marginBottom: "12px", padding: "4px", textDecoration: "underline",
    display: "block", width: "100%", textAlign: "center",
  },
  toggleRow: { display: "flex", alignItems: "center", justifyContent: "center", marginTop: "4px" },
  toggleBtn: { background: "none", border: "none", color: BLUE, fontSize: "13px", fontWeight: "700", cursor: "pointer", padding: "4px", textDecoration: "underline" },
  registerBox: {
    marginTop: "8px", background: "linear-gradient(135deg, #16a34a 0%, #15803d 100%)",
    borderRadius: "14px", padding: "14px 18px", display: "flex", alignItems: "center",
    justifyContent: "space-between", gap: "12px", boxShadow: "0 4px 12px rgba(22,163,74,0.25)",
  },
  registerText: { fontSize: "13px", color: "#dcfce7", fontWeight: "500" },
  registerBtn: {
    background: "white", border: "none", color: "#15803d", fontSize: "13px", fontWeight: "800",
    cursor: "pointer", padding: "8px 16px", borderRadius: "10px", whiteSpace: "nowrap",
    boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
  },
};