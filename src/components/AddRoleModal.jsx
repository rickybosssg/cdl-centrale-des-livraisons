import { useState } from "react";
import { User, Truck, Store, Megaphone, X, Upload, Shield } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import QuartierSelect from "./QuartierSelect";
import { base44 } from "@/api/base44Client";

const ALL_ROLES = [
  { value: "client",     label: "Client",         icon: User,      desc: "Commander des livraisons" },
  { value: "livreur",    label: "Livreur",         icon: Truck,     desc: "Effectuer des livraisons et gagner de l'argent" },
  { value: "partenaire", label: "Partenaire",      icon: Store,     desc: "Vitrine commerce sur CDL" },
  { value: "commercial", label: "Commercial",      icon: Megaphone, desc: "Promouvoir CDL et gagner des commissions" },
  { value: "admin",      label: "Administrateur",  icon: Shield,    desc: "Gérer la plateforme" },
];

const LIVREUR_DOCS = [
  { key: "photo_identite_recto",      label: "CNIB / Pièce d'identité (recto) *" },
  { key: "photo_identite_verso",      label: "CNIB / Pièce d'identité (verso) *" },
  { key: "photo_moyen_deplacement",   label: "Photo de votre moyen de déplacement *" },
];

export default function AddRoleModal({ user, existingRoles, onClose, onAdded }) {
  const isAdmin = user?.email === "weezyh2@gmail.com" || user?.role === "admin";

  // ── État ────────────────────────────────────────────────────────────────────
  const [selected, setSelected] = useState(null);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    telephone: user?.telephone || "",
    quartier:  user?.quartier  || "",
    nom_commerce: "",
  });
  const [docs, setDocs] = useState({
    photo_identite_recto:    null,
    photo_identite_verso:    null,
    photo_moyen_deplacement: null,
  });
  const [loading, setLoading]   = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // ── Calcul profils disponibles ──────────────────────────────────────────────
  const available = ALL_ROLES.filter(r => {
    if (r.value === "admin" && !isAdmin) return false;
    return !existingRoles.includes(r.value);
  });

  const allDocsProvided =
    docs.photo_identite_recto &&
    docs.photo_identite_verso &&
    docs.photo_moyen_deplacement;

  // ── Action principale ───────────────────────────────────────────────────────
  const handleAdd = async () => {
    console.log("[AddRoleModal] handleAdd - role:", selected);
    setErrorMsg("");

    if (!selected) {
      setErrorMsg("Veuillez sélectionner un profil.");
      return;
    }

    if (selected === "livreur" && !allDocsProvided) {
      toast.error("Veuillez fournir tous les documents obligatoires");
      return;
    }

    setLoading(true);

    try {
      // ── Appel backend : addProfileToUser ──────────────────────────────────
      const payload = {
        email:      user.email,
        full_name:  user.full_name,
        telephone:  form.telephone || user?.telephone || "",
        quartier:   form.quartier  || user?.quartier  || "",
      };

      if (selected === "partenaire") {
        payload.nom_commerce = form.nom_commerce;
      }

      if (selected === "livreur" && allDocsProvided) {
        toast.info("Envoi des documents en cours...");
        const [urlRecto, urlVerso, urlDeplacement] = await Promise.all([
          base44.integrations.Core.UploadFile({ file: docs.photo_identite_recto     }).then(r => r.file_url),
          base44.integrations.Core.UploadFile({ file: docs.photo_identite_verso     }).then(r => r.file_url),
          base44.integrations.Core.UploadFile({ file: docs.photo_moyen_deplacement  }).then(r => r.file_url),
        ]);
        payload.photo_identite_recto    = urlRecto;
        payload.photo_identite_verso    = urlVerso;
        payload.photo_moyen_deplacement = urlDeplacement;
        payload.moyen_deplacement       = JSON.stringify(["moto"]);
      }

      console.log("[AddRoleModal] Invoking addProfileToUser with payload:", payload);

      const result = await base44.functions.invoke("addProfileToUser", {
        profile_type: selected,
        data: payload,
      });

      console.log("[AddRoleModal] Result:", result?.data);

      if (result?.data?.success) {
        const label = ALL_ROLES.find(r => r.value === selected)?.label || selected;
        if (result.data.status === "actif") {
          toast.success(`✅ Profil ${label} activé !`);
        } else {
          toast.success(`⏳ Demande ${label} envoyée — en attente de validation.`);
        }
        setLoading(false);
        onAdded(selected);
      } else {
        const msg = result?.data?.error || "Erreur lors de la création du profil.";
        console.error("[AddRoleModal] Error from server:", msg);
        if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("existe")) {
          setErrorMsg("Ce profil existe déjà pour cet utilisateur.");
        } else {
          setErrorMsg(msg);
        }
        toast.error(msg);
        setLoading(false);
      }
    } catch (err) {
      console.error("[AddRoleModal] Exception:", err);
      const errMsg = err?.message || "Erreur réseau ou serveur.";
      setErrorMsg(errMsg);
      toast.error("Erreur : " + errMsg);
      setLoading(false);
    }
  };

  // ── Rendu ───────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center" onClick={onClose}>
      <div
        className="bg-background w-full max-w-md rounded-t-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Ajouter un profil</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── ÉTAPE 1 : Choix du profil ── */}
        {step === 1 && (
          <>
            {available.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Tous les profils disponibles sont déjà assignés.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Choisissez un profil :</p>
                {available.map(role => {
                  const Icon = role.icon;
                  return (
                    <button
                      key={role.value}
                      type="button"
                      onClick={() => { setSelected(role.value); setErrorMsg(""); }}
                      className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                        selected === role.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{role.label}</p>
                        <p className="text-xs text-muted-foreground">{role.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {errorMsg && <p className="text-sm text-red-600 font-medium">{errorMsg}</p>}

            {available.length > 0 && (
              <Button
                className="w-full"
                disabled={!selected}
                onClick={() => setStep(2)}
                type="button"
              >
                Continuer →
              </Button>
            )}
          </>
        )}

        {/* ── ÉTAPE 2 : Informations ── */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-xs text-primary hover:underline"
              >
                ← Retour
              </button>
              <p className="text-sm text-muted-foreground">
                Profil : <strong className="text-foreground">{ALL_ROLES.find(r => r.value === selected)?.label}</strong>
              </p>
            </div>

            {selected === "livreur" && (
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-sm">
                🛵 Votre profil livreur sera examiné et validé par l'Administrateur CDL.
              </div>
            )}

            {selected === "commercial" && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                📣 Votre demande sera examinée par l'administration CDL. Réponse sous 24h.
              </div>
            )}

            {(selected === "client" || selected === "livreur") && (
              <>
                <div className="space-y-1">
                  <Label>Téléphone</Label>
                  <Input
                    placeholder="+226 XX XX XX XX"
                    value={form.telephone}
                    onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Quartier</Label>
                  <QuartierSelect
                    value={form.quartier}
                    onValueChange={v => setForm(f => ({ ...f, quartier: v }))}
                    placeholder="Votre quartier"
                  />
                </div>
              </>
            )}

            {selected === "partenaire" && (
              <div className="space-y-1">
                <Label>Nom de votre commerce</Label>
                <Input
                  placeholder="Ex: Maquis Chez Bébé"
                  value={form.nom_commerce}
                  onChange={e => setForm(f => ({ ...f, nom_commerce: e.target.value }))}
                />
              </div>
            )}

            {errorMsg && <p className="text-sm text-red-600 font-medium">{errorMsg}</p>}

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setStep(1)} className="flex-1">
                Retour
              </Button>
              <Button
                type="button"
                onClick={() => selected === "livreur" ? setStep(3) : handleAdd()}
                disabled={loading}
                className="flex-1"
              >
                {selected === "livreur"
                  ? "Suivant →"
                  : loading
                  ? "Enregistrement..."
                  : "✅ Assigner le profil"}
              </Button>
            </div>
          </div>
        )}

        {/* ── ÉTAPE 3 : Documents livreur ── */}
        {step === 3 && selected === "livreur" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setStep(2)} className="text-xs text-primary hover:underline">
                ← Retour
              </button>
              <p className="font-semibold text-sm">📷 Documents obligatoires</p>
            </div>

            <p className="text-xs text-muted-foreground">
              Ces documents sont nécessaires pour valider votre profil livreur.
            </p>

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
                    className={`flex-1 flex items-center gap-2 p-3 rounded-lg border cursor-pointer text-sm transition-colors ${
                      docs[doc.key]
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:bg-muted text-foreground"
                    }`}
                  >
                    <Upload className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">
                      {docs[doc.key] ? `✓ ${docs[doc.key].name}` : "Choisir une photo"}
                    </span>
                  </label>
                </div>
              </div>
            ))}

            {errorMsg && <p className="text-sm text-red-600 font-medium">{errorMsg}</p>}

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setStep(2)} className="flex-1">
                Retour
              </Button>
              <Button
                type="button"
                onClick={handleAdd}
                disabled={loading || !allDocsProvided}
                className="flex-1"
              >
                {loading ? "Envoi en cours..." : "📩 Soumettre le dossier"}
              </Button>
            </div>

            {!allDocsProvided && (
              <p className="text-xs text-amber-600 text-center">
                ⚠️ Les 3 documents sont obligatoires pour continuer.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}