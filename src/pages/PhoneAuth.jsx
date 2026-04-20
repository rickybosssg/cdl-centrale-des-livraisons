import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, ArrowLeft } from "lucide-react";

export default function PhoneAuth() {
  const [step, setStep] = useState("phone"); // phone | code | loading
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);

  // ═══════════════════════════════════════════════════════════════
  // OTP FLOW
  // ═══════════════════════════════════════════════════════════════

  const sendOTP = async () => {
    if (!phone.trim()) {
      setMessage("Entrez un numéro");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const res = await base44.functions.invoke("sendOTP", { phone });

      if (res.data?.success) {
        setStep("code");
        setMessage("");
      } else {
        setMessage(res.data?.error || "Erreur envoi SMS");
      }
    } catch (err) {
      setMessage(err.message || "Erreur réseau");
    }

    setLoading(false);
  };

  const verifyOTP = async () => {
    if (!code || code.length !== 6) {
      setMessage("Code doit contenir 6 chiffres");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const res = await base44.functions.invoke("verifyOTP", { phone, code });

      if (res.data?.success) {
        // Stocker le token si fourni
        if (res.data.token) {
          localStorage.setItem("base44_access_token", res.data.token);
        }

        setStep("loading");

        // Redirection après succès
        setTimeout(() => {
          window.location.href = "/";
        }, 800);
      } else {
        setMessage(res.data?.error || "Code incorrect");
      }
    } catch (err) {
      setMessage(err.message || "Erreur vérification");
    }

    setLoading(false);
  };

  // ═══════════════════════════════════════════════════════════════
  // ADMIN LOGIN (via Base44)
  // ═══════════════════════════════════════════════════════════════

  const handleAdminLogin = async () => {
    if (!adminEmail || !adminPassword) {
      setMessage("Email et mot de passe requis");
      return;
    }

    setAdminLoading(true);

    try {
      // Utiliser base44.auth pour login admin
      await base44.auth.login(adminEmail, adminPassword);

      // Redirection après login admin réussi
      setTimeout(() => {
        window.location.href = "/";
      }, 800);
    } catch (err) {
      setMessage(err.message || "Identifiants invalides");
    }

    setAdminLoading(false);
  };

  // ═══════════════════════════════════════════════════════════════
  // LOADING STATE
  // ═══════════════════════════════════════════════════════════════

  if (step === "loading") {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.logo}>CDL</div>
          <div style={{ ...styles.spinner, marginBottom: "20px" }}>
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
          <p style={styles.subtitle}>Authentification en cours...</p>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // ADMIN LOGIN FORM
  // ═══════════════════════════════════════════════════════════════

  if (showAdminLogin) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <button
            onClick={() => {
              setShowAdminLogin(false);
              setAdminEmail("");
              setAdminPassword("");
              setMessage("");
            }}
            style={styles.backButtonRow}
          >
            <ArrowLeft size={18} /> Retour
          </button>

          <div style={styles.logo}>CDL</div>
          <h2 style={styles.title}>Accès Admin</h2>

          <input
            style={styles.input}
            type="email"
            placeholder="Email admin"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
          />

          <input
            style={styles.input}
            type="password"
            placeholder="Mot de passe"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
          />

          <button
            style={styles.button}
            onClick={handleAdminLogin}
            disabled={adminLoading}
          >
            {adminLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Connexion...
              </>
            ) : (
              "Se connecter"
            )}
          </button>

          {message && <p style={styles.error}>{message}</p>}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // OTP FORM - PHONE STEP
  // ═══════════════════════════════════════════════════════════════

  if (step === "phone") {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.logo}>CDL</div>
          <h2 style={styles.title}>Connexion</h2>

          <input
            style={styles.input}
            type="tel"
            placeholder="+226XXXXXXXX ou 0XXXXXXXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />

          <button
            style={styles.button}
            onClick={sendOTP}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Envoi...
              </>
            ) : (
              "Envoyer le code"
            )}
          </button>

          {message && <p style={styles.error}>{message}</p>}

          {/* SÉPARATEUR */}
          <div style={styles.divider}></div>

          {/* ADMIN BUTTON */}
          <button
            style={styles.adminButton}
            onClick={() => setShowAdminLogin(true)}
          >
            Se connecter en tant qu'admin
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // OTP FORM - CODE STEP
  // ═══════════════════════════════════════════════════════════════

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <button
          onClick={() => {
            setStep("phone");
            setCode("");
            setMessage("");
          }}
          style={styles.backButtonRow}
        >
          <ArrowLeft size={18} /> Modifier numéro
        </button>

        <div style={styles.logo}>CDL</div>
        <h2 style={styles.title}>Vérification</h2>
        <p style={styles.subtitle}>Code envoyé à {phone}</p>

        <input
          style={styles.input}
          type="text"
          placeholder="000000"
          maxLength="6"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        />

        <button
          style={styles.button}
          onClick={verifyOTP}
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Vérification...
            </>
          ) : (
            "Valider"
          )}
        </button>

        {message && <p style={styles.error}>{message}</p>}
      </div>
    </div>
  );
}

const styles = {
  container: {
    height: "100vh",
    background: "linear-gradient(135deg, #2078C6, #0f4fa3)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontFamily: "Inter, system-ui, sans-serif",
    padding: "20px",
  },
  card: {
    background: "white",
    padding: "40px 30px",
    borderRadius: "20px",
    width: "100%",
    maxWidth: "340px",
    textAlign: "center",
    boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
    position: "relative",
  },
  backButtonRow: {
    position: "absolute",
    top: "16px",
    left: "16px",
    background: "transparent",
    border: "none",
    color: "#2078C6",
    fontWeight: "600",
    cursor: "pointer",
    fontSize: "14px",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 12px",
    borderRadius: "8px",
    transition: "background 0.2s",
  },
  logo: {
    fontSize: "36px",
    fontWeight: "800",
    color: "#2078C6",
    letterSpacing: "2px",
    marginBottom: "8px",
  },
  title: {
    fontSize: "20px",
    fontWeight: "600",
    color: "#111",
    margin: "8px 0 8px 0",
  },
  subtitle: {
    fontSize: "13px",
    color: "#999",
    marginBottom: "24px",
  },
  input: {
    width: "100%",
    padding: "14px",
    marginBottom: "16px",
    borderRadius: "12px",
    border: "1px solid #ddd",
    fontSize: "15px",
    boxSizing: "border-box",
    fontFamily: "inherit",
    transition: "border 0.2s",
  },
  button: {
    width: "100%",
    padding: "14px",
    marginBottom: "12px",
    background: "#2078C6",
    color: "white",
    border: "none",
    borderRadius: "12px",
    fontWeight: "600",
    fontSize: "15px",
    cursor: "pointer",
    transition: "background 0.2s",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
  },
  divider: {
    margin: "24px 0",
    height: "1px",
    background: "#eee",
  },
  adminButton: {
    width: "100%",
    padding: "12px",
    background: "transparent",
    border: "1.5px solid #2078C6",
    borderRadius: "12px",
    color: "#2078C6",
    fontWeight: "600",
    fontSize: "14px",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  error: {
    color: "#dc2626",
    fontSize: "13px",
    marginTop: "12px",
    fontWeight: "500",
  },
  spinner: {
    display: "flex",
    justifyContent: "center",
  },
};