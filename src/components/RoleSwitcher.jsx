import { useState } from "react";
import { User, Truck, Store, Megaphone, ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import AddRoleModal from "./AddRoleModal";

const ROLE_CONFIG = {
  client:     { label: "Client",       icon: User,      color: "bg-blue-100 text-blue-700" },
  livreur:    { label: "Livreur",      icon: Truck,     color: "bg-green-100 text-green-700" },
  partenaire: { label: "Partenaire",   icon: Store,     color: "bg-purple-100 text-purple-700" },
  commercial: { label: "Commercial",   icon: Megaphone, color: "bg-orange-100 text-orange-700" },
  dispatcher: { label: "Administrateur", icon: User, color: "bg-red-100 text-red-700" },
};

export default function RoleSwitcher({ user, roles, currentRole, onSwitch, onRoleAdded }) {
  const [open, setOpen] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const config = ROLE_CONFIG[currentRole] || ROLE_CONFIG.client;
  const Icon = config.icon;

  const handleSwitch = (role) => {
    onSwitch(role);
    setOpen(false);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${config.color} transition-all`}>
            <Icon className="h-3.5 w-3.5" />
            {config.label}
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" className="rounded-t-2xl pb-8">
          <SheetHeader className="pb-4">
            <SheetTitle>Changer de profil</SheetTitle>
            <SheetDescription>Basculez entre vos profils ou ajoutez-en un nouveau.</SheetDescription>
          </SheetHeader>
          <div className="space-y-2">
            {roles.map((role) => {
              const rc = ROLE_CONFIG[role];
              if (!rc) return null;
              const RIcon = rc.icon;
              return (
                <button
                  key={role}
                  onClick={() => handleSwitch(role)}
                  className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                    currentRole === role ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
                  }`}
                >
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${rc.color}`}>
                    <RIcon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold">{rc.label}</p>
                    <p className="text-xs text-muted-foreground">Accéder à l'espace {rc.label.toLowerCase()}</p>
                  </div>
                  {currentRole === role && <div className="h-2.5 w-2.5 rounded-full bg-primary" />}
                </button>
              );
            })}

            {/* Ajouter un profil */}
            <button
              onClick={() => { setOpen(false); setShowAdd(true); }}
              className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-all text-left"
            >
              <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-muted">
                <Plus className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-semibold text-muted-foreground">Ajouter un profil</p>
                <p className="text-xs text-muted-foreground">Client, Livreur, Partenaire, Commercial</p>
              </div>
            </button>
            </div>
            </SheetContent>
            </Sheet>
            {showAdd && (
              <AddRoleModal
                user={user}
                existingRoles={roles}
                onClose={() => setShowAdd(false)}
                onAdded={onRoleAdded}
              />
            )}
            );
}