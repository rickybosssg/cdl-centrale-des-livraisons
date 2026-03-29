import { useState } from "react";
import { User, Truck, Store, Megaphone, X, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { base44 } from "@/api/base44Client";
import QuartierSelect from "./QuartierSelect";
import { toast } from "sonner";

const ALL_ROLES = [
  { value: "client",     label: "Client",      icon: User,      desc: "Commander des livraisons" },
  { value: "livreur",    label: "Livreur",     icon: Truck,     desc: "Effectuer des livraisons et gagner de l'argent" },
  { value: "partenaire", label: "Partenaire",  icon: Store,     desc: "Vitrine commerce sur CDL" },
  { value: "commercial", label: "Commercial",  icon: Megaphone, desc: "Promouvoir CDL et gagner des commissions" },
];

const LIVREUR_DOCS = [
  { key: "photo_identite_recto", label: "CNIB / Pièce d'identité (recto) *" },
  { key: "photo_identite_verso", label: "CNIB / Pièce d'identité (verso) *" },
  { key: "photo_moyen_deplacement", label: "Photo de votre moyen de déplacement *" },
];

export default function AddRoleModal({ user, existingRoles, onClose, onAdded }) {
  const [selected, setSelected] = useState(null);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ telephone: user?.telephone || "", quartier: user?.quartier || "", nom_commerce: "" });
  const [docs, setDocs] = useState({ photo_identite_recto: null, photo_identite_verso: null, photo_moyen_deplacement: null });
  const [loading, setLoading] = useState(false);

  const available = ALL_ROLES.filter(r => !existingRoles.includes(r.value));

  const allDocsProvided = docs.photo_identite_recto && docs.photo_identite_verso && docs.photo_moyen_deplacement;

  const handleAdd = async () => {
    if (selected === "livreur" && !allDocsProvided) {
      toast.error("Veuillez fournir tous les documents obligatoires");
      return;
    }
    setLoading(true);

    const currentRoles = user.user_roles ? JSON.parse(user.user_roles) : [user.user_type];
    const newRoles = [...new Set([...currentRoles, selected])];
    const updates = { user_roles: JSON.stringify(newRoles) };

    if (selected === "livreur") {
      // Upload des documents
      toast.info("Envoi des documents...");
      const [urlRecto, urlVerso, urlDeplacement] = await Promise.all([
        base44.integrations.Core.UploadFile({ file: docs.photo_identite_recto }).then(r => r.file_url),
        base44.integrations.Core.UploadFile({ file: docs.photo_identite_verso }).then(r => r.file_url),
        base44.integrations.Core.UploadFile({ file: docs.photo_moyen_deplacement }).then(r => r.file_url),
      ]);
      updates.photo_identite_recto = urlRecto;
      updates.photo_identite_verso = urlVerso;
      updates.photo_moyen_deplacement = urlDeplacement;
      updates.statut_validation_livreur = "en_attente";
      updates.disponible = false;
      updates.total_courses = 0;
      if (form.telephone) updates.telephone = form.telephone;
      if (form.quartier) updates.quartier = form.quartier;
    }

    if (selected === "client") {
      updates.client_inscrit = true;
      try {
        await base44.functions.invoke('createClientOnSignup', {
          telephone: form.telephone,
          quartier: form.quartier,
        });
      } catch (_) {}
    }

    if (selected === "commercial") {
      updates.statut_validation_commercial = "en_attente";
    }

    await base44.auth.updateMe(updates);

    // Notifier les admins pour livreur
    if (selected === "livreur") {
      try {
        await base44.functions.invoke('notifyAdminNewSignup', {
          entity_name: 'Livreur',
          entity_data: {
            nom_complet: user.full_name,
            telephone: form.telephone || user.telephone,
            quartier: form.quartier || user.quartier,
            email: user.email,
          },
        });
      } catch (_) {}
    }

    toast.success(`Profil ${selected} ajouté ! En attente de validation.`);
    setLoading(false);
    onAdded(selected);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center" onClick={onClose}>
      <div
        className="bg-background w-full max-w-md rounded-t-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Ajouter un profil</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Étape 1 : Choix du profil */}
        {step === 1 && (
          <>
            {available.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Vous avez déjà tous les profils disponibles !</p>
            ) : (
              <div className="space-y-2">
                {available.map(role => {
                  const Icon = role.icon;
                  return (
                    <button
                      key={role.value}
                      onClick={() => setSelected(role.value)}
                      className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                        selected === role.value ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
                      }`}
                    >
                      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold">{role.label}</p>
                        <p className="text-xs text-muted-foreground">{role.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {available.length > 0 && (
              <Button className="w-full" disabled={!selected} onClick={() => setStep(2)}>
                Continuer
              </Button>
            )}
          </>
        )}

        {/* Étape 2 : Informations de base */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Informations pour le profil <strong>{selected}</strong></p>

            {selected === "livreur" && (
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-sm">
                🛵 Votre profil livreur sera examiné et validé par l'Administrateur CDL.
              </div>
            )}

            {(selected === "client" || selected === "livreur") && !user?.telephone && (
              <div className="space-y-2">
                <Label>Téléphone *</Label>
                <Input
                  placeholder="+226 XX XX XX XX"
                  value={form.telephone}
                  onChange={e => setForm({ ...form, telephone: e.target.value })}
                />
              </div>
            )}

            {(selected === "client" || selected === "livreur") && !user?.quartier && (
              <div className="space-y-2">
                <Label>Quartier *</Label>
                <QuartierSelect
                  value={form.quartier}
                  onValueChange={v => setForm({ ...form, quartier: v })}
                  placeholder="Votre quartier"
                />
              </div>
            )}

            {selected === "partenaire" && (
              <div className="space-y-2">
                <Label>Nom de votre commerce</Label>
                <Input
                  placeholder="Ex: Maquis Chez Bébé"
                  value={form.nom_commerce}
                  onChange={e => setForm({ ...form, nom_commerce: e.target.value })}
                />
              </div>
            )}

            {selected === "commercial" && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                Votre demande sera examinée par l'administration CDL. Vous recevrez une réponse sous 24h.
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">Retour</Button>
              <Button
                onClick={() => selected === "livreur" ? setStep(3) : handleAdd()}
                disabled={loading}
                className="flex-1"
              >
                {selected === "livreur" ? "Suivant →" : (loading ? "Enregistrement..." : "Ajouter le profil")}
              </Button>
            </div>
          </div>
        )}

        {/* Étape 3 (livreur uniquement) : Documents */}
        {step === 3 && selected === "livreur" && (
          <div className="space-y-4">
            <div>
              <p className="font-semibold text-sm">📷 Documents obligatoires</p>
              <p className="text-xs text-muted-foreground mt-1">Ces documents sont nécessaires pour la validation de votre profil.</p>
            </div>

            {LIVREUR_DOCS.map(doc => (
              <div key={doc.key} className="space-y-1">
                <Label>{doc.label}</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    id={`addRole_${doc.key}`}
                    onChange={e => setDocs(d => ({ ...d, [doc.key]: e.target.files[0] }))}
                  />
                  <label
                    htmlFor={`addRole_${doc.key}`}
                    className={`flex-1 flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                      docs[doc.key] ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted"
                    }`}
                  >
                    <Upload className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{docs[doc.key] ? docs[doc.key].name : "Choisir une photo"}</span>
                  </label>
                </div>
              </div>
            ))}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)} className="flex-1">Retour</Button>
              <Button
                onClick={handleAdd}
                disabled={loading || !allDocsProvided}
                className="flex-1"
              >
                {loading ? "Envoi en cours..." : "Soumettre le dossier"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}