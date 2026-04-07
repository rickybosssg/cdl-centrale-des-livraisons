import { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ArrowRight, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

export default function PhoneAuth() {
  const [step, setStep] = useState("phone"); // phone | otp | success
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [otpDebug, setOtpDebug] = useState("");
  const [otpKey, setOtpKey] = useState("");
  const [resendTimer, setResendTimer] = useState(0);
  const otpRefs = useRef([]);

  // Timer renvoi code
  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setTimeout(() => setResendTimer(r => r - 1), 1000);
    return () => clearTimeout(t);
  }, [resendTimer]);

  const cleanPhone = phone.replace(/\D/g, "");
  const otpValue = otp.join("");

  // ── Étape 1 : demander le code ──────────────────────────────────
  const handleRequestOTP = async () => {
    if (!/^[0-9]{8}$/.test(cleanPhone)) {
      setError("Entrez un numéro burkinabè valide à 8 chiffres");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const normalized = "+226" + cleanPhone;
      const res = await base44.functions.invoke("loginWithPhone", {
        step: "request",
        phone: normalized,
      });
      if (res.data?.success) {
        setOtpDebug(res.data.otp_debug || "");
        setOtpKey(res.data.otp_key || "");
        setStep("otp");
        setResendTimer(60);
        toast.success("Code envoyé !");
        setTimeout(() => otpRefs.current[0]?.focus(), 200);
      } else {
        setError(res.data?.error || "Impossible d'envoyer le code, veuillez réessayer");
      }
    } catch {
      setError("Impossible d'envoyer le code pour le moment, veuillez réessayer");
    } finally {
      setLoading(false);
    }
  };

  // ── Étape 2 : vérifier le code ──────────────────────────────────
  const handleVerifyOTP = async () => {
    if (otpValue.length < 4) {
      setError("Entrez le code reçu");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await base44.functions.invoke("loginWithPhone", {
        step: "verify",
        phone: "+226" + cleanPhone,
        otp: otpValue,
        otp_key: otpKey,
      });
      if (res.data?.success) {
        setStep("success");
        setTimeout(() => { window.location.href = "/"; }, 1800);
      } else {
        setError(res.data?.error || "Code incorrect, veuillez réessayer");
        setOtp(["", "", "", "", "", ""]);
        setTimeout(() => otpRefs.current[0]?.focus(), 100);
      }
    } catch {
      setError("Erreur de vérification, veuillez réessayer");
    } finally {
      setLoading(false);
    }
  };

  // Gestion saisie OTP case par case
  const handleOtpChange = (idx, val) => {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[idx] = digit;
    setOtp(next);
    setError("");
    if (digit && idx < 5) otpRefs.current[idx + 1]?.focus();
    if (next.join("").length === 6) {
      // Auto-submit
      setTimeout(() => {
        if (next.every(d => d !== "")) handleVerifyOTPDirect(next.join(""));
      }, 100);
    }
  };

  const handleOtpKeyDown = (idx, e) => {
    if (e.key === "Backspace" && !otp[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus();
    }
  };

  const handleVerifyOTPDirect = async (code) => {
    if (code.length < 4) return;
    setError("");
    setLoading(true);
    try {
      const res = await base44.functions.invoke("loginWithPhone", {
        step: "verify",
        phone: "+226" + cleanPhone,
        otp: code,
        otp_key: otpKey,
      });
      if (res.data?.success) {
        setStep("success");
        setTimeout(() => { window.location.href = "/"; }, 1800);
      } else {
        setError(res.data?.error || "Code incorrect, veuillez réessayer");
        setOtp(["", "", "", "", "", ""]);
        setTimeout(() => otpRefs.current[0]?.focus(), 100);
      }
    } catch {
      setError("Erreur de vérification, veuillez réessayer");
    } finally {
      setLoading(false);
    }
  };

  const formattedPhone = `+226 ${cleanPhone.slice(0,2)} ${cleanPhone.slice(2,4)} ${cleanPhone.slice(4,6)} ${cleanPhone.slice(6,8)}`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary to-blue-700 flex flex-col">
      {/* Header */}
      <div className="flex flex-col items-center pt-14 pb-8 px-6 text-white">
        <img
          src="https://media.base44.com/images/public/69c3c74fc4b62396dca61751/1eb51398f_Screenshot_20260330_132434_WhatsApp.jpg"
          alt="CDL"
          className="h-16 w-16 rounded-2xl object-cover shadow-lg mb-4"
        />
        <h1 className="text-3xl font-extrabold tracking-tight">Bienvenue sur CDL</h1>
        <p className="text-sm text-white/80 mt-2 text-center max-w-xs leading-relaxed">
          {step === "phone"
            ? "Entrez votre numéro pour accéder à votre compte ou créer un nouveau compte"
            : step === "otp"
            ? `Entrez le code envoyé à votre numéro`
            : "Connexion réussie"}
        </p>
      </div>

      {/* Card */}
      <div className="flex-1 bg-background rounded-t-3xl px-6 pt-8 pb-12">

        {/* ── STEP 1: TÉLÉPHONE ── */}
        {step === "phone" && (
          <div className="space-y-6 max-w-sm mx-auto">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Numéro de téléphone</label>
              <div className="flex items-stretch gap-0 rounded-xl overflow-hidden border-2 border-input focus-within:border-primary transition-colors bg-white shadow-sm">
                <div className="flex items-center px-4 bg-muted border-r border-input">
                  <span className="text-sm font-bold text-foreground whitespace-nowrap">🇧🇫 +226</span>
                </div>
                <input
                  type="tel"
                  inputMode="numeric"
                  placeholder="66 92 51 90"
                  value={phone}
                  onChange={e => {
                    setPhone(e.target.value.replace(/\D/g, "").slice(0, 8));
                    setError("");
                  }}
                  maxLength={8}
                  className="flex-1 px-4 py-4 text-xl font-mono tracking-widest outline-none bg-transparent text-foreground placeholder:text-muted-foreground/50"
                  disabled={loading}
                  autoFocus
                />
              </div>
              <p className="text-xs text-muted-foreground pl-1">Format attendu : 8 chiffres</p>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200">
                <span className="text-red-500 flex-shrink-0 mt-0.5">⚠️</span>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <button
              onClick={handleRequestOTP}
              disabled={loading || cleanPhone.length !== 8}
              className="w-full h-14 rounded-2xl bg-primary text-white font-bold text-base flex items-center justify-center gap-2 shadow-lg shadow-primary/30 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
            >
              {loading ? (
                <><Loader2 className="h-5 w-5 animate-spin" /> Envoi du code...</>
              ) : (
                <>Recevoir mon code <ArrowRight className="h-5 w-5" /></>
              )}
            </button>

            <p className="text-xs text-muted-foreground text-center leading-relaxed">
              Un code de vérification vous sera envoyé pour sécuriser votre accès.<br />
              Vous avez déjà un compte ? Entrez simplement votre numéro.
            </p>

            <p className="text-[10px] text-muted-foreground/60 text-center">
              En continuant, vous acceptez les{" "}
              <a href="/cgu" className="underline">conditions d'utilisation</a> de CDL
            </p>
          </div>
        )}

        {/* ── STEP 2: OTP ── */}
        {step === "otp" && (
          <div className="space-y-6 max-w-sm mx-auto">
            <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20 text-center">
              <p className="text-sm font-semibold text-primary">{formattedPhone}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Code envoyé avec succès</p>
            </div>

            {/* Champs OTP */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Code de vérification</label>
              <div className="flex gap-2 justify-between">
                {otp.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={el => otpRefs.current[idx] = el}
                    type="tel"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleOtpChange(idx, e.target.value)}
                    onKeyDown={e => handleOtpKeyDown(idx, e)}
                    disabled={loading}
                    className="flex-1 h-14 rounded-xl border-2 border-input text-center text-2xl font-bold font-mono outline-none focus:border-primary bg-white text-foreground transition-colors disabled:opacity-50"
                  />
                ))}
              </div>
            </div>

            {/* DEBUG */}
            {otpDebug && (
              <div className="p-2 rounded-lg bg-yellow-50 border border-yellow-200 text-center">
                <p className="text-xs text-yellow-700"><strong>DEBUG:</strong> Code = <strong>{otpDebug}</strong></p>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200">
                <span className="text-red-500 flex-shrink-0 mt-0.5">⚠️</span>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <button
              onClick={handleVerifyOTP}
              disabled={loading || otpValue.length < 4}
              className="w-full h-14 rounded-2xl bg-primary text-white font-bold text-base flex items-center justify-center gap-2 shadow-lg shadow-primary/30 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
            >
              {loading ? (
                <><Loader2 className="h-5 w-5 animate-spin" /> Vérification...</>
              ) : (
                <>Vérifier le code <ArrowRight className="h-5 w-5" /></>
              )}
            </button>

            <div className="flex flex-col items-center gap-3">
              {resendTimer > 0 ? (
                <p className="text-xs text-muted-foreground">Renvoyer dans {resendTimer}s</p>
              ) : (
                <button
                  onClick={handleRequestOTP}
                  disabled={loading}
                  className="flex items-center gap-1.5 text-sm text-primary font-semibold"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Renvoyer le code
                </button>
              )}
              <button
                onClick={() => { setStep("phone"); setOtp(["","","","","",""]); setError(""); }}
                disabled={loading}
                className="text-xs text-muted-foreground underline"
              >
                ← Changer de numéro
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: SUCCÈS ── */}
        {step === "success" && (
          <div className="flex flex-col items-center justify-center py-16 space-y-4 max-w-sm mx-auto text-center">
            <div className="h-20 w-20 rounded-full bg-green-100 flex items-center justify-center">
              <span className="text-4xl">✅</span>
            </div>
            <p className="text-2xl font-extrabold text-green-700">Connexion réussie !</p>
            <p className="text-sm text-muted-foreground">Redirection en cours...</p>
            <div className="w-6 h-6 border-4 border-green-200 border-t-green-600 rounded-full animate-spin mt-2" />
          </div>
        )}
      </div>
    </div>
  );
}