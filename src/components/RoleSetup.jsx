import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Truck, User, Store, Megaphone, PartyPopper } from "lucide-react";
import InscriptionPartenaire from "./InscriptionPartenaire";
import LivreurBienvenue from "./LivreurBienvenue";
import { base44 } from "@/api/base44Client";
import QuartierSelect from "./QuartierSelect";
import { toast } from "sonner";

const PUBLIC_ROLES = [
  { value: "livreur", label: "Livreur 🛵", icon: Truck, desc: "Gagner de l'argent avec des courses automatiques" },
  { value: "client", label: "Client", icon: User, desc: "Envoyer un colis rapidement" },
  { value: "partenaire", label: "Partenaire", icon: Store, desc: "Vendre plus grâce à CDL" },
  { value: "commercial", label: "Commercial 💼", icon: Megaphone, desc: "Parrainer et gagner 50 F par client validé" },
  { value: "annonceur", label: "Annonceur 📢", icon: Megaphone, desc: "Publier des publicités et promouvoir votre activité" },
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
  const [autoAppliedCode, setAutoAppliedCode] = useState(null);
  const [livreursActifs, setLivreursActifs] = useState(null);
  const [moyenDeplacement, setMoyenDeplacement] = useState([]);
  const [loading, setLoading] = useState(false);
  const [telError, setTelError] = useState("");

  const validateTelephone = (tel) => {
    if (!tel || !tel.trim()) return "Le numéro de téléphone est obligatoire";
    const cleaned = tel.replace(/[\s\-\.\(\)]/g, "");
    if (!/^(\+226|00226|0)?[0-9]{8,10}$/.test(cleaned)) return "Numéro invalide (ex: +22670000000 ou 70000000)";
    return "";
  };
  const [showLivreurBienvenue, setShowLivreurBienvenue] = useState(false);

  useEffect(() => {
    if (pendingRole === 'partenaire') setShowPartenaire(true);
    base44.entities.User.filter({ user_type: 'livreur', disponible: true })
      .then(res => setLivreursActifs(res.length))
      .catch(() => {});
    
    // Auto-fill promo code from URL param ?ref= ou ?promo= + localStorage
    const params = new URLSearchParams(window.location.search);
    const refCode = (params.get('ref') || params.get('promo') || '').toUpperCase().trim();
    if (refCode) {
      localStorage.setItem('cdl_promo_code', refCode);
    }
    const savedCode = localStorage.getItem('cdl_promo_code');
    if (savedCode) {
      setForm(f => ({ ...f, code_promo: savedCode }));
      setAutoAppliedCode(savedCode);
      // Auto-sélectionner CLIENT et aller directement à l'étape 2
      if (!pendingRole) {
        setSelectedRole('client');
        setStep(2);
      }
    }
  }, []);

  const uploadFile = async (file) => {
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    return file_url;
  };

  const handleSubmit = async () => {
    if (selectedRole === "livreur") {
      const err = validateTelephone(form.telephone);
      if (err) { setTelError(err); toast.error(err); return; }
    }
    if (selectedRole === "commercial") {
      const err = validateTelephone(form.telephone);
      if (err) { setTelError(err); toast.error(err); return; }
    }
    if (selectedRole === "livreur" && moyenDeplacement.length === 0) {
      toast.error("Veuillez sélectionner au moins un mode de déplacement");
      return;
    }
    setLoading(true);
    let docUrls = {};

    // Résoudre le codePromoApplique si non encore résolu (cas autoAppliedCode)
    let resolvedCode = codePromoApplique;
    if (selectedRole === 'client' && !resolvedCode && (form.code_promo.trim() || autoAppliedCode)) {
      const codeToCheck = form.code_promo.trim() || autoAppliedCode;
      try {
        const codes = await base44.entities.CodePromo.filter({ code: codeToCheck });
        if (codes.length > 0) resolvedCode = codes[0];
      } catch (_) {}
    }

    if (selectedRole === "client" && resolvedCode) {
      const nouvNb = (resolvedCode.nombre_utilisations || 0) + 1;
      await base44.entities.CodePromo.update(resolvedCode.id, {
        nombre_utilisations: nouvNb,
        commission_due: (resolvedCode.commission_due || 0) + 50,
        statut_paiement: "Doit",
      });
    }
    // Marquer onboarding terminé (champs informatifs uniquement, pas décisionnels)
    const updateData = { onboarding_completed: true };
    if (selectedRole === 'livreur') {
      updateData.moyen_deplacement = JSON.stringify(moyenDeplacement);
      updateData.docs_envoyes = false;
    }
    if (selectedRole === 'client' && resolvedCode) {
      updateData.code_promo_utilise = resolvedCode.code;
    }
    await base44.auth.updateMe(updateData);

    // Appeler ensureUserProfile pour compatibilité legacy
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
    // Notifier les admins pour annonceur
    if (selectedRole === "annonceur") {
      try {
        const meData = await base44.auth.me();
        await base44.functions.invoke('notifyAdminNewSignup', {
          entity_name: 'Annonceur',
          entity_data: {
            full_name: meData.full_name,
            telephone: form.telephone,
            quartier: form.quartier,
          },
        });
      } catch (_) {}
    }
    // Créer le UserProfile — SOURCE DE VÉRITÉ du système multi-profils
    try {
      const result = await base44.functions.invoke('addProfileToUser', {
        profile_type: selectedRole,
        data: {
          telephone: form.telephone,
          quartier: form.quartier,
          ...(selectedRole === 'livreur' ? { moyen_deplacement: JSON.stringify(moyenDeplacement) } : {}),
        },
      });
      // Stocker l'ID du profil créé comme activeProfileId
      if (result?.data?.profile?.id) {
        localStorage.setItem('activeProfileId', result.data.profile.id);
      }
      // Message spécial si profil jumeau auto-créé
      if (result?.data?.auto_paired) {
        const pairedLabel = { client: 'Client', commercial: 'Commercial' }[result.data.auto_paired.type] || result.data.auto_paired.type;
        toast.success(`🎉 Votre profil a été créé avec succès. Votre second profil compatible (${pairedLabel}) a aussi été activé automatiquement.`, { duration: 5000 });
      }
    } catch (_) {}
    setLoading(false);
    localStorage.removeItem('cdl_pending_role');
    localStorage.removeItem('cdl_promo_code');

    // Notifier le commercial si code parrainage utilisé
    if (selectedRole === 'client' && resolvedCode) {
      const usedCode = resolvedCode.code;
      try {
        const codeData = resolvedCode;
        if (codeData?.commercial_email) {
          await base44.entities.Notification.create({
            destinataire_email: codeData.commercial_email,
            destinataire_role: 'commercial',
            titre: '🔥 Nouveau client inscrit avec votre code !',
            message: `Un nouveau client vient de s'inscrire avec votre code ${usedCode}. Il doit effectuer sa 1ère course pour valider le bonus. Encouragez-le !`,
            type: 'success',
            lue: false,
          });
        }
      } catch (_) {}
      // Afficher écran de confirmation parrainage
      setStep(3);
      return;
    }

    onComplete();
  };

  // ÉTAPE 3 : Confirmation parrainage
  if (step === 3) {
    const usedCode = form.code_promo || autoAppliedCode;
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-green-500 to-emerald-600">
        <div className="w-full max-w-sm text-center space-y-6">
          <div className="text-6xl">🎉</div>
          <div className="space-y-2">
            <h1 className="text-2xl font-extrabold text-white">Compte créé avec succès !</h1>
            <p className="text-white/90 text-sm">
              Vous avez utilisé le code <strong className="bg-white/20 px-2 py-0.5 rounded">{usedCode}</strong>
            </p>
            <p className="text-white/80 text-sm">Profitez de votre avantage et commencez maintenant 🚀</p>
          </div>
          <div className="bg-white/20 rounded-2xl p-4 space-y-2 text-white text-sm">
            <p className="font-semibold">🎁 Vos avantages activés :</p>
            <p>✅ -15% sur votre 1ère course</p>
            <p>✅ Accès complet à CDL</p>
            <p>✅ Suivi de vos livraisons en direct</p>
          </div>
          <div className="space-y-3">
            <Button
              className="w-full h-12 bg-white text-green-700 hover:bg-white/90 font-bold text-base"
              onClick={() => { window.location.href = '/commander'; }}
            >
              🛵 Commander une course maintenant
            </Button>
            <Button
              variant="outline"
              className="w-full h-11 border-white/50 text-white hover:bg-white/10"
              onClick={onComplete}
            >
              Découvrir l'application
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (showLivreurBienvenue) {
    return <LivreurBienvenue onContinuer={() => { setShowLivreurBienvenue(false); onComplete(); }} />;
  }

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
        {autoAppliedCode && selectedRole === 'client' && (
          <div className="rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 text-white p-4 text-center space-y-1">
            <p className="text-base font-bold">🎁 Code parrainage appliqué !</p>
            <p className="text-sm opacity-90">Code : <strong>{autoAppliedCode}</strong></p>
            <p className="text-xs opacity-80">★ -15% sur votre 1ère course + bonus parrainage</p>
          </div>
        )}

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
            <Label>📱 Numéro de téléphone * (obligatoire pour tous)</Label>
            <Input
              placeholder="+226 70000000"
              value={form.telephone}
              onChange={(e) => { setForm({ ...form, telephone: e.target.value }); if (telError) setTelError(""); }}
              className={telError ? "border-red-500 focus-visible:ring-red-500" : ""}
              disabled={loading}
            />
            {telError && <p className="text-xs text-red-600 font-bold">❌ {telError}</p>}
            {!telError && form.telephone && (
              <p className="text-xs text-green-600 font-medium">✅ Numéro valide</p>
            )}
          </div>

          {selectedRole !== "livreur" && selectedRole !== "commercial" && (
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

          {selectedRole === "commercial" && (
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-sm space-y-2">
              <p className="font-semibold text-blue-700">🎯 Profil Commercial</p>
              <p className="text-xs text-blue-600">Vous recevrez un code promo unique après validation. Utilisez-le pour parrainer et gagnez 50 F par client ayant effectué sa première course.</p>
            </div>
          )}

          {selectedRole === "client" && (
            <div className="space-y-2">
              <Label>Code promotionnel (optionnel)</Label>
              {autoAppliedCode && !codePromoApplique && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800 font-medium">
                  <span>🎁</span>
                  <span>Code parrainage détecté : <strong>{autoAppliedCode}</strong> — cliquez "OK" pour l'appliquer</span>
                </div>
              )}
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
            onClick={() => {
              const err = validateTelephone(form.telephone);
              if (err) { setTelError(err); toast.error(err); return; }
              handleSubmit();
            }}
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