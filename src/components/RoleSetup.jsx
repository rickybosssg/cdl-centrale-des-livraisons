import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Package, Truck, User, Radio, Upload, Store, Megaphone } from "lucide-react";
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

const ADMIN_ROLES = [
  { value: "client", label: "Client", icon: User, desc: "Commander des livraisons" },
  { value: "livreur", label: "Livreur", icon: Truck, desc: "Effectuer des livraisons" },
  { value: "dispatcher", label: "Administrateur", icon: Radio, desc: "Gérer les courses et livreurs" },
];

export default function RoleSetup({ onComplete, isAdmin = false }) {
  const [step, setStep] = useState(1);
  const [selectedRole, setSelectedRole] = useState(null);
  const [showPartenaire, setShowPartenaire] = useState(false);
  const ROLES = isAdmin ? ADMIN_ROLES : PUBLIC_ROLES;
  const [form, setForm] = useState({ telephone: "", whatsapp: "", quartier: "", code_promo: "" });
  const [checkingCode, setCheckingCode] = useState(false);
  const [codePromoApplique, setCodePromoApplique] = useState(null);
  const [docs, setDocs] = useState({ photo_profil: null, photo_identite_recto: null, photo_identite_verso: null, photo_moto: null });
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [livreursActifs, setLivreursActifs] = useState(null);

  useEffect(() => {
    base44.entities.User.filter({ user_type: 'livreur', disponible: true })
      .then(res => setLivreursActifs(res.length))
      .catch(() => {});
  }, []);

  const uploadFile = async (file) => {
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    return file_url;
  };

  const handleSubmit = async () => {
    if (selectedRole === "livreur" && (!docs.photo_profil || !docs.photo_identite_recto || !docs.photo_identite_verso || !docs.photo_moto)) {
      toast.error("Veuillez fournir tous les documents demandés");
      return;
    }
    setLoading(true);
    let docUrls = {};
    if (selectedRole === "livreur") {
      setUploading(true);
      const uploads = await Promise.all([
        uploadFile(docs.photo_profil),
        uploadFile(docs.photo_identite_recto),
        uploadFile(docs.photo_identite_verso),
        uploadFile(docs.photo_moto),
      ]);
      docUrls = {
        photo_profil: uploads[0],
        photo_identite_recto: uploads[1],
        photo_identite_verso: uploads[2],
        photo_moto: uploads[3],
      };
      setUploading(false);
    }
    if (selectedRole === "client" && form.code_promo.trim() && codePromoApplique) {
      const nouvNb = (codePromoApplique.nombre_utilisations || 0) + 1;
      await base44.entities.CodePromo.update(codePromoApplique.id, {
        nombre_utilisations: nouvNb,
        commission_due: (codePromoApplique.commission_due || 0) + 50,
        statut_paiement: "Doit",
      });
    }
    const me = await base44.auth.me();
    await base44.auth.updateMe({
      user_type: selectedRole,
      user_roles: JSON.stringify([selectedRole]),
      telephone: form.telephone,
      whatsapp: form.whatsapp || form.telephone,
      quartier: form.quartier,
      disponible: false,
      actif: true,
      profil_valide: selectedRole !== "livreur" && selectedRole !== "commercial",
      statut_validation_livreur: selectedRole === "livreur" ? "en_attente" : undefined,
      statut_validation_commercial: selectedRole === "commercial" ? "en_attente" : undefined,
      verified: selectedRole === "client",
      total_courses: 0,
      commission_mode: true,
      solde_commission_du: 0,
      statut_financier_livreur: "À jour",
      livreur_bloque: false,
      code_promo_utilise: (selectedRole === "client" && codePromoApplique) ? codePromoApplique.code : undefined,
      ...docUrls,
    });
    if (selectedRole === "client") {
      await base44.functions.invoke('createClientOnSignup', {
        telephone: form.telephone,
        quartier: form.quartier,
      });
    }
    setLoading(false);
    onComplete();
  };

  if (showPartenaire) {
    return <InscriptionPartenaire onBack={() => setShowPartenaire(false)} onComplete={onComplete} />;
  }

  // ─── ÉTAPE 1 : Choix du profil ───
  if (step === 1) {
    return (
      <div className="min-h-screen flex flex-col p-4 bg-background">
        <div className="w-full max-w-sm mx-auto space-y-5 pt-6 pb-10">

          {/* Logo */}
          <div className="flex items-center gap-3">
            <img src="https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg" alt="CDL" className="h-12 w-12 rounded-xl object-cover" />
            <div>
              <h1 className="text-xl font-bold">CDL APP</h1>
              <p className="text-xs text-muted-foreground">Centrale des Livraisons — Ouagadougou</p>
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
            <p className="text-sm font-semibold text-center">Choisissez votre profil</p>
            {ROLES.map((role) => {
              const Icon = role.icon;
              const isLivreur = role.value === 'livreur';
              return (
                <Card
                  key={role.value}
                  className={`cursor-pointer transition-all press-effect ${
                    selectedRole === role.value
                      ? 'ring-2 ring-primary border-primary shadow-md'
                      : isLivreur
                        ? 'border-2 border-primary/50 bg-primary/5 hover:shadow-md'
                        : 'hover:shadow-sm'
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
                      <p className={`font-semibold ${isLivreur ? 'text-primary' : ''}`}>{role.label}</p>
                      <p className="text-xs text-muted-foreground">{role.desc}</p>
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
            className="w-full h-12 text-base font-semibold"
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

          {selectedRole === "client" && (
            <div className="space-y-2">
              <Label>Code promotionnel (optionnel)</Label>
              {codePromoApplique ? (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200">
                  <span className="text-green-700 text-sm font-bold flex-1">✅ {codePromoApplique.code} — -20% sur votre 1ère course !</span>
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
                      else { setCodePromoApplique(codes[0]); toast.success(`Code ${form.code_promo} appliqué ! -20% 🎉`); }
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
          <div className="space-y-3">
            <p className="text-sm font-semibold">📷 Documents obligatoires</p>
            {[
              { key: "photo_profil", label: "Photo de profil (selfie)" },
              { key: "photo_identite_recto", label: "CNI / Pièce d'identité (recto)" },
              { key: "photo_identite_verso", label: "CNI / Pièce d'identité (verso)" },
              { key: "photo_moto", label: "Photo de votre moto / vélo" },
            ].map(doc => (
              <div key={doc.key} className="space-y-1">
                <Label>{doc.label} *</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    id={doc.key}
                    onChange={e => setDocs(d => ({ ...d, [doc.key]: e.target.files[0] }))}
                  />
                  <label
                    htmlFor={doc.key}
                    className={`flex-1 flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                      docs[doc.key] ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted"
                    }`}
                  >
                    <Upload className="h-4 w-4" />
                    {docs[doc.key] ? docs[doc.key].name : "Choisir une photo"}
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
            Retour
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!form.telephone || !form.quartier || loading || uploading}
            className="flex-1 h-11 font-semibold"
          >
            {uploading ? "Upload..." : loading ? "Enregistrement..." : selectedRole === "livreur" ? "🛵 Commencer maintenant" : "Commencer"}
          </Button>
        </div>
      </div>
    </div>
  );
}