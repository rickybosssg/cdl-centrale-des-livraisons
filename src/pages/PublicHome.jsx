import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowRight, User, Plus } from "lucide-react";
import { base44 } from "@/api/base44Client";
import RoleSetup from "@/components/RoleSetup";
import { toast } from "sonner";

export default function PublicHome() {
  const [step, setStep] = useState("choice"); // "choice", "login", "signup", "signup_basic"
  const [loginEmail, setLoginEmail] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [signupForm, setSignupForm] = useState({ nom_complet: "", email: "", telephone: "" });
  const [signupLoading, setSignupLoading] = useState(false);
  const [userCreated, setUserCreated] = useState(false);

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
              onClick={() => setStep("signup")}
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

  // Inscription - Étape 1 : Infos de base
  if (step === "signup" && !userCreated) {
    const handleSignupBasic = async () => {
      if (!signupForm.nom_complet.trim() || !signupForm.email.trim() || !signupForm.telephone.trim()) {
        toast.error("Veuillez remplir tous les champs");
        return;
      }
      setSignupLoading(true);
      try {
        await base44.auth.updateMe({
          full_name: signupForm.nom_complet,
          telephone: signupForm.telephone,
        });
        toast.success("Compte créé! Choisissez votre profil.");
        setUserCreated(true);
      } catch (err) {
        toast.error("Erreur: " + (err.message || err));
      } finally {
        setSignupLoading(false);
      }
    };

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
            <h2 className="text-2xl font-bold">Créer un compte</h2>
            <p className="text-sm text-muted-foreground">Étape 1 : Informations de base</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nom complet *</label>
              <Input
                placeholder="Votre nom"
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
              <label className="text-sm font-medium">Téléphone *</label>
              <Input
                placeholder="+226 XX XX XX XX"
                value={signupForm.telephone}
                onChange={(e) => setSignupForm({ ...signupForm, telephone: e.target.value })}
              />
            </div>

            <Button
              className="w-full h-11 text-base font-semibold"
              onClick={handleSignupBasic}
              disabled={signupLoading}
            >
              {signupLoading ? "Création..." : "Continuer →"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Inscription - Étape 2 : Choix du profil et infos spécifiques
  if (step === "signup" && userCreated) {
    return (
      <RoleSetup
        onComplete={() => window.location.reload()}
        isAdmin={false}
      />
    );
  }
}