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
  const [step, setStep] = useState("choice"); // "choice", "login", "signup_role", "signup_form"
  const [loginEmail, setLoginEmail] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [signupForm, setSignupForm] = useState({ nom_complet: "", email: "", password: "", telephone: "" });
  const [signupLoading, setSignupLoading] = useState(false);

  const handleLogin = async () => {
    if (!loginEmail.trim()) {
      toast.error("Veuillez entrer votre email");
      return;
    }
    setLoginLoading(true);
    try {
      await base44.auth.redirectToLogin();
    } catch (err) {
      toast.error("Erreur lors de la connexion");
      setLoginLoading(false);
    }
  };

  const handleSignupRole = (role) => {
    setSelectedRole(role);
    setStep("signup_form");
  };

  const handleSignupForm = async () => {
    if (!signupForm.nom_complet.trim() || !signupForm.email.trim() || !signupForm.password.trim() || !signupForm.telephone.trim()) {
      toast.error("Veuillez remplir tous les champs");
      return;
    }
    setSignupLoading(true);
    try {
      const newUser = await base44.auth.signup({
        email: signupForm.email,
        password: signupForm.password,
        full_name: signupForm.nom_complet,
        telephone: signupForm.telephone,
        user_type: selectedRole,
        user_roles: JSON.stringify([selectedRole]),
        profil_valide: false,
      });
      toast.success("Compte créé! Vérifiez votre email et connectez-vous.");
      setStep("choice");
      setSignupForm({ nom_complet: "", email: "", password: "", telephone: "" });
      setSelectedRole(null);
      setShowPassword(false);
    } catch (err) {
      toast.error("Erreur: " + (err.message || err));
    } finally {
      setSignupLoading(false);
    }
  };

  // Choix initial
  if (step === "choice") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary to-blue-700 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-8 text-white">
          {/* Logo */}
          <div className="text-center space-y-3">
            <div className="h-16 w-16 rounded-2xl bg-white flex items-center justify-center text-primary font-bold text-2xl mx-auto">
              CDL
            </div>
            <h1 className="text-3xl font-bold">CDL APP</h1>
            <p className="text-sm opacity-90">Centrale des Livraisons — Ouagadougou</p>
          </div>

          {/* Description */}
          <div className="text-center space-y-2">
            <p className="text-lg font-semibold">Bienvenue sur CDL</p>
            <p className="text-sm opacity-80">Connectez-vous ou créez un compte pour commencer</p>
          </div>

          {/* Boutons */}
          <div className="space-y-3">
            <Button
              size="lg"
              variant="default"
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

          {/* Info */}
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
          <button
            onClick={() => setStep("choice")}
            className="text-sm text-primary hover:underline flex items-center gap-1"
          >
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

            <Button
              className="w-full h-11 text-base font-semibold"
              onClick={handleLogin}
              disabled={loginLoading}
            >
              {loginLoading ? "Connexion..." : "Se connecter"}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>

          <div className="text-center text-xs text-muted-foreground">
            <p>Vous serez redirigé vers la page de connexion CDL</p>
          </div>
        </div>
      </div>
    );
  }

  // Inscription - Étape 1 : Choix du profil
  if (step === "signup_role") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary to-blue-700 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6 text-white">
          <button
            onClick={() => setStep("choice")}
            className="text-sm opacity-80 hover:opacity-100 flex items-center gap-1"
          >
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

  // Inscription - Étape 2 : Email et mot de passe
  if (step === "signup_form") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6">
          <button
            onClick={() => setStep("signup_role")}
            className="text-sm text-primary hover:underline flex items-center gap-1"
          >
            ← Retour
          </button>

          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold">Créer un compte</h2>
            <p className="text-sm text-muted-foreground">Étape 2 : Vos identifiants</p>
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

            <Button
              className="w-full h-11 text-base font-semibold"
              onClick={handleSignupForm}
              disabled={signupLoading}
            >
              {signupLoading ? "Création..." : "Créer mon compte"}
            </Button>
          </div>

          <div className="text-xs text-center text-muted-foreground">
            <p>Un email de confirmation vous sera envoyé</p>
          </div>
        </div>
      </div>
    );
  }
}