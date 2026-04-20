/**
 * PhoneAuthOTP — Login via téléphone + OTP Twilio Verify
 * 
 * Étape 1 : Saisir le numéro → sendOTP()
 * Étape 2 : Saisir le code → verifyOTP() → authentification
 */
import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Phone, Lock, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function PhoneAuthOTP() {
  const [step, setStep] = useState('phone'); // 'phone' | 'otp' | 'success'
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSendOTP = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Valider le numéro
      const normalized = normalizePhone(phone);
      if (!normalized) {
        setError('Numéro invalide. Format: +226XXXXXXXX ou 0XXXXXXXX');
        setLoading(false);
        return;
      }

      // Envoyer OTP
      const res = await base44.functions.invoke('sendOTP', {
        phone: normalized,
      });

      if (res.data.success) {
        toast.success('Code OTP envoyé par SMS !');
        setPhone(normalized);
        setStep('otp');
      } else {
        setError(res.data.error || 'Erreur lors de l\'envoi');
      }
    } catch (err) {
      setError(err.message || 'Erreur réseau');
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!code || code.length !== 6) {
        setError('Code OTP doit contenir 6 chiffres');
        setLoading(false);
        return;
      }

      // Vérifier OTP
      const res = await base44.functions.invoke('verifyOTP', {
        phone: phone,
        code: code,
      });

      if (res.data.success) {
        toast.success('✅ Authentification réussie !');
        setStep('success');
        
        // Sauvegarder le token et rediriger après 1s
        setTimeout(() => {
          // Base44 gère l'auth automatiquement
          // On force un refresh du state auth
          window.location.href = '/';
        }, 1000);
      } else {
        setError(res.data.error || 'Code incorrect');
      }
    } catch (err) {
      setError(err.message || 'Erreur réseau');
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const normalizePhone = (input) => {
    let p = input.replace(/\s/g, '');
    if (!p.startsWith('+')) {
      if (p.startsWith('226')) {
        p = '+' + p;
      } else if (p.startsWith('0')) {
        p = '+226' + p.substring(1);
      } else {
        p = '+226' + p;
      }
    }
    if (!/^\+226\d{8}$/.test(p)) return null;
    return p;
  };

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-primary to-blue-700 p-6">
      <div className="w-full max-w-sm space-y-6">
        
        {/* Logo */}
        <div className="text-center">
          <img
            src="https://media.base44.com/images/public/69c3c74fc4b62396dca61751/1eb51398f_Screenshot_20260330_132434_WhatsApp.jpg"
            alt="CDL"
            className="h-20 w-20 rounded-2xl object-cover shadow-lg mx-auto"
          />
          <h1 className="text-2xl font-bold text-white mt-4">CDL</h1>
          <p className="text-sm text-white/80">Connexion par téléphone</p>
        </div>

        {/* Étape 1 : Saisir le numéro */}
        {step === 'phone' && (
          <form onSubmit={handleSendOTP} className="space-y-4">
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-white mb-2">
                  <Phone className="h-4 w-4 inline mr-2" />
                  Votre numéro de téléphone
                </label>
                <Input
                  type="tel"
                  placeholder="+226XXXXXXXX ou 0XXXXXXXX"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setError('');
                  }}
                  disabled={loading}
                  className="bg-white text-black border-0 h-12 placeholder:text-gray-400 font-semibold"
                />
                <p className="text-xs text-white/60 mt-2">
                  Format Burkina Faso : +226 suivi de 8 chiffres
                </p>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/20 border border-red-400 text-red-200 text-sm">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading || !phone}
                className="w-full h-12 bg-white text-primary hover:bg-gray-100 font-bold text-base"
              >
                {loading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Envoi...</>
                ) : (
                  <>Envoyer un code OTP</>
                )}
              </Button>
            </div>
          </form>
        )}

        {/* Étape 2 : Saisir le code OTP */}
        {step === 'otp' && (
          <form onSubmit={handleVerifyOTP} className="space-y-4">
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-white mb-2">
                  <Lock className="h-4 w-4 inline mr-2" />
                  Code OTP reçu par SMS
                </label>
                <Input
                  type="text"
                  placeholder="000000"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                    setError('');
                  }}
                  disabled={loading}
                  maxLength="6"
                  className="bg-white text-black text-center text-2xl tracking-widest border-0 h-12 font-bold"
                />
                <p className="text-xs text-white/60 mt-2">
                  Entrez les 6 chiffres reçus à {phone}
                </p>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/20 border border-red-400 text-red-200 text-sm">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading || code.length !== 6}
                className="w-full h-12 bg-white text-primary hover:bg-gray-100 font-bold text-base"
              >
                {loading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Vérification...</>
                ) : (
                  <>Vérifier le code</>
                )}
              </Button>

              <button
                type="button"
                onClick={() => {
                  setStep('phone');
                  setCode('');
                  setError('');
                }}
                className="w-full text-white/70 hover:text-white text-sm"
              >
                ← Revenir au numéro
              </button>
            </div>
          </form>
        )}

        {/* Étape 3 : Succès */}
        {step === 'success' && (
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 text-center space-y-4">
            <div className="flex justify-center">
              <div className="h-16 w-16 rounded-full bg-green-400/20 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-green-300" />
              </div>
            </div>
            <div>
              <p className="text-white font-bold text-lg">Authentification réussie !</p>
              <p className="text-white/70 text-sm mt-1">Redirection en cours...</p>
            </div>
          </div>
        )}

        {/* Séparateur */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-white/20" />
          <span className="text-white/50 text-xs">OU</span>
          <div className="flex-1 h-px bg-white/20" />
        </div>

        {/* Accès admin */}
        <div className="text-center">
          <button
            onClick={() => window.location.href = '/admin-login-secure'}
            className="text-white/80 hover:text-white text-sm font-semibold transition-colors"
          >
            Se connecter en tant qu'admin
          </button>
        </div>

        {/* Footer */}
        <p className="text-center text-white/60 text-xs">
          Aucun compte ? Un compte sera créé automatiquement.
        </p>
      </div>
    </div>
  );
}