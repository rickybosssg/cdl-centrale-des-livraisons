import { useState, useRef } from "react";
import { Loader2, ArrowLeft } from "lucide-react";
import { appParams } from "@/lib/app-params";

export default function PhoneAuth() {
  const [step, setStep] = useState("phone");
  const [digits, setDigits] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [debugInfo, setDebugInfo] = useState(null);
  const [showDebug, setShowDebug] = useState(false);

  const handlePhoneChange = (e) => {
    const v = e.target.value.replace(/\D/g, "");
    setDigits(v.slice(0, 8));
  };

  // ═══════════════════════════════════════════════════════════════
  // SEND OTP
  // ═══════════════════════════════════════════════════════════════

  const sendOTP = async () => {
    if (!digits || digits.length !== 8) {
      setMessage("Numéro incomplet (8 chiffres requis)");
      return;
    }

    setLoading(true);
    setMessage("");
    setDebugInfo(null);

    try {
      const fullPhone = "+226" + digits;
      console.log("[PhoneAuth] 📞 sendOTP:", fullPhone);

      // SÉCURITÉ : vérifier que appId existe AVANT l'appel
      const appId = appParams?.appId;
      if (!appId) {
        throw new Error("Configuration manquante: appId");
      }

      // ✅ FIX 403: Utiliser URL absolue vers cdl.base44.app (app subdomain, pas platform domain)
      const url = `https://cdl.base44.app/api/apps/${appId}/functions/sendOTP`;
      console.log("[PhoneAuth] URL:", url);

      // Timeout + retry logic
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: fullPhone }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      
      if (!res.ok && res.status === 404) {
        throw new Error("Endpoint non trouvé — vérifier appId ou URL de la fonction");
      }

      const data = await res.json();
      console.log("[PhoneAuth] Réponse:", { status: res.status, success: data?.success });

      setDebugInfo({
        endpoint: url,
        status: res.status,
        phone: fullPhone,
        response: data,
      });

      // ✅ SUCCESS : passer à la vérification
      if (data?.success === true) {
        console.log("[PhoneAuth] ✅ OTP envoyé");
        setStep("code");
        setMessage("");
        setShowDebug(false);
      } else {
        // ❌ ERREUR : afficher Twilio + fallback
        console.error("[PhoneAuth] ❌ Erreur Twilio:", data);
        const errorMsg = 
          data?.twilio_message || 
          data?.error || 
          `Erreur ${res.status}`;
        setMessage(errorMsg);
        setShowDebug(true);
      }
    } catch (err) {
      console.error("[PhoneAuth] Exception:", err?.message);
      setLoading(false);
      
      // Différencier les types d'erreurs
      if (err?.name === "AbortError") {
        setMessage("⏱️ Timeout — vérifier la connexion réseau");
      } else if (err?.message?.includes("Configuration")) {
        setMessage("🔴 Erreur config — contacter support");
      } else {
        setMessage("❌ Erreur réseau: " + (err?.message || "inconnue"));
      }
      
      setDebugInfo({ 
        error: err?.message,
        stack: err?.stack?.split('\n')[0],
      });
      setShowDebug(true);
      return;
    } finally {
      if (loading) setLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // TEST SENDOTP DIRECTEMENT
  // ═══════════════════════════════════════════════════════════════

  const testSendOTP = async () => {
    console.log("[PhoneAuth] 🧪 TEST sendOTP");
    setLoading(true);
    setDebugInfo(null);

    try {
      const appId = appParams?.appId;
      if (!appId) {
        throw new Error("Configuration: appId manquant");
      }

      // ✅ FIX 403: Utiliser URL absolue vers cdl.base44.app
      const url = `https://cdl.base44.app/api/apps/${appId}/functions/sendOTP`;
      console.log("[PhoneAuth] TEST URL:", url);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: "+22655738247" }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok && res.status === 404) {
        throw new Error("Endpoint 404 — vérifier appId");
      }

      const data = await res.json();
      console.log("[PhoneAuth] TEST réponse:", { status: res.status, success: data?.success });

      setDebugInfo({
        test: "sendOTP",
        endpoint: url,
        appId: appId,
        phone: "+22655738247",
        status: res.status,
        success: data?.success,
        error: data?.error || data?.twilio_message,
      });
      setShowDebug(true);

      if (data?.success === true) {
        setMessage("✅ TEST OK — Twilio fonctionne !");
      } else {
        setMessage(`❌ Erreur: ${data?.twilio_message || data?.error || "inconnue"}`);
      }
    } catch (err) {
      console.error("[PhoneAuth] TEST erreur:", err?.message);
      
      let msg = "❌ TEST FAILED";
      if (err?.name === "AbortError") msg += " — Timeout (réseau ?)";
      else if (err?.message?.includes("404")) msg += " — Endpoint 404";
      else if (err?.message?.includes("Configuration")) msg += " — Config error";
      else msg += " — " + (err?.message || "unknown");
      
      setMessage(msg);
      setDebugInfo({ 
        test: "sendOTP",
        error: err?.message,
        appId: appParams?.appId,
      });
      setShowDebug(true);
    } finally {
      setLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // VERIFY OTP
  // ═══════════════════════════════════════════════════════════════

  const verifyOTP = async () => {
    if (!code || code.length !== 6) {
      setMessage("Code doit contenir 6 chiffres");
      return;
    }

    if (!digits || digits.length !== 8) {
      setMessage("Numéro invalide — retour");
      setStep("phone");
      return;
    }

    setLoading(true);
    setMessage("");
    setDebugInfo(null);

    try {
      setStep("loading");

      // SÉCURITÉ : vérifier config avant appel
      const appId = appParams?.appId;
      if (!appId) {
        throw new Error("Configuration manquante: appId");
      }

      // ✅ FIX 403: Utiliser URL absolue vers cdl.base44.app
      const url = `https://cdl.base44.app/api/apps/${appId}/functions/verifyOTPWithRedirect`;
      const fullPhone = "+226" + digits;

      console.log("[PhoneAuth] Verify:", { phone: fullPhone, codeLength: code.length });

      // Timeout + retry
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: fullPhone,
          code,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok && res.status === 404) {
        throw new Error("Endpoint non trouvé");
      }

      const data = await res.json();
      console.log("[PhoneAuth] Verify réponse:", { status: res.status, success: data?.success });

      setDebugInfo({
        endpoint: url,
        status: res.status,
        phone: fullPhone,
        response: data,
      });

      // ✅ CODE BON : redirection automatique
      if (data?.success === true) {
        const redirectUrl = data?.redirect_url || "/";
        console.log("[PhoneAuth] ✅ Redirection vers:", redirectUrl);
        
        // Vérifier que l'URL commence par /
        const safeUrl = (redirectUrl || "").startsWith("/") ? redirectUrl : "/";
        setTimeout(() => {
          window.location.href = safeUrl;
        }, 800);
      } else {
        // ❌ CODE MAUVAIS : retour à l'écran de saisie
        setStep("code");
        const errorMsg = data?.error || data?.twilio_message || "Code incorrect ou expiré";
        setMessage(errorMsg);
        setShowDebug(true);
      }
    } catch (err) {
      console.error("[PhoneAuth] Verify erreur:", err?.message);
      setStep("code");
      
      if (err?.name === "AbortError") {
        setMessage("⏱️ Timeout — vérifier la connexion");
      } else if (err?.message?.includes("Configuration")) {
        setMessage("🔴 Erreur config — contacter support");
      } else {
        setMessage("❌ Erreur: " + (err?.message || "inconnue"));
      }
      
      setDebugInfo({
        error: err?.message,
        phone: "+226" + digits,
      });
      setShowDebug(true);
    } finally {
      setLoading(false);
    }
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
              type="text"
              inputMode="numeric"
              placeholder="________"
              value={digits}
              onChange={handlePhoneChange}
              maxLength="8"
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

          {/* BOUTON TEST VISIBLE */}
          <button
            style={styles.testButton}
            onClick={testSendOTP}
            disabled={loading}
          >
            🧪 Tester sendOTP
          </button>

          {message && <p style={styles.error}>{message}</p>}

          {/* AFFICHER DEBUG INFO SI PRÉSENT */}
          {showDebug && debugInfo && (
            <div style={styles.debugBox}>
              <p style={styles.debugTitle}>🔍 DEBUG INFO:</p>
              <pre style={styles.debugContent}>
                {JSON.stringify(debugInfo, null, 2)}
              </pre>
            </div>
          )}
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
            setDebugInfo(null);
            setShowDebug(false);
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

        {/* AFFICHER DEBUG INFO SI PRÉSENT */}
        {showDebug && debugInfo && (
          <div style={styles.debugBox}>
            <p style={styles.debugTitle}>🔍 DEBUG INFO:</p>
            <pre style={styles.debugContent}>
              {JSON.stringify(debugInfo, null, 2)}
            </pre>
          </div>
        )}
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
    overflowY: "auto",
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
  testButton: {
    width: "100%",
    padding: "10px",
    marginBottom: "12px",
    background: "#f0f0f0",
    color: "#666",
    border: "1px solid #ddd",
    borderRadius: "12px",
    fontWeight: "500",
    fontSize: "13px",
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
  debugBox: {
    marginTop: "16px",
    padding: "12px",
    background: "#f5f5f5",
    border: "1px solid #ddd",
    borderRadius: "8px",
    textAlign: "left",
  },
  debugTitle: {
    fontSize: "12px",
    fontWeight: "600",
    color: "#333",
    margin: "0 0 8px 0",
  },
  debugContent: {
    fontSize: "10px",
    fontFamily: "monospace",
    color: "#666",
    margin: "0",
    overflow: "auto",
    maxHeight: "200px",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
};