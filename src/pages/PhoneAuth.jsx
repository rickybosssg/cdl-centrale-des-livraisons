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
  const [otpDebug, setOtpDebug] = useState("");
  const [otpKey, setOtpKey] = useState("");

  // Étape 1: Demander le code OTP
  const handleRequestOTP = async () => {
    const cleanPhone = phone.replace(/\D/g, "");
    if (!/^[0-9]{8}$/.test(cleanPhone)) {
      setError("Entrez un numéro burkinabè valide à 8 chiffres");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const normalized = "+226" + cleanPhone;
      const response = await base44.functions.invoke("loginWithPhone", {
        step: "request",
        phone: normalized,
      });

      if (response.data?.success) {
        setOtpDebug(response.data.otp_debug);
        setOtpKey(response.data.otp_key);
        setStep("otp");
        toast.success("Code OTP envoyé !");
      } else {
        setError(response.data?.error || "Impossible d'envoyer le code, veuillez réessayer");
      }
    } catch (err) {
      setError("Impossible d'envoyer le code pour le moment, veuillez réessayer");
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
      const cleanPhone = phone.replace(/\D/g, "");
      const normalized = "+226" + cleanPhone;
      const response = await base44.functions.invoke("loginWithPhone", {
        step: "verify",
        phone: normalized,
        otp,
        otp_key: otpKey,
      });

      if (response.data?.success) {
        setStep("success");
        toast.success("Connexion réussie !");
        setTimeout(() => {
          window.location.href = "/";
        }, 2000);
      } else {
        setError(response.data?.error || "Code invalide");
        toast.error("Code OTP invalide");
      }
    } catch (err) {
      setError("Erreur de vérification, veuillez réessayer");
    } finally {
      setLoading(false);
    }
  };

  const cleanPhoneForDisplay = phone.replace(/\D/g, "");

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-blue-100/20 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg">
        {/* Logo & Titre */}
        <CardHeader className="text-center space-y-2 pb-4">
          <div className="h-14 w-14 rounded-2xl bg-primary flex items-center justify-center mx-auto">
            <Phone className="h-7 w-7 text-white" />
          </div>
          <CardTitle className="text-2xl font-bold">CDL Connexion</CardTitle>
          <p className="text-sm text-muted-foreground">
            Connectez-vous ou créez votre compte avec votre numéro de téléphone
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* ÉTAPE 1: ENTRER LE NUMÉRO */}
          {step === "phone" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Numéro de téléphone</label>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg border bg-muted font-semibold text-sm text-foreground flex-shrink-0">
                    🇧🇫 +226
                  </div>
                  <Input
                    type="tel"
                    placeholder="66 92 51 90"
                    value={phone}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "").slice(0, 8);
                      setPhone(val);
                      setError("");
                    }}
                    maxLength={8}
                    className="flex-1 text-lg tracking-wider font-mono"
                    disabled={loading}
                    autoFocus
                    inputMode="numeric"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Format attendu : 8 chiffres</p>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex gap-2 items-start">
                  <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <Button
                className="w-full h-12 text-base font-semibold"
                onClick={handleRequestOTP}
                disabled={loading || cleanPhoneForDisplay.length !== 8}
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

              <p className="text-xs text-muted-foreground text-center">
                Vous recevrez un code de connexion par SMS ou WhatsApp selon la configuration disponible
              </p>

              <div className="pt-2 border-t text-center">
                <p className="text-xs text-muted-foreground">
                  Nouveau sur CDL ? Créez votre compte avec votre numéro de téléphone
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Déjà inscrit ? Recevez votre code de connexion
                </p>
              </div>
            </div>
          )}

          {/* ÉTAPE 2: ENTRER L'OTP */}
          {step === "otp" && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-green-50 border border-green-200">
                <p className="text-sm text-green-700 flex items-center gap-1">
                  <span>✓</span> Code envoyé au <strong>+226 {cleanPhoneForDisplay.slice(0, 2)} {cleanPhoneForDisplay.slice(2, 4)} {cleanPhoneForDisplay.slice(4, 6)} {cleanPhoneForDisplay.slice(6, 8)}</strong>
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Code de vérification</label>
                <Input
                  type="text"
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                    setOtp(val);
                    setError("");
                  }}
                  maxLength={6}
                  className="text-2xl tracking-widest text-center font-mono h-14"
                  disabled={loading}
                  autoFocus
                  inputMode="numeric"
                />
              </div>

              {/* DEBUG: Afficher le code en dev */}
              {otpDebug && (
                <div className="p-2 rounded-lg bg-yellow-50 border border-yellow-200">
                  <p className="text-xs text-yellow-700">
                    <strong>DEBUG:</strong> Code = <strong>{otpDebug}</strong>
                  </p>
                </div>
              )}

              {error && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex gap-2 items-start">
                  <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <Button
                className="w-full h-12 text-base font-semibold"
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
                className="w-full"
                onClick={() => {
                  setStep("phone");
                  setOtp("");
                  setOtpDebug("");
                  setError("");
                }}
                disabled={loading}
              >
                ← Changer le numéro
              </Button>
            </div>
          )}

          {/* ÉTAPE 3: SUCCÈS */}
          {step === "success" && (
            <div className="space-y-4 text-center py-6">
              <CheckCircle2 className="h-16 w-16 text-green-600 mx-auto" />
              <div>
                <p className="font-bold text-xl text-green-700">Connexion réussie !</p>
                <p className="text-sm text-muted-foreground mt-1">Redirection en cours...</p>
              </div>
            </div>
          )}
        </CardContent>

        {/* Footer */}
        <div className="px-6 py-3 border-t text-center text-xs text-muted-foreground">
          Première connexion ? Un compte sera créé automatiquement
        </div>
      </Card>
    </div>
  );
}