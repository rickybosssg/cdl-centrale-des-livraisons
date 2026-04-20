import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, ArrowLeft, Lock } from "lucide-react";

export default function AdminLoginSecure() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Email et mot de passe requis");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Appeler une fonction backend pour authentifier l'admin
      const res = await base44.functions.invoke("adminLogin", {
        email: email.trim().toLowerCase(),
        password,
      });

      if (res.data?.success) {
        setSuccess(true);
        // Redirection vers le dashboard admin
        setTimeout(() => {
          window.location.href = "/admin-dashboard";
        }, 1000);
      } else {
        setError(res.data?.error || "Authentification échouée");
      }
    } catch (err) {
      setError(err.message || "Erreur de connexion");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.successIcon}>✓</div>
          <p style={styles.successText}>Connexion réussie</p>
          <p style={{ fontSize: "13px", color: "#666", marginTop: "8px" }}>
            Redirection en cours...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <button
          onClick={() => window.history.back()}
          style={styles.backLink}
        >
          <ArrowLeft size={18} /> Retour
        </button>

        <div style={styles.iconBox}>
          <Lock size={40} style={{ color: "#2078C6" }} />
        </div>

        <h1 style={styles.title}>Accès Administrateur</h1>
        <p style={styles.subtitle}>Portal sécurisé CDL</p>

        <form onSubmit={handleLogin} style={{ width: "100%", marginTop: "30px" }}>
          <input
            style={styles.input}
            type="email"
            placeholder="Email admin"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />

          <input
            style={styles.input}
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />

          <button
            type="submit"
            style={{
              ...styles.button,
              opacity: loading ? 0.7 : 1,
              pointerEvents: loading ? "none" : "auto",
            }}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Connexion...
              </>
            ) : (
              "Se connecter"
            )}
          </button>
        </form>

        {error && <p style={styles.error}>{error}</p>}

        <p style={styles.notice}>
          ⚠️ Cette page est réservée aux administrateurs CDL uniquement.
        </p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    height: "100vh",
    background: "linear-gradient(135deg, #1e3a5f, #0d2a47)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  card: {
    background: "white",
    borderRadius: "20px",
    padding: "40px 30px",
    maxWidth: "360px",
    width: "100%",
    boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
    textAlign: "center",
    position: "relative",
  },
  backLink: {
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
  iconBox: {
    height: "60px",
    width: "60px",
    background: "#2078C6",
    borderRadius: "16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto 16px",
    color: "white",
  },
  title: {
    fontSize: "22px",
    fontWeight: "700",
    color: "#111",
    margin: "0 0 4px 0",
  },
  subtitle: {
    fontSize: "13px",
    color: "#999",
    margin: "0",
  },
  input: {
    width: "100%",
    padding: "14px",
    marginBottom: "14px",
    border: "1px solid #ddd",
    borderRadius: "12px",
    fontSize: "15px",
    boxSizing: "border-box",
    fontFamily: "inherit",
    color: "#333",
    transition: "border 0.2s",
  },
  button: {
    width: "100%",
    padding: "14px",
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
  error: {
    color: "#dc2626",
    fontSize: "13px",
    marginTop: "12px",
    fontWeight: "500",
  },
  notice: {
    fontSize: "12px",
    color: "#999",
    marginTop: "20px",
    lineHeight: "1.5",
  },
  successIcon: {
    fontSize: "48px",
    color: "#22c55e",
    marginBottom: "12px",
  },
  successText: {
    fontSize: "16px",
    fontWeight: "600",
    color: "#22c55e",
  },
};