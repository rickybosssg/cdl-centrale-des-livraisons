import { useState, useEffect } from "react";
import { Loader2, Eye, EyeOff, Mail, Lock } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

const BLUE = "#1877f2";

function isCapacitorApp() {
  if (typeof window === "undefined") return false;
  return (
    window.location?.protocol === "capacitor:" ||
    typeof window.Capacitor !== "undefined" ||
    window.location?.protocol === "file:"
  );
}

// Sauvegarde le token partout + met à jour le SDK immédiatement
function saveToken(token) {
  try { localStorage.setItem("base44_access_token", token); } catch (_) {}
  try { base44.auth.setToken(token); } catch (_) {}
}

export default function EmailLogin() {
  const { checkAppState } = useAuth();
  const [mode, setMode] = useState("login"); // "login" | "register" | "forgot"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Gérer le retour OAuth Google (redirect → /connexion?access_token=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("access_token") || params.get("token");
    if (token) {
      saveToken(token);
      import("@capacitor/browser").then(({ Browser }) => Browser.close().catch(() => {})).catch(() => {});
      window.history.replaceState({}, "", "/connexion");
      navigateHome();
    }
  }, []);

  // Après login : mettre à jour le contexte auth PUIS naviguer vers /
  const navigateHome = async () => {
    try {
      await checkAppState();
    } catch (_) {}
    window.location.replace("/");
  };

  const handleLogin = async () => {
    if (!email || !password) { setMessage("Email et mot de passe requis"); return; }
    setLoading(true); setMessage("");
    try {
      const result = await base44.auth.loginViaEmailPassword(email.trim().toLowerCase(), password);
      const token = result?.access_token || result?.token;
      if (token) {
        saveToken(token);
      }
      await navigateHome();
    } catch (err) {
      const status = err?.status || err?.response?.status;
      setMessage(status === 401 || status === 400 || err?.message?.includes("credentials")
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
    } catch (err) {
      setMessage("Impossible d'envoyer l'email — vérifiez l'adresse");
    } finally { setLoading(false); }
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    setMessage("");
    try {
      const isNative = isCapacitorApp();
      if (isNative) {
        const appId = import.meta.env.VITE_BASE44_APP_ID;
        const oauthUrl = `https://app.base44.com/api/apps/${appId}/auth/social/google?redirect_uri=${encodeURIComponent("https://cdl.base44.app/connexion")}`;
        try {
          const { Browser } = await import("@capacitor/browser");
          await Browser.open({ url: oauthUrl, presentationStyle: "fullscreen" });
        } catch (_) {
          window.open(oauthUrl, "_system");
        }
        setGoogleLoading(false);
      } else {
        await base44.auth.loginWithSocialProvider("google");
      }
    } catch (err) {
      const msg = (err?.message || "").toLowerCase();
      const isRedirect = msg.includes("redirect") || msg.includes("navigation") || msg.includes("aborted");
      if (!isRedirect) {
        setMessage("Connexion Google non disponible — réessayez");
      }
      setGoogleLoading(false);
    }
  };

  const submit = mode === "login" ? handleLogin : mode === "register" ? handleRegister : handleForgot;

  return (
    <div style={s.container}>
      <div style={s.card}>
        {/* Logo */}
        <div style={s.logo}>CDL</div>

        {/* Titre */}
        <h2 style={s.title}>
          {mode === "login" ? "Connexion"
            : mode === "register" ? "Créer un compte"
            : "Mot de passe oublié"}
        </h2>

        {/* Succès */}
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

        {/* Confirmation (register) */}
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
            ? <><Loader2 className="h-4 w-4 animate-spin" style={{ marginRight: 8 }} />Chargement...</>
            : mode === "login" ? "Se connecter"
            : mode === "register" ? "Créer mon compte"
            : "Envoyer le lien de réinitialisation"}
        </button>

        {/* Mot de passe oublié (login) */}
        {mode === "login" && (
          <button style={s.linkBtn} onClick={() => { setMode("forgot"); setMessage(""); setSuccessMsg(""); }}>
            Mot de passe oublié ?
          </button>
        )}

        {/* Séparateur + Google (pas sur forgot) */}
        {mode !== "forgot" && (
          <>
            <div style={s.sepRow}>
              <div style={s.sepLine} />
              <span style={s.sepText}>ou</span>
              <div style={s.sepLine} />
            </div>

            <button
              style={{ ...s.googleBtn, opacity: googleLoading ? 0.7 : 1 }}
              onClick={handleGoogle}
              disabled={googleLoading}
            >
              {googleLoading ? (
                <Loader2 size={18} style={{ marginRight: 10, flexShrink: 0, animation: "spin 1s linear infinite" }} />
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" style={{ marginRight: 10, flexShrink: 0 }}>
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              )}
              Continuer avec Google
            </button>
          </>
        )}

        {/* Toggle login ↔ register */}
        <div style={s.toggleRow}>
          {mode === "login" ? (
            <>
              <span style={s.toggleText}>Pas encore de compte ?</span>
              <button style={s.toggleBtn} onClick={() => { setMode("register"); setMessage(""); setSuccessMsg(""); }}>
                Créer un compte
              </button>
            </>
          ) : (
            <button style={s.toggleBtn} onClick={() => { setMode("login"); setMessage(""); setSuccessMsg(""); }}>
              ← Retour à la connexion
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const s = {
  container: {
    minHeight: "100vh",
    background: BLUE,
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
    maxWidth: "380px",
    textAlign: "center",
    boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
  },
  logo: {
    fontSize: "42px",
    fontWeight: "900",
    color: BLUE,
    letterSpacing: "4px",
    marginBottom: "20px",
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
    marginBottom: "8px",
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
  sepRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    margin: "4px 0 14px",
  },
  sepLine: {
    flex: 1,
    height: "1px",
    background: "#e2e8f0",
  },
  sepText: {
    fontSize: "12px",
    color: "#aaa",
    flexShrink: 0,
  },
  googleBtn: {
    width: "100%",
    padding: "13px",
    marginBottom: "16px",
    background: "white",
    color: "#333",
    border: "2px solid #e2e8f0",
    borderRadius: "14px",
    fontWeight: "600",
    fontSize: "15px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    transition: "opacity 0.2s",
  },
  toggleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    flexWrap: "wrap",
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
};