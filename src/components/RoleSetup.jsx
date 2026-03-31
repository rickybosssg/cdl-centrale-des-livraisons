import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Truck, User, Store, Megaphone } from "lucide-react";
import InscriptionPartenaire from "./InscriptionPartenaire";
import { base44 } from "@/api/base44Client";
import QuartierSelect from "./QuartierSelect";
import { toast } from "sonner";

const PUBLIC_ROLES = [
  { value: "livreur", label: "Livreur 🛵", icon: Truck, desc: "Gagner de l'argent avec des courses automatiques" },
  { value: "client", label: "Client", icon: User, desc: "Envoyer un colis rapidement" },
  { value: "partenaire", label: "Partenaire", icon: Store, desc: "Vendre plus grâce à CDL" },
  { value: "commercial", label: "Commercial", icon: Megaphone, desc: "Promouvoir CDL et gagner des commissions" },
];

export default function RoleSetup({ onComplete }) {
  const pendingRole = localStorage.getItem('cdl_pending_role');
  const [step, setStep] = useState(1);
  const [selectedRole, setSelectedRole] = useState(pendingRole || null);
  const [showPartenaire, setShowPartenaire] = useState(false);
  const ROLES = PUBLIC_ROLES;
  const [form, setForm] = useState({ telephone: "", whatsapp: "", quartier: "", code_promo: "" });
  const [checkingCode, setCheckingCode] = useState(false);
  const [codePromoApplique, setCodePromoApplique] = useState(null);
  const [livreursActifs, setLivreursActifs] = useState(null);
  const [moyenDeplacement, setMoyenDeplacement] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (pendingRole === 'partenaire') setShowPartenaire(true);
    base44.entities.User.filter({ user_type: 'livreur', disponible: true })
      .then(res => setLivreursActifs(res.length))
      .catch(() => {});
  }, []);

  const uploadFile = async (file) => {
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    return file_url;
  };

  const handleSubmit = async () => {
    if (selectedRole === "livreur" && moyenDeplacement.length === 0) {
      toast.error("Veuillez sélectionner au moins un mode de déplacement");
      return;
    }
    setLoading(true);
    let docUrls = {};
    if (selectedRole === "client" && form.code_promo.trim() && codePromoApplique) {
      const nouvNb = (codePromoApplique.nombre_utilisations || 0) + 1;
      await base44.entities.CodePromo.update(codePromoApplique.id, {
        nombre_utilisations: nouvNb,
        commission_due: (codePromoApplique.commission_due || 0) + 50,
        statut_paiement: "Doit",
      });
    }
    // ÉTAPE 1 : Sauvegarder le rôle (await obligatoire)
    await base44.auth.updateMe({
      user_type: selectedRole,
      onboarding_completed: true,
      user_roles: JSON.stringify([selectedRole]),
      statut_compte: selectedRole === 'client' ? 'actif' : 'en_attente',
      profil_valide: selectedRole === "client",
      docs_envoyes: selectedRole !== 'livreur', // livreur doit envoyer docs séparément
      statut_validation_livreur: selectedRole === "livreur" ? "en_attente" : undefined,
      statut_validation_commercial: selectedRole === "commercial" ? "en_attente" : undefined,
      statut_validation_partenaire: selectedRole === "partenaire" ? "en_attente" : undefined,
      verified: selectedRole === "client",
      total_courses: 0,
      commission_mode: true,
      solde_commission_du: 0,
      statut_financier_livreur: "À jour",
      livreur_bloque: false,
      moyen_deplacement: selectedRole === "livreur" ? JSON.stringify(moyenDeplacement) : undefined,
      code_promo_utilise: (selectedRole === "client" && codePromoApplique) ? codePromoApplique.code : undefined,
    });

    // ÉTAPE 2 : Forcer le refresh de session pour vider le cache
    const me = await base44.auth.me();
    console.log(`[RoleSetup] user_type après refresh session: ${me.user_type} (attendu: ${selectedRole})`);

    // ÉTAPE 3 : Appeler ensureUserProfile avec user_type explicite
    try {
      await base44.functions.invoke('ensureUserProfile', {
        user_type: selectedRole,
        onboarding_completed: true,
        context: 'after_role_setup',
      });
    } catch (_) {}
    if (selectedRole === "client") {
      await base44.functions.invoke('createClientOnSignup', {
        telephone: form.telephone,
        quartier: form.quartier,
      });
      // Notifier les admins pour client
      try {
        await base44.functions.invoke('notifyAdminNewSignup', {
          entity_name: 'Client',
          entity_data: {
            nom_complet: (await base44.auth.me()).full_name,
            telephone: form.telephone,
            quartier: form.quartier,
          },
        });
      } catch (_) {}
    }
    // Notifier les admins pour livreur
    if (selectedRole === "livreur") {
      try {
        await base44.functions.invoke('notifyAdminNewSignup', {
          entity_name: 'Livreur',
          entity_data: {
            nom_complet: (await base44.auth.me()).full_name,
            telephone: form.telephone,
            quartier: form.quartier,
          },
        });
      } catch (_) {}
    }
    // Notifier les admins pour partenaire
    if (selectedRole === "partenaire") {
      try {
        const meData = await base44.auth.me();
        await base44.functions.invoke('notifyAdminNewSignup', {
          entity_name: 'Partenaire',
          entity_data: {
            full_name: meData.full_name,
            telephone: form.telephone,
            quartier: form.quartier,
          },
        });
      } catch (_) {}
    }
    // Notifier les admins pour commercial
    if (selectedRole === "commercial") {
      try {
        const meData = await base44.auth.me();
        await base44.functions.invoke('notifyAdminNewSignup', {
          entity_name: 'CodePromo',
          entity_data: {
            full_name: meData.full_name,
            telephone: form.telephone,
            quartier: form.quartier,
          },
        });
      } catch (_) {}
    }
    setLoading(false);
    localStorage.removeItem('cdl_pending_role');
    onComplete();
  };

  if (showPartenaire) {
    return <InscriptionPartenaire onBack={() => setShowPartenaire(false)} onComplete={onComplete} />;
  }

  // ─── ÉTAPE 1 : Choix du profil ───
  if (step === 1) {
    return (
      <div className="min-h-screen flex flex-col p-4 bg-gradient-to-br from-primary to-blue-700">
        <div className="w-full max-w-sm mx-auto space-y-5 pt-6 pb-10">

          {/* Logo */}
          <div className="flex items-center gap-3">
            <img src="https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg" alt="CDL" className="h-12 w-12 rounded-xl object-cover" />
            <div>
              <h1 className="text-xl font-bold text-white">CDL APP</h1>
              <p className="text-xs text-white/70">Centrale des Livraisons — Ouagadougou</p>
            </div>
          </div>

          {/* Bloc recrutement livreur */}
          <div className="rounded-2xl bg-gradient-to-br from-primary to-blue-700 text-white p-5 space-y-3 shadow-lg">
            <p className="text-base font-bold leading-snug">🛵 Tu es livreur à Ouagadougou ?</p>
            <p className="text-sm opacity-90">Reçois plus de courses automatiquement avec CDL.</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {["✅ Plus de clients", "⚡ Moins d'attente", "💰 Paiement rapide", "🕐 Travail flexible"].map(v => (
                <div key={v} className="bg-white/20 rounded-lg px-2 py-1.5 text-center font-medium">{v}</div>
              ))}
            </div>
            <div className="bg-white/25 rounded-xl p-3 text-center">
              <p className="text-sm font-bold">🎁 0% de commission pendant 7 jours</p>
              <p className="text-xs opacity-80">Pour les nouveaux livreurs inscrits</p>
            </div>
            {livreursActifs !== null && (
              <p className="text-xs opacity-80 text-center">👥 +{livreursActifs} livreurs actifs sur CDL maintenant</p>
            )}
          </div>

          {/* Choix profil */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-center text-white">Choisissez votre profil</p>
            {ROLES.map((role) => {
              const Icon = role.icon;
              const isLivreur = role.value === 'livreur';
              return (
                <Card
                  key={role.value}
                  className={`cursor-pointer transition-all press-effect ${
                    selectedRole === role.value
                      ? 'ring-2 ring-white border-white shadow-md bg-white/20'
                      : isLivreur
                        ? 'border-2 border-white/70 bg-white/15 hover:bg-white/25'
                        : 'bg-white/10 border-white/20 hover:bg-white/20'
                  }`}
                  onClick={() => setSelectedRole(role.value)}
                >
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className={`h-12 w-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      isLivreur ? 'bg-primary' : 'bg-primary/10'
                    }`}>
                      <Icon className={`h-6 w-6 ${isLivreur ? 'text-white' : 'text-primary'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold text-white`}>{role.label}</p>
                      <p className="text-xs text-white/70">{role.desc}</p>
                    </div>
                    {isLivreur && (
                      <span className="text-[10px] bg-primary text-white rounded-full px-2 py-0.5 font-bold flex-shrink-0">
                        RECOMMANDÉ
                      </span>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Button
            className="w-full h-12 text-base font-semibold bg-white text-primary hover:bg-white/90"
            disabled={!selectedRole}
            onClick={() => {
              if (selectedRole === 'partenaire') setShowPartenaire(true);
              else setStep(2);
            }}
          >
            Commencer maintenant →
          </Button>
        </div>
      </div>
    );
  }

  // ─── ÉTAPE 2 : Formulaire ───
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm space-y-5 py-6">

        {/* Header motivation */}
        {selectedRole === "livreur" && (
          <div className="rounded-2xl bg-gradient-to-br from-primary to-blue-600 text-white p-4 text-center space-y-1">
            <p className="text-sm font-bold">🚀 Inscription rapide</p>
            <p className="text-xs opacity-90">Tu es à une étape de recevoir tes premières courses sur CDL</p>
            <p className="text-xs font-semibold bg-white/20 rounded-lg py-1 mt-2">🎁 0% commission pendant 7 jours</p>
          </div>
        )}

        <div className="text-center space-y-1">
          <h2 className="text-xl font-bold">Complétez votre profil</h2>
          <p className="text-sm text-muted-foreground">
            {selectedRole === "livreur" ? "Quelques infos rapides" : "Informations client"}
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Numéro de téléphone *</Label>
            <Input
              placeholder="+226 XX XX XX XX"
              value={form.telephone}
              onChange={(e) => setForm({ ...form, telephone: e.target.value })}
            />
          </div>

          {selectedRole !== "livreur" && (
            <div className="space-y-2">
              <Label>Numéro WhatsApp</Label>
              <Input
                placeholder="Même numéro si identique"
                value={form.whatsapp}
                onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>{selectedRole === "livreur" ? "Zone habituelle de travail *" : "Quartier *"}</Label>
            <QuartierSelect
              value={form.quartier}
              onValueChange={(v) => setForm({ ...form, quartier: v })}
              placeholder={selectedRole === "livreur" ? "Où travaillez-vous le plus ?" : "Votre quartier"}
            />
          </div>

          {selectedRole === "livreur" && (
            <div className="space-y-3">
              <p className="text-sm font-semibold">🚗 Mode(s) de déplacement *</p>
              <div className="space-y-2">
                {[{val: "moto", label: "🛵 Motocyclette"}, {val: "vehicule", label: "🚗 Véhicule"}].map(mode => (
                  <button
                    key={mode.val}
                    onClick={() => setMoyenDeplacement(prev =>
                      prev.includes(mode.val)
                        ? prev.filter(m => m !== mode.val)
                        : [...prev, mode.val]
                    )}
                    className={`w-full p-3 rounded-lg border-2 transition-all font-medium ${
                      moyenDeplacement.includes(mode.val)
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card hover:border-primary/50"
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedRole === "client" && (
            <div className="space-y-2">
              <Label>Code promotionnel (optionnel)</Label>
              {codePromoApplique ? (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200">
                  <span className="text-green-700 text-sm font-bold flex-1">✅ {codePromoApplique.code} — -15% sur votre 1ère course !</span>
                  <button onClick={() => { setCodePromoApplique(null); setForm(f => ({ ...f, code_promo: "" })); }} className="text-xs text-red-500">Retirer</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    placeholder="Entrez un code promo..."
                    value={form.code_promo}
                    onChange={e => setForm({ ...form, code_promo: e.target.value.toUpperCase() })}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={checkingCode || !form.code_promo.trim()}
                    onClick={async () => {
                      setCheckingCode(true);
                      const codes = await base44.entities.CodePromo.filter({ code: form.code_promo, statut: "valide", actif: true });
                      if (codes.length === 0) { toast.error("Code promo invalide ou non activé"); }
                      else { setCodePromoApplique(codes[0]); toast.success(`Code ${form.code_promo} appliqué ! -15% sur votre 1ère course 🎉`); }
                      setCheckingCode(false);
                    }}
                  >
                    {checkingCode ? "..." : "OK"}
                  </Button>
                </div>
              )}
            </div>
          )}

        </div>

        {selectedRole === "livreur" && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
            <p className="text-sm font-semibold text-amber-800">📋 Étape suivante</p>
            <p className="text-xs text-amber-700 mt-1">Après inscription, vous devrez envoyer vos documents (selfie, CNI, photo du véhicule) pour activer votre compte.</p>
          </div>
        )}


            <div className="flex gap-2">
          <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
            Retour
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!form.telephone || !form.quartier || loading || (selectedRole === "livreur" && moyenDeplacement.length === 0)}
            className="flex-1 h-11 font-semibold"
          >
            {loading ? "Enregistrement..." : selectedRole === "livreur" ? "🛵 Créer mon compte →" : "Commencer"}
          </Button>
        </div>
      </div>
    </div>
  );
}