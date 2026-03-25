import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Package, Truck, User, Radio } from "lucide-react";
import { base44 } from "@/api/base44Client";
import QuartierSelect from "./QuartierSelect";

const ROLES = [
  { value: "client", label: "Client", icon: User, desc: "Commander des livraisons" },
  { value: "livreur", label: "Livreur", icon: Truck, desc: "Effectuer des livraisons" },
  { value: "dispatcher", label: "Dispatcher", icon: Radio, desc: "Gérer les courses et livreurs" },
];

export default function RoleSetup({ onComplete }) {
  const [step, setStep] = useState(1);
  const [selectedRole, setSelectedRole] = useState(null);
  const [form, setForm] = useState({ telephone: "", whatsapp: "", quartier: "" });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    await base44.auth.updateMe({
      role: selectedRole,
      telephone: form.telephone,
      whatsapp: form.whatsapp || form.telephone,
      quartier: form.quartier,
      disponible: selectedRole === "livreur",
      verified: selectedRole === "client",
      total_courses: 0,
      commission_mode: true,
    });
    setLoading(false);
    onComplete();
  };

  if (step === 1) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="h-16 w-16 rounded-2xl bg-primary flex items-center justify-center mx-auto">
              <Package className="h-8 w-8 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold">CDL</h1>
            <p className="text-sm text-muted-foreground">Centrale des Livraisons</p>
            <p className="text-xs text-muted-foreground">Ouagadougou</p>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-center">Choisissez votre profil</p>
            {ROLES.map((role) => {
              const Icon = role.icon;
              return (
                <Card
                  key={role.value}
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    selectedRole === role.value ? "ring-2 ring-primary border-primary" : ""
                  }`}
                  onClick={() => setSelectedRole(role.value)}
                >
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold">{role.label}</p>
                      <p className="text-xs text-muted-foreground">{role.desc}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Button
            className="w-full"
            disabled={!selectedRole}
            onClick={() => setStep(2)}
          >
            Continuer
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h2 className="text-xl font-bold">Complétez votre profil</h2>
          <p className="text-sm text-muted-foreground">
            {selectedRole === "livreur" ? "Informations livreur" : "Informations client"}
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Numéro de téléphone</Label>
            <Input
              placeholder="+226 XX XX XX XX"
              value={form.telephone}
              onChange={(e) => setForm({ ...form, telephone: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>Numéro WhatsApp</Label>
            <Input
              placeholder="Même numéro si identique"
              value={form.whatsapp}
              onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>Quartier</Label>
            <QuartierSelect
              value={form.quartier}
              onValueChange={(v) => setForm({ ...form, quartier: v })}
              placeholder="Votre quartier"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
            Retour
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!form.telephone || !form.quartier || loading}
            className="flex-1"
          >
            {loading ? "Enregistrement..." : "Commencer"}
          </Button>
        </div>
      </div>
    </div>
  );
}