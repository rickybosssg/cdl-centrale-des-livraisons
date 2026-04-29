import { useState } from "react";
import { Loader2, Eye, EyeOff, Mail, Lock, ArrowRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

const BLUE = "#1E6BFF";
const DARK = "#0F2A5C";
// Utiliser l'appId injecté par Vite — fallback sur valeur hardcodée
const APP_ID = import.meta.env?.VITE_BASE44_APP_ID || "69c3c74fc4b62396dca61751";
const AUTH_BASE = `https://app.base44.com/api/apps/${APP_ID}/auth`;

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
  const [mode, setMode] = useState("login"); // login | register | forgot
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
      const { ok, status, data } = await authFetch("/login", { email: email.trim().toLowerCase(), password });
      const token = data?.access_token || data?.token;
      if (ok && token) { saveToken(token); await navigateHome(); }
      else {
        setMessage(status === 401 || status === 400 ? "Email ou mot de passe incorrect" : (data?.error || data?.detail || "Erreur de connexion — réessayez"));
        setLoading(false);
      }
    } catch (err) { setMessage("Erreur réseau — vérifiez votre connexion"); setLoading(false); }
  };

  const handleRegister = async () => {
    if (!email || !password) { setMessage("Email et mot de passe requis"); return; }
    if (password.length < 6) { setMessage("Mot de passe trop court (6 caractères minimum)"); return; }
    if (password !== confirmPassword) { setMessage("Les mots de passe ne correspondent pas"); return; }
    setLoading(true); setMessage("");
    try {
      const { ok, status, data } = await authFetch("/register", { email: email.trim().toLowerCase(), password });
      const token = data?.access_token || data?.token;
      if (ok && token) { saveToken(token); await navigateHome(); }
      else if (ok) { setSuccessMsg("Compte créé ! Vérifiez votre email puis connectez-vous."); setMode("login"); setPassword(""); setConfirmPassword(""); setLoading(false); }
      else {
        const msg = data?.error || data?.detail || "";
        setMessage(msg.toLowerCase().includes("exist") || msg.toLowerCase().includes("already") ? "Un compte existe déjà avec cet email" : "Erreur lors de la création — réessayez");
        setLoading(false);
      }
    } catch (err) { setMessage("Erreur réseau — vérifiez votre connexion"); setLoading(false); }
  };

  const handleForgot = async () => {
    if (!email) { setMessage("Entrez votre adresse email"); return; }
    setLoading(true); setMessage("");
    try {
      // Appel direct à l'endpoint natif Base44 — génère un vrai lien de reset par email
      await fetch(`${AUTH_BASE}/send-reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      // Toujours afficher le message de succès (sécurité : ne pas révéler si l'email existe)
      setSuccessMsg("✅ Si cet email existe dans notre système, un lien de réinitialisation a été envoyé. Vérifiez votre boîte mail et les spams.");
      setMode("login");
    } catch (err) {
      setMessage("Erreur réseau — vérifiez votre connexion et réessayez");
    } finally {
      setLoading(false);
    }
  };

  const submit = mode === "login" ? handleLogin : mode === "register" ? handleRegister : handleForgot;

  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(160deg, ${DARK} 0%, ${BLUE} 60%, #4A90E2 100%)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px", fontFamily: "Inter, system-ui, sans-serif" }}>

      {/* Logo */}
      <div style={{ textAlign: "center", marginBottom: "28px" }}>
        <div style={{ width: "80px", height: "80px", borderRadius: "22px", background: "rgba(255,255,255,0.15)", border: "1.5px solid rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", backdropFilter: "blur(10px)", overflow: "hidden" }}>
          <img src="https://media.base44.com/images/public/69c3c74fc4b62396dca61751/1eb51398f_Screenshot_20260330_132434_WhatsApp.jpg" alt="CDL" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "20px" }} onError={e => { e.target.style.display = "none"; }} />
        </div>
        <h1 style={{ fontSize: "30px", fontWeight: "900", color: "white", letterSpacing: "4px", margin: 0 }}>CDL</h1>
        <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)", margin: "4px 0 0", fontWeight: "500" }}>Centrale des Livraisons</p>
      </div>

      {/* Card */}
      <div style={{ background: "white", padding: "32px 24px 28px", borderRadius: "28px", width: "100%", maxWidth: "390px", boxShadow: "0 32px 80px rgba(0,0,0,0.35)" }}>
        <h2 style={{ fontSize: "20px", fontWeight: "800", color: "#111", margin: "0 0 4px" }}>
          {mode === "login" ? "Connexion" : mode === "register" ? "Créer un compte" : "Mot de passe oublié"}
        </h2>
        <p style={{ fontSize: "13px", color: "#6B7280", margin: "0 0 20px" }}>
          {mode === "login" ? "Accédez à votre espace CDL" : mode === "register" ? "Rejoignez la Centrale des Livraisons" : "Entrez votre adresse email"}
        </p>

        {/* Succès */}
        {successMsg && (
          <div style={{ background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: "14px", padding: "12px 14px", fontSize: "13px", color: "#15803d", marginBottom: "16px", lineHeight: "1.5" }}>
            {successMsg}
          </div>
        )}

        {/* Email */}
        <div style={{ position: "relative", marginBottom: "12px" }}>
          <Mail size={16} style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
          <input
            type="email" placeholder="Adresse email" value={email}
            onChange={e => { setEmail(e.target.value); setMessage(""); }}
            onKeyDown={e => e.key === "Enter" && submit()}
            autoComplete="email" inputMode="email"
            style={{ width: "100%", height: "50px", border: "2px solid #E5E7EB", borderRadius: "14px", paddingLeft: "42px", paddingRight: "14px", fontSize: "15px", color: "#111", outline: "none", boxSizing: "border-box", background: "#F9FAFB" }}
            onFocus={e => { e.target.style.borderColor = BLUE; e.target.style.background = "white"; }}
            onBlur={e => { e.target.style.borderColor = "#E5E7EB"; e.target.style.background = "#F9FAFB"; }}
          />
        </div>

        {/* Mot de passe */}
        {mode !== "forgot" && (
          <div style={{ position: "relative", marginBottom: "12px" }}>
            <Lock size={16} style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
            <input
              type={showPassword ? "text" : "password"} placeholder="Mot de passe" value={password}
              onChange={e => { setPassword(e.target.value); setMessage(""); }}
              onKeyDown={e => e.key === "Enter" && submit()}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              style={{ width: "100%", height: "50px", border: "2px solid #E5E7EB", borderRadius: "14px", paddingLeft: "42px", paddingRight: "44px", fontSize: "15px", color: "#111", outline: "none", boxSizing: "border-box", background: "#F9FAFB" }}
              onFocus={e => { e.target.style.borderColor = BLUE; e.target.style.background = "white"; }}
              onBlur={e => { e.target.style.borderColor = "#E5E7EB"; e.target.style.background = "#F9FAFB"; }}
            />
            <button type="button" onClick={() => setShowPassword(v => !v)} style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#9CA3AF", cursor: "pointer", padding: "4px", display: "flex", alignItems: "center" }}>
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        )}

        {/* Confirmation (register) */}
        {mode === "register" && (
          <div style={{ position: "relative", marginBottom: "12px" }}>
            <Lock size={16} style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
            <input
              type={showPassword ? "text" : "password"} placeholder="Confirmer le mot de passe" value={confirmPassword}
              onChange={e => { setConfirmPassword(e.target.value); setMessage(""); }}
              onKeyDown={e => e.key === "Enter" && submit()}
              autoComplete="new-password"
              style={{ width: "100%", height: "50px", border: "2px solid #E5E7EB", borderRadius: "14px", paddingLeft: "42px", paddingRight: "14px", fontSize: "15px", color: "#111", outline: "none", boxSizing: "border-box", background: "#F9FAFB" }}
              onFocus={e => { e.target.style.borderColor = BLUE; e.target.style.background = "white"; }}
              onBlur={e => { e.target.style.borderColor = "#E5E7EB"; e.target.style.background = "#F9FAFB"; }}
            />
          </div>
        )}

        {/* Erreur */}
        {message && <p style={{ color: "#EF4444", fontSize: "13px", marginBottom: "12px", fontWeight: "500", lineHeight: "1.4", padding: "10px 12px", background: "#FEF2F2", borderRadius: "10px", border: "1px solid #FECACA" }}>{message}</p>}

        {/* Bouton principal */}
        <button
          onClick={submit}
          disabled={loading}
          style={{ width: "100%", height: "52px", background: loading ? "#93C5FD" : `linear-gradient(135deg, ${BLUE} 0%, #1558D6 100%)`, color: "white", border: "none", borderRadius: "16px", fontWeight: "800", fontSize: "16px", cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", boxShadow: loading ? "none" : `0 6px 20px ${BLUE}40`, transition: "all 0.2s", marginBottom: "12px" }}
        >
          {loading ? <><Loader2 style={{ animation: "spin 1s linear infinite", width: 18, height: 18 }} /> Connexion...</> : <>{mode === "login" ? "Se connecter" : mode === "register" ? "Créer mon compte" : "Envoyer le lien"}<ArrowRight size={16} /></>}
        </button>

        {/* Mot de passe oublié */}
        {mode === "login" && (
          <button onClick={() => { setMode("forgot"); setMessage(""); setSuccessMsg(""); }} style={{ background: "none", border: "none", color: BLUE, fontSize: "13px", fontWeight: "600", cursor: "pointer", marginBottom: "12px", textDecoration: "none", display: "block", width: "100%", textAlign: "center" }}>
            Mot de passe oublié ?
          </button>
        )}

        {/* Divider */}
        <div style={{ height: "1px", background: "#F3F4F6", margin: "12px 0" }} />

        {/* Toggle login ↔ register */}
        {mode === "login" ? (
          <div style={{ background: "linear-gradient(135deg, #16a34a 0%, #15803d 100%)", borderRadius: "18px", padding: "16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", boxShadow: "0 4px 14px rgba(22,163,74,0.25)" }}>
            <div>
              <p style={{ fontSize: "13px", color: "#dcfce7", fontWeight: "600", margin: 0 }}>Pas encore de compte ?</p>
              <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.6)", margin: "2px 0 0" }}>Rejoignez CDL gratuitement</p>
            </div>
            <button onClick={() => { setMode("register"); setMessage(""); setSuccessMsg(""); }} style={{ background: "white", border: "none", color: "#15803d", fontSize: "13px", fontWeight: "800", cursor: "pointer", padding: "9px 18px", borderRadius: "12px", whiteSpace: "nowrap", boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}>
              Créer →
            </button>
          </div>
        ) : (
          <button onClick={() => { setMode("login"); setMessage(""); setSuccessMsg(""); }} style={{ background: "none", border: "none", color: BLUE, fontSize: "14px", fontWeight: "700", cursor: "pointer", width: "100%", textAlign: "center", textDecoration: "underline" }}>
            ← Retour à la connexion
          </button>
        )}
      </div>

      {/* Mentions légales */}
      <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)", marginTop: "20px", textAlign: "center" }}>
        © 2024 CDL — Centrale des Livraisons, Ouagadougou
      </p>
    </div>
  );
}