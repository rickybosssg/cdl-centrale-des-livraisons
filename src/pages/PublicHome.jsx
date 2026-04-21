import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, User, Plus, Eye, EyeOff, Truck, Users, Store, Megaphone } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

const ROLES = [
  { value: "client", label: "Client", icon: Users, desc: "Commander des livraisons" },
  { value: "livreur", label: "Livreur", icon: Truck, desc: "Effectuer des livraisons" },
  { value: "partenaire", label: "Partenaire", icon: Store, desc: "Vitrine commerce" },
  { value: "commercial", label: "Commercial", icon: Megaphone, desc: "Promouvoir CDL" },
];

export default function PublicHome() {
  const [step, setStep] = useState("choice");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [selectedRole, setSelectedRole] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [signupForm, setSignupForm] = useState({ nom_complet: "", email: "", password: "", telephone: "" });
  const [signupLoading, setSignupLoading] = useState(false);
  const [signupError, setSignupError] = useState("");

  const handleLogin = async () => {
    setLoginError("");
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setLoginError("Veuillez entrer votre email et mot de passe");
      return;
    }
    setLoginLoading(true);
    try {
      await base44.auth.login({ email: loginEmail, password: loginPassword });
      window.location.reload();
    } catch (err) {
      setLoginError("Email ou mot de passe incorrect");
      setLoginLoading(false);
    }
  };

  const handleSignupRole = (role) => {
    setSelectedRole(role);
    setStep("signup_form");
  };

  const handleSignupForm = () => {
    localStorage.setItem('cdl_pending_role', selectedRole);
    // Dans APK Capacitor → navigation interne vers /connexion
    const isNative = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.();
    if (isNative) {
      window.history.replaceState({}, '', '/connexion');
      window.dispatchEvent(new PopStateEvent('popstate'));
    } else {
      base44.auth.redirectToLogin();
    }
  };

  // Choix initial
  if (step === "choice") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary to-blue-700 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-8 text-white">
          <div className="text-center space-y-3">
            <img src="https://media.base44.com/images/public/69c3c74fc4b62396dca61751/1eb51398f_Screenshot_20260330_132434_WhatsApp.jpg" alt="CDL" className="h-24 w-24 rounded-3xl mx-auto object-cover shadow-xl" />
            <h1 className="text-3xl font-bold">CDL APP</h1>
            <p className="text-sm opacity-90">Centrale des Livraisons — Ouagadougou</p>
          </div>
          <div className="text-center space-y-2">
            <p className="text-lg font-semibold">Bienvenue sur CDL</p>
            <p className="text-sm opacity-80">Connectez-vous ou créez un compte pour commencer</p>
          </div>
          <div className="space-y-3">
            <Button
              size="lg"
              className="w-full h-12 text-base font-semibold bg-white text-primary hover:bg-gray-100"
              onClick={() => setStep("login")}
            >
              <User className="h-5 w-5 mr-2" />
              Se connecter
            </Button>
            <Button
              size="lg"
              className="w-full h-12 text-base font-semibold bg-white text-primary hover:bg-gray-100"
              onClick={() => setStep("signup_role")}
            >
              <Plus className="h-5 w-5 mr-2" />
              Nouvel utilisateur
            </Button>
          </div>
          <div className="text-xs text-center opacity-70 space-y-1">
            <p>Déjà inscrit ? Cliquez sur "Se connecter"</p>
            <p>Première fois ? Cliquez sur "Nouvel utilisateur"</p>
          </div>
        </div>
      </div>
    );
  }

  // Connexion
  if (step === "login") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6">
          <button onClick={() => setStep("choice")} className="text-sm text-primary hover:underline flex items-center gap-1">
            ← Retour
          </button>
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold">Se connecter</h2>
            <p className="text-sm text-muted-foreground">Accédez à votre compte CDL</p>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                placeholder="votre.email@gmail.com"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Mot de passe</label>
              <div className="relative">
                <Input
                  type={showLoginPassword ? "text" : "password"}
                  placeholder="Votre mot de passe"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword(!showLoginPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {loginError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-sm text-red-700">{loginError}</p>
              </div>
            )}
            <Button className="w-full h-11 text-base font-semibold" onClick={handleLogin} disabled={loginLoading}>
              {loginLoading ? "Connexion..." : "Se connecter"}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
          <div className="text-center text-xs text-muted-foreground">
            <p>Pas encore de compte ? Cliquez sur "Nouvel utilisateur"</p>
          </div>
        </div>
      </div>
    );
  }

  // Succès inscription
  if (step === "login_after_signup") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <span className="text-3xl">✅</span>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-green-700">Compte créé !</h2>
            <p className="text-sm text-muted-foreground mt-2">Vérifiez votre email pour confirmer votre compte, puis connectez-vous.</p>
          </div>
          <Button className="w-full h-11" onClick={() => setStep("login")}>
            Se connecter
          </Button>
        </div>
      </div>
    );
  }

  // Inscription - Étape 1 : Choix du profil
  if (step === "signup_role") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary to-blue-700 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6 text-white">
          <button onClick={() => setStep("choice")} className="text-sm opacity-80 hover:opacity-100 flex items-center gap-1">
            ← Retour
          </button>
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold">Choisir votre profil</h2>
            <p className="text-sm opacity-80">Sélectionnez le profil qui vous correspond *</p>
          </div>
          <div className="space-y-3">
            {ROLES.map(role => {
              const Icon = role.icon;
              return (
                <button
                  key={role.value}
                  onClick={() => handleSignupRole(role.value)}
                  className="w-full p-4 rounded-xl bg-white/10 backdrop-blur border border-white/20 hover:bg-white/20 transition-all text-left flex items-center gap-3"
                >
                  <div className="h-10 w-10 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold">{role.label}</p>
                    <p className="text-xs opacity-80">{role.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Inscription - Étape 2 : Formulaire
  if (step === "signup_form") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6">
          <button onClick={() => setStep("signup_role")} className="text-sm text-primary hover:underline flex items-center gap-1">
            ← Retour
          </button>
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold">Créer un compte</h2>
            <p className="text-sm text-muted-foreground">Rôle : <strong>{selectedRole}</strong></p>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nom complet *</label>
              <Input
                placeholder="Votre nom complet"
                value={signupForm.nom_complet}
                onChange={(e) => setSignupForm({ ...signupForm, nom_complet: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email *</label>
              <Input
                type="email"
                placeholder="votre.email@gmail.com"
                value={signupForm.email}
                onChange={(e) => setSignupForm({ ...signupForm, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Mot de passe *</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Votre mot de passe sécurisé"
                  value={signupForm.password}
                  onChange={(e) => setSignupForm({ ...signupForm, password: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Téléphone *</label>
              <Input
                placeholder="+226 XX XX XX XX"
                value={signupForm.telephone}
                onChange={(e) => setSignupForm({ ...signupForm, telephone: e.target.value })}
              />
            </div>
            {signupError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-sm text-red-700">{signupError}</p>
              </div>
            )}
            <Button
              className="w-full h-11 text-base font-semibold"
              onClick={handleSignupForm}
              disabled={signupLoading}
              type="button"
            >
              {signupLoading ? "Création en cours..." : "Créer mon compte"}
            </Button>
          </div>
          <div className="text-xs text-center text-muted-foreground">
            <p>Un email de confirmation vous sera envoyé</p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}