import { useState, useEffect } from "react";
import { Loader2, Eye, EyeOff, Mail, Lock } from "lucide-react";
import { base44 } from "@/api/base44Client";

// Couleur unique : même bleu que Facebook #1877f2
const BLUE = "#1877f2";

// Détecte si on est dans un APK Capacitor (Android WebView)
function isCapacitorApp() {
  if (typeof window === "undefined") return false;
  return (
    window.location?.protocol === "capacitor:" ||
    typeof window.Capacitor !== "undefined" ||
    window.location?.protocol === "file:"
  );
}

export default function EmailLogin() {
  const [mode, setMode] = useState("login"); // "login" | "register" | "forgot"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [isNative] = useState(() => isCapacitorApp());

  // Gérer le retour OAuth (Facebook redirect → /connexion?access_token=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("access_token") || params.get("token");
    if (token) {
      try { localStorage.setItem("base44_access_token", token); } catch (_) {}
      try { base44.auth.setToken(token); } catch (_) {}
      // Fermer le browser Capacitor s'il est ouvert (APK)
      import("@capacitor/browser").then(({ Browser }) => {
        Browser.close().catch(() => {});
      }).catch(() => {});
      // Nettoyer l'URL et rediriger
      window.history.replaceState({}, "", "/connexion");
      window.location.replace("/");
    }
  }, []);

  // Naviguer vers home après login — le token est déjà stocké en localStorage
  // AuthContext le relira au chargement de la page suivante
  const navigateHome = () => {
    // Petit délai pour s'assurer que localStorage est flush avant la navigation
    // (critique sur WebView Android où localStorage peut être asynchrone)
    setTimeout(() => {
      window.location.replace("/");
    }, 150);
  };

  const handleLogin = async () => {
    if (!email || !password) { setMessage("Email et mot de passe requis"); return; }
    setLoading(true); setMessage("");
    try {
      const result = await base44.auth.loginViaEmailPassword(email.trim().toLowerCase(), password);
      const token = result?.access_token || result?.token;
      if (token) {
        // Stocker avant tout dans localStorage (APK + web)
        try { localStorage.setItem("base44_access_token", token); } catch (_) {}
        try { base44.auth.setToken(token); } catch (_) {}
      }
      navigateHome();
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
        try { localStorage.setItem("base44_access_token", token); } catch (_) {}
        try { base44.auth.setToken(token); } catch (_) {}
        navigateHome();
      } else {
        setSuccessMsg("Compte créé ! Vérifiez votre email puis connectez-vous.");
        setMode("login");
        setPassword(""); setConfirmPassword("");
      }
    } catch (err) {
      const msg = err?.message || "";
      setMessage(msg.toLowerCase().includes("exist") || msg.toLowerCase().includes("already")
        ? "Un compte existe déjà avec cet email"
        : "Erreur lors de la création — réessayez");
    } finally { setLoading(false); }
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

  const handleFacebook = async () => {
    setLoading(true);
    setMessage("");
    try {
      if (isNative) {
        // APK Android : ouvrir le flow OAuth dans le browser système (pas la WebView)
        // pour éviter les restrictions de Facebook sur les WebViews embarquées
        const appId = import.meta.env.VITE_BASE44_APP_ID;
        const redirectUri = "https://app.base44.com/api/auth/callback/facebook";
        const oauthUrl = `https://app.base44.com/api/apps/${appId}/auth/social/facebook?redirect_uri=${encodeURIComponent("https://cdl.base44.app/connexion")}`;

        try {
          // Tenter Capacitor Browser (ouvre le navigateur système externe)
          const { Browser } = await import("@capacitor/browser");
          await Browser.open({ url: oauthUrl, presentationStyle: "fullscreen" });
          // Le résultat arrive via deep link sur /connexion?access_token=...
          // Le useEffect captera le token au retour sur la page
          setLoading(false);
        } catch (_) {
          // Fallback : ouvrir dans le navigateur système via window.open
          window.open(oauthUrl, "_system");
          setLoading(false);
        }
      } else {
        // Web : redirect OAuth standard via SDK Base44
        await base44.auth.loginWithSocialProvider("facebook");
        window.location.replace("/");
      }
    } catch (err) {
      const msg = (err?.message || "").toLowerCase();
      const isExpectedRedirect = msg.includes("redirect") || msg.includes("navigation") || msg.includes("aborted") || msg.includes("blocked");
      if (!isExpectedRedirect) {
        setMessage("Connexion Facebook non disponible — vérifiez la configuration");
      }
      setLoading(false);
    }
  };

  const submit = mode === "login" ? handleLogin : mode === "register" ? handleRegister : handleForgot;

  return (
    <div style={s.container}>
      <div style={s.card}>
        {/* Logo — sans tagline */}
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

        {/* Séparateur + Facebook (pas sur forgot) */}
        {mode !== "forgot" && (
          <>
            <div style={s.sepRow}>
              <div style={s.sepLine} />
              <span style={s.sepText}>ou</span>
              <div style={s.sepLine} />
            </div>

            <button style={{ ...s.fbBtn, opacity: loading ? 0.7 : 1 }} onClick={handleFacebook} disabled={loading}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white" style={{ marginRight: 10, flexShrink: 0 }}>
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
              {isNative ? "Continuer avec Facebook (navigateur)" : "Continuer avec Facebook"}
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
  fbBtn: {
    width: "100%",
    padding: "13px",
    marginBottom: "16px",
    background: BLUE,
    color: "white",
    border: "none",
    borderRadius: "14px",
    fontWeight: "600",
    fontSize: "15px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: `0 4px 12px rgba(24,119,242,0.35)`,
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