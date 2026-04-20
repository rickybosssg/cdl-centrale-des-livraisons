import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, ArrowLeft, Phone } from "lucide-react";

const ADMIN_PHONE = "+22655738247";

export default function PhoneAuth() {
  const [step, setStep] = useState("phone"); // phone | code | loading
  const [digits, setDigits] = useState(""); // Seulement les 8 chiffres
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // Saisie simple — accepter UNIQUEMENT 8 chiffres, sans modification
  const handlePhoneChange = (e) => {
    const value = e.target.value;
    // Extraire uniquement les chiffres
    const digitsOnly = value.replace(/\D/g, "");
    // Limiter à 8 chiffres
    if (digitsOnly.length <= 8) {
      setDigits(digitsOnly);
    }
  };

  const sendOTP = async () => {
    if (digits.length < 8) {
      setMessage("Numéro incomplet");
      return;
    }

    const fullPhone = "+226" + digits;

    setLoading(true);
    setMessage("");

    try {
      const res = await base44.functions.invoke("sendOTP", { phone: fullPhone });

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
      setStep("loading");

      const res = await base44.functions.invoke("verifyOTPWithRedirect", {
        phone: "+226" + digits,
        code,
      });

      if (res.data?.success) {
        // Redirection intelligente selon le type d'utilisateur
        const redirectUrl = res.data.redirect_url || "/";
        setTimeout(() => {
          window.location.href = redirectUrl;
        }, 800);
      } else {
        setStep("code");
        setMessage(res.data?.error || "Code incorrect");
      }
    } catch (err) {
      setStep("code");
      setMessage(err.message || "Erreur vérification");
    }

    setLoading(false);
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
  // PHONE STEP
  // ═══════════════════════════════════════════════════════════════

  if (step === "phone") {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.logo}>CDL</div>
          <h2 style={styles.title}>Connexion</h2>
          <p style={styles.subtitle}>Entrez votre numéro de téléphone</p>

          <div style={styles.phoneInputWrapper}>
            <span style={styles.prefix}>+226</span>
            <input
              style={styles.phoneInput}
              type="tel"
              inputMode="numeric"
              placeholder="55738247"
              value={digits}
              onChange={handlePhoneChange}
              maxLength="8"
              disabled={loading}
            />
          </div>

          <button
            style={{
              ...styles.button,
              opacity: digits.length === 8 ? 1 : 0.6,
            }}
            onClick={sendOTP}
            disabled={loading || digits.length !== 8}
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
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // CODE STEP
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
        <p style={styles.subtitle}>Code envoyé à +226{digits}</p>

        <input
          style={styles.input}
          type="text"
          placeholder="000000"
          maxLength="6"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          disabled={loading}
        />

        <button
          style={{
            ...styles.button,
            opacity: code.length === 6 ? 1 : 0.6,
            pointerEvents: code.length === 6 ? "auto" : "none",
          }}
          onClick={verifyOTP}
          disabled={loading || code.length !== 6}
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
  phoneInputWrapper: {
    display: "flex",
    alignItems: "center",
    gap: "0",
    paddingLeft: "12px",
    marginBottom: "16px",
    borderRadius: "12px",
    border: "1px solid #ddd",
    background: "#f9f9f9",
  },
  prefix: {
    fontSize: "15px",
    fontWeight: "600",
    color: "#333",
    whiteSpace: "nowrap",
    paddingRight: "4px",
  },
  phoneInput: {
    flex: 1,
    padding: "14px 12px",
    border: "none",
    background: "transparent",
    fontSize: "15px",
    fontFamily: "inherit",
    color: "#333",
    outline: "none",
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
    color: "#333",
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
    transition: "background 0.2s, opacity 0.2s",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
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