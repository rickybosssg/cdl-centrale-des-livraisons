import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Phone, ArrowRight, CheckCircle2, AlertCircle, Loader } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function PhoneAuth() {
  const [step, setStep] = useState("phone"); // phone | otp | success
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [otpDebug, setOtpDebug] = useState(""); // Pour affichage en dev
  const [otpKey, setOtpKey] = useState("");

  // Étape 1: Demander le code OTP
  const handleRequestOTP = async () => {
    if (!phone || phone.replace(/\D/g, "").length < 9) {
      setError("Entrez un numéro valide (9+ chiffres)");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const normalized = "+226" + phone.replace(/\D/g, "").slice(-9);
      const response = await base44.functions.invoke("loginWithPhone", {
        step: "request",
        phone: normalized,
      });

      if (response.data?.success) {
        setOtpDebug(response.data.otp_debug); // DEBUG: afficher le code
        setOtpKey(response.data.otp_key);
        setStep("otp");
        toast.success("Code OTP envoyé!");
      } else {
        setError(response.data?.error || "Erreur");
      }
    } catch (err) {
      setError("Erreur: " + err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Étape 2: Vérifier l'OTP
  const handleVerifyOTP = async () => {
    if (!otp || otp.length < 4) {
      setError("Entrez un code valide");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const normalized = "+226" + phone.replace(/\D/g, "").slice(-9);
      const response = await base44.functions.invoke("loginWithPhone", {
        step: "verify",
        phone: normalized,
        otp,
        otp_key: otpKey,
      });

      if (response.data?.success) {
        setStep("success");
        toast.success("Connexion réussie!");
        setTimeout(() => {
          window.location.href = "/";
        }, 2000);
      } else {
        setError(response.data?.error || "Code invalide");
        toast.error("Code OTP invalide");
      }
    } catch (err) {
      setError("Erreur: " + err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-blue-100/20 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg">
        {/* Logo & Titre */}
        <CardHeader className="text-center space-y-2">
          <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center mx-auto">
            <Phone className="h-6 w-6 text-white" />
          </div>
          <CardTitle className="text-2xl">CDL Connexion</CardTitle>
          <p className="text-xs text-muted-foreground">Connectez-vous avec votre numéro</p>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* ÉTAPE 1: ENTRER LE NUMÉRO */}
          {step === "phone" && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium">Numéro de téléphone</label>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm font-medium text-muted-foreground">+226</span>
                  <Input
                    type="tel"
                    placeholder="XXXXXXXX"
                    value={phone.replace(/\D/g, "").slice(-8)}
                    onChange={(e) => {
                      let val = e.target.value.replace(/\D/g, "").slice(0, 8);
                      setPhone(val);
                      setError("");
                    }}
                    maxLength="8"
                    className="flex-1 text-lg tracking-wider"
                    disabled={loading}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Format : 25 123 456</p>
              </div>

              {error && (
                <div className="p-2 rounded-lg bg-red-50 border border-red-200 flex gap-2">
                  <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">{error}</p>
                </div>
              )}

              <Button
                className="w-full"
                onClick={handleRequestOTP}
                disabled={loading || phone.replace(/\D/g, "").length < 8}
              >
                {loading ? (
                  <>
                    <Loader className="h-4 w-4 mr-2 animate-spin" />
                    Envoi du code...
                  </>
                ) : (
                  <>
                    Recevoir un code
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>

              <p className="text-[10px] text-muted-foreground text-center">
                Vous recevrez un code par SMS ou WhatsApp
              </p>
            </div>
          )}

          {/* ÉTAPE 2: ENTRER L'OTP */}
          {step === "otp" && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                <p className="text-xs text-blue-700">
                  Code envoyé à <strong>+226 {phone.replace(/\D/g, "").slice(-8).slice(0, 3)} ••• {phone.replace(/\D/g, "").slice(-2)}</strong>
                </p>
              </div>

              <div>
                <label className="text-xs font-medium">Code de vérification</label>
                <Input
                  type="text"
                  placeholder="0000"
                  value={otp}
                  onChange={(e) => {
                    let val = e.target.value.replace(/\D/g, "").slice(0, 6);
                    setOtp(val);
                    setError("");
                  }}
                  maxLength="6"
                  className="mt-1 text-lg tracking-widest text-center font-mono"
                  disabled={loading}
                  autoFocus
                />
              </div>

              {/* DEBUG: Afficher le code en dev */}
              {otpDebug && (
                <div className="p-2 rounded-lg bg-yellow-50 border border-yellow-200">
                  <p className="text-[10px] text-yellow-700">
                    <strong>DEBUG:</strong> Code = <strong>{otpDebug}</strong>
                  </p>
                </div>
              )}

              {error && (
                <div className="p-2 rounded-lg bg-red-50 border border-red-200 flex gap-2">
                  <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">{error}</p>
                </div>
              )}

              <Button
                className="w-full"
                onClick={handleVerifyOTP}
                disabled={loading || otp.length < 4}
              >
                {loading ? (
                  <>
                    <Loader className="h-4 w-4 mr-2 animate-spin" />
                    Vérification...
                  </>
                ) : (
                  <>
                    Vérifier le code
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                className="w-full text-xs"
                onClick={() => {
                  setStep("phone");
                  setOtp("");
                  setOtpDebug("");
                }}
                disabled={loading}
              >
                ← Changer le numéro
              </Button>
            </div>
          )}

          {/* ÉTAPE 3: SUCCÈS */}
          {step === "success" && (
            <div className="space-y-3 text-center py-4">
              <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto" />
              <div>
                <p className="font-bold text-green-700">Connexion réussie!</p>
                <p className="text-xs text-muted-foreground mt-1">Redirection en cours...</p>
              </div>
            </div>
          )}
        </CardContent>

        {/* Footer */}
        <div className="px-6 py-3 border-t text-center text-[10px] text-muted-foreground">
          Première connexion ? Un compte sera créé automatiquement
        </div>
      </Card>
    </div>
  );
}