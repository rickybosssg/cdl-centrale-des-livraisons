import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2 } from "lucide-react";

export default function CDLLogin() {
  const [step, setStep] = useState("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const sendOTP = async () => {
    if (!phone) {
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
        alert("Bienvenue sur CDL 🚀");
        // Redirection vers dashboard
        setTimeout(() => {
          window.location.href = "/";
        }, 500);
      } else {
        setMessage(res.data?.error || "Code incorrect");
      }
    } catch (err) {
      setMessage(err.message || "Erreur vérification");
    }

    setLoading(false);
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        
        {/* LOGO */}
        <div style={styles.logo}>CDL</div>
        <h2 style={styles.title}>Connexion</h2>

        {step === "phone" && (
          <>
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
                "Recevoir le code"
              )}
            </button>
          </>
        )}

        {step === "code" && (
          <>
            <input
              style={styles.input}
              type="text"
              placeholder="000000"
              maxLength="6"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
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

            <button 
              style={styles.backButton}
              onClick={() => {
                setStep("phone");
                setCode("");
                setMessage("");
              }}
            >
              ← Revenir au numéro
            </button>
          </>
        )}

        {message && <p style={styles.error}>{message}</p>}

        {/* SÉPARATEUR */}
        <div style={styles.divider}></div>

        {/* ADMIN */}
        <button 
          style={styles.adminButton}
          onClick={() => window.location.href = "/admin-login-secure"}
        >
          Se connecter en tant qu'admin
        </button>

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
  },
  card: {
    background: "white",
    padding: "40px 30px",
    borderRadius: "20px",
    width: "100%",
    maxWidth: "340px",
    textAlign: "center",
    boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
  },
  logo: {
    fontSize: "36px",
    fontWeight: "800",
    color: "#2078C6",
    marginBottom: "8px",
    letterSpacing: "2px",
  },
  title: {
    fontSize: "20px",
    fontWeight: "600",
    color: "#111",
    marginBottom: "30px",
    margin: "8px 0 30px 0",
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
  backButton: {
    width: "100%",
    padding: "10px",
    background: "transparent",
    color: "#2078C6",
    border: "none",
    borderRadius: "8px",
    fontSize: "13px",
    cursor: "pointer",
    fontWeight: "500",
    transition: "background 0.2s",
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
};