import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Trash2, Users, Truck, Store, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

const PROFILS = [
  { value: "livreur", label: "Livreurs", icon: Truck, color: "bg-blue-100 text-blue-700" },
  { value: "client", label: "Clients", icon: Users, color: "bg-green-100 text-green-700" },
  { value: "partenaire", label: "Partenaires", icon: Store, color: "bg-orange-100 text-orange-700" },
  { value: "commercial", label: "Commerciaux", icon: Megaphone, color: "bg-purple-100 text-purple-700" },
];

export default function Suppression() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const loadMembers = async (profile) => {
    setLoading(true);
    let data = [];
    
    if (profile === "livreur" || profile === "partenaire" || profile === "commercial") {
      data = await base44.entities.User.filter({ user_type: profile }, "-created_date", 500);
    } else if (profile === "client") {
      data = await base44.entities.Client.filter({}, "-created_date", 500);
    }
    
    setMembers(data);
    setLoading(false);
  };

  const handleSelectProfile = async (profile) => {
    setSelectedProfile(profile);
    await loadMembers(profile);
    setStep(2);
  };

  const handleDelete = async (member) => {
    setDeleting(member.id);
    try {
      const email = member.email || member.numero_telephone;
      
      // Supprimer l'entité spécifique
      if (selectedProfile === "client") {
        await base44.entities.Client.delete(member.id);
      } else if (selectedProfile === "partenaire") {
        const partners = await base44.entities.Partenaire.filter({ user_email: email });
        for (const partner of partners) {
          await base44.entities.Partenaire.delete(partner.id);
        }
      }
      
      // Supprimer l'utilisateur User (sauf pour client où on a juste supprimé l'entité)
      if (selectedProfile !== "client") {
        const users = await base44.entities.User.filter({ email });
        if (users.length > 0) {
          await base44.entities.User.delete(users[0].id);
        }
      }
      
      toast.success(`${member.nom_complet || member.full_name || email} a été supprimé`);
      setMembers(members.filter(m => m.id !== member.id));
      setConfirmDelete(null);
    } catch (err) {
      toast.error("Erreur: " + (err.message || err));
    } finally {
      setDeleting(null);
    }
  };

  if (step === 1) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">Suppression de compte</h1>
        </div>

        <p className="text-sm text-muted-foreground px-1">
          Sélectionnez le type de profil à supprimer
        </p>

        <div className="grid grid-cols-1 gap-3">
          {PROFILS.map(p => {
            const Icon = p.icon;
            return (
              <Card
                key={p.value}
                className="cursor-pointer transition-all hover:shadow-md"
                onClick={() => handleSelectProfile(p.value)}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${p.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold">{p.label}</p>
                    <p className="text-xs text-muted-foreground">Supprimer un {p.label.toLowerCase()}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  const profil = PROFILS.find(p => p.value === selectedProfile);
  const Icon = profil?.icon;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setStep(1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            {Icon && <Icon className="h-5 w-5 text-red-500" />}
            Supprimer {profil?.label.toLowerCase()}
          </h1>
          <p className="text-xs text-muted-foreground">{members.length} compte(s) trouvé(s)</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : members.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Aucun compte trouvé</p>
        </div>
      ) : (
        <div className="space-y-2">
          {members.map(member => {
            const name = member.nom_complet || member.full_name;
            const email = member.email || member.numero_telephone;
            return (
              <Card key={member.id}>
                <CardContent className="p-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{name}</p>
                    <p className="text-xs text-muted-foreground">{email}</p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setConfirmDelete(member)}
                    disabled={deleting === member.id}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog confirmation suppression */}
      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
          </DialogHeader>
          {confirmDelete && (
            <div className="space-y-4">
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700 font-semibold">
                  ⚠️ Cette action est irréversible
                </p>
                <p className="text-xs text-red-600 mt-1">
                  {confirmDelete.nom_complet || confirmDelete.full_name} sera supprimé définitivement du système.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setConfirmDelete(null)}
                  disabled={deleting === confirmDelete.id}
                >
                  Annuler
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => handleDelete(confirmDelete)}
                  disabled={deleting === confirmDelete.id}
                >
                  {deleting === confirmDelete.id ? "Suppression..." : "Supprimer"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}