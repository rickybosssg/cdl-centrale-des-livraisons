import { useState } from "react";
import { User, Truck, Store, Megaphone, X } from "lucide-react";
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

export default function AddRoleModal({ user, existingRoles, onClose, onAdded }) {
  const [selected, setSelected] = useState(null);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ telephone: user?.telephone || "", quartier: user?.quartier || "", nom_commerce: "" });
  const [loading, setLoading] = useState(false);

  const available = ALL_ROLES.filter(r => !existingRoles.includes(r.value));

  const handleAdd = async () => {
    setLoading(true);
    const currentRoles = user.user_roles ? JSON.parse(user.user_roles) : [user.user_type];
    const newRoles = [...new Set([...currentRoles, selected])];

    const updates = { user_roles: JSON.stringify(newRoles) };

    if (selected === "client") {
      updates.client_inscrit = true;
      try {
        await base44.functions.invoke('createClientOnSignup', {
          telephone: form.telephone,
          quartier: form.quartier,
        });
      } catch (_) {}
    }
    if (selected === "livreur") {
      updates.statut_validation_livreur = "en_attente";
      updates.disponible = false;
      updates.total_courses = 0;
    }
    if (selected === "commercial") {
      updates.statut_validation_commercial = "en_attente";
    }

    await base44.auth.updateMe(updates);
    toast.success(`Profil ${selected} ajouté avec succès !`);
    setLoading(false);
    onAdded(selected);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center" onClick={onClose}>
      <div
        className="bg-background w-full max-w-md rounded-t-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Ajouter un profil</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>

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
              <Button
                className="w-full"
                disabled={!selected}
                onClick={() => setStep(2)}
              >
                Continuer
              </Button>
            )}
          </>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Quelques informations pour le profil <strong>{selected}</strong></p>

            {(selected === "client" || selected === "livreur") && !user?.telephone && (
              <div className="space-y-2">
                <Label>Téléphone</Label>
                <Input
                  placeholder="+226 XX XX XX XX"
                  value={form.telephone}
                  onChange={e => setForm({ ...form, telephone: e.target.value })}
                />
              </div>
            )}

            {(selected === "client" || selected === "livreur") && !user?.quartier && (
              <div className="space-y-2">
                <Label>Quartier</Label>
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

            {selected === "livreur" && (
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-sm">
                Votre profil livreur sera validé par l'administration CDL avant activation.
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">Retour</Button>
              <Button onClick={handleAdd} disabled={loading} className="flex-1">
                {loading ? "Enregistrement..." : "Ajouter le profil"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}