import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { User, Phone, Save } from "lucide-react";

function validatePhone(tel) {
  const cleaned = tel.replace(/[\s\-\.\(\)]/g, "");
  return /^(\+226|00226|0)?[0-9]{8,10}$/.test(cleaned);
}

export default function EditPersonalInfoModal({ open, onClose, user, onSaved }) {
  const nameParts = (user?.full_name || "").trim().split(" ");
  const [prenom, setPrenom] = useState(nameParts[0] || "");
  const [nom, setNom] = useState(nameParts.slice(1).join(" ") || "");
  const [telephone, setTelephone] = useState(user?.telephone || "");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const errs = {};
    if (!prenom.trim()) errs.prenom = "Prénom obligatoire";
    if (!nom.trim()) errs.nom = "Nom obligatoire";
    if (!telephone.trim()) errs.telephone = "Téléphone obligatoire";
    else if (!validatePhone(telephone)) errs.telephone = "Numéro invalide (ex: +22670000000 ou 70000000)";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);

    const newFullName = `${prenom.trim()} ${nom.trim()}`.trim();
    const oldFullName = user?.full_name || "";
    const oldTel = user?.telephone || "";

    const res = await base44.functions.invoke("updatePersonalInfo", {
      new_full_name: newFullName,
      new_telephone: telephone.trim(),
      old_full_name: oldFullName,
      old_telephone: oldTel,
    });

    setSaving(false);

    if (res?.data?.success) {
      toast.success("✅ Vos informations ont été mises à jour avec succès.");
      onSaved({ full_name: newFullName, telephone: telephone.trim() });
      onClose();
    } else {
      toast.error(res?.data?.error || "Erreur lors de la mise à jour");
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-4 w-4" /> Modifier mes informations
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Prénom */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Prénom *</Label>
            <Input
              value={prenom}
              onChange={e => { setPrenom(e.target.value); setErrors(p => ({ ...p, prenom: "" })); }}
              placeholder="Votre prénom"
              className={errors.prenom ? "border-red-400" : ""}
            />
            {errors.prenom && <p className="text-xs text-red-600">{errors.prenom}</p>}
          </div>

          {/* Nom */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Nom *</Label>
            <Input
              value={nom}
              onChange={e => { setNom(e.target.value); setErrors(p => ({ ...p, nom: "" })); }}
              placeholder="Votre nom"
              className={errors.nom ? "border-red-400" : ""}
            />
            {errors.nom && <p className="text-xs text-red-600">{errors.nom}</p>}
          </div>

          {/* Téléphone */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" /> Numéro de téléphone *
            </Label>
            <Input
              value={telephone}
              onChange={e => { setTelephone(e.target.value); setErrors(p => ({ ...p, telephone: "" })); }}
              placeholder="+226 70000000"
              type="tel"
              className={errors.telephone ? "border-red-400" : ""}
            />
            {errors.telephone && <p className="text-xs text-red-600">{errors.telephone}</p>}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
              Annuler
            </Button>
            <Button className="flex-1 gap-2" onClick={handleSave} disabled={saving}>
              {saving
                ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <Save className="h-3.5 w-3.5" />}
              {saving ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}