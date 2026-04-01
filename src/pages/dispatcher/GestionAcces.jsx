import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Shield, UserPlus, Trash2, RefreshCw, CheckCircle2, XCircle, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import moment from "moment";

const ROLES_INTERNES = [
  { key: "gestionnaire_profils", label: "Gestionnaire des profils", desc: "Peut créer et modifier des profils" },
  { key: "superviseur_validation", label: "Superviseur validation", desc: "Peut valider les documents livreurs" },
  { key: "dispatcher_manager", label: "Dispatcher Manager", desc: "Gère les opérations de livraison" },
  { key: "admin_secondaire", label: "Admin secondaire", desc: "Accès étendu avec restrictions" },
];

const ALL_PERMISSIONS = [
  { key: "voir_utilisateurs", label: "Voir les utilisateurs", group: "Consultation" },
  { key: "modifier_profils", label: "Modifier les profils", group: "Profils" },
  { key: "attribuer_client", label: "Attribuer profil Client", group: "Profils" },
  { key: "attribuer_livreur", label: "Attribuer profil Livreur", group: "Profils" },
  { key: "attribuer_partenaire", label: "Attribuer profil Partenaire", group: "Profils" },
  { key: "attribuer_commercial", label: "Attribuer profil Commercial", group: "Profils" },
  { key: "attribuer_dispatcher", label: "Attribuer profil Dispatcher", group: "Profils" },
  { key: "attribuer_admin", label: "Attribuer profil Administrateur", group: "Profils" },
  { key: "retirer_profil", label: "Retirer un profil", group: "Profils" },
  { key: "bloquer_profil", label: "Bloquer/Débloquer un profil", group: "Profils" },
  { key: "valider_livreur", label: "Valider documents livreur", group: "Validation" },
  { key: "generer_code_commercial", label: "Générer code commercial", group: "Validation" },
  { key: "voir_historique", label: "Voir l'historique des actions", group: "Consultation" },
  { key: "gerer_permissions", label: "Gérer les permissions d'autres", group: "Admin" },
];

const PERMISSION_GROUPS = [...new Set(ALL_PERMISSIONS.map(p => p.group))];

export default function GestionAcces() {
  const navigate = useNavigate();
  const [adminUser, setAdminUser] = useState(null);
  const [delegues, setDelegues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [searchUser, setSearchUser] = useState("");
  const [foundUsers, setFoundUsers] = useState([]);
  const [selectedNewUser, setSelectedNewUser] = useState(null);
  const [roleInterne, setRoleInterne] = useState("");
  const [checkedPerms, setCheckedPerms] = useState([]);
  const [saving, setSaving] = useState(false);
  const [detailDialog, setDetailDialog] = useState(false);
  const [selectedDelegue, setSelectedDelegue] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setAdminUser);
    loadDelegues();
  }, []);

  const loadDelegues = async () => {
    const data = await base44.entities.AdminPermission.list("-created_date", 100);
    setDelegues(data);
    setLoading(false);
  };

  const searchUsers = async () => {
    if (!searchUser.trim()) return;
    const all = await base44.entities.User.list("-created_date", 500);
    const q = searchUser.toLowerCase();
    setFoundUsers(all.filter(u =>
      u.full_name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.telephone?.includes(q)
    ).slice(0, 10));
  };

  const togglePerm = (key) => {
    setCheckedPerms(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const selectAll = (group) => {
    const groupPerms = ALL_PERMISSIONS.filter(p => p.group === group).map(p => p.key);
    const allSelected = groupPerms.every(k => checkedPerms.includes(k));
    if (allSelected) {
      setCheckedPerms(prev => prev.filter(k => !groupPerms.includes(k)));
    } else {
      setCheckedPerms(prev => [...new Set([...prev, ...groupPerms])]);
    }
  };

  const handleSave = async () => {
    if (!selectedNewUser || !roleInterne) {
      toast.error("Sélectionnez un utilisateur et un rôle");
      return;
    }
    if (checkedPerms.length === 0) {
      toast.error("Sélectionnez au moins une permission");
      return;
    }
    setSaving(true);

    const existing = delegues.find(d => d.user_email === selectedNewUser.email);
    if (existing) {
      await base44.entities.AdminPermission.update(existing.id, {
        role_interne: roleInterne,
        permissions: JSON.stringify(checkedPerms),
        actif: true,
        attribue_par: adminUser.email,
      });
    } else {
      await base44.entities.AdminPermission.create({
        user_email: selectedNewUser.email,
        user_name: selectedNewUser.full_name,
        role_interne: roleInterne,
        permissions: JSON.stringify(checkedPerms),
        actif: true,
        attribue_par: adminUser.email,
      });
    }

    // Journal
    await base44.entities.AdminActionLog.create({
      admin_email: adminUser.email,
      object_type: "commercial",
      object_id: selectedNewUser.id,
      object_name: selectedNewUser.full_name,
      action: "modify",
      reason: `Attribution permissions: ${roleInterne}`,
      target_email: selectedNewUser.email,
      new_data: JSON.stringify({ role_interne: roleInterne, permissions: checkedPerms }),
    });

    // Notification
    await base44.entities.Notification.create({
      destinataire_email: selectedNewUser.email,
      destinataire_role: "admin",
      titre: "🔐 Accès délégué attribué",
      message: `Vous avez reçu des permissions de gestion CDL : ${ROLES_INTERNES.find(r => r.key === roleInterne)?.label}.`,
      type: "info",
      lue: false,
    });

    toast.success("Permissions enregistrées !");
    setDialogOpen(false);
    resetForm();
    loadDelegues();
    setSaving(false);
  };

  const resetForm = () => {
    setSelectedNewUser(null);
    setSearchUser("");
    setFoundUsers([]);
    setRoleInterne("");
    setCheckedPerms([]);
  };

  const handleToggleAccess = async (delegue) => {
    await base44.entities.AdminPermission.update(delegue.id, { actif: !delegue.actif });
    toast.success(delegue.actif ? "Accès révoqué" : "Accès restauré");

    await base44.entities.AdminActionLog.create({
      admin_email: adminUser.email,
      object_type: "commercial",
      object_id: delegue.id,
      object_name: delegue.user_name,
      action: delegue.actif ? "suspend" : "unsuspend",
      reason: `${delegue.actif ? "Révocation" : "Restauration"} accès délégué`,
      target_email: delegue.user_email,
    });

    loadDelegues();
  };

  const handleDelete = async (delegue) => {
    await base44.entities.AdminPermission.delete(delegue.id);
    toast.success("Accès supprimé");
    setDetailDialog(false);
    loadDelegues();
  };

  const openEdit = (delegue) => {
    setSelectedNewUser({ email: delegue.user_email, full_name: delegue.user_name, id: delegue.id });
    setRoleInterne(delegue.role_interne);
    setCheckedPerms(JSON.parse(delegue.permissions || "[]"));
    setFoundUsers([]);
    setSearchUser(delegue.user_name || "");
    setDialogOpen(true);
  };

  const ROLE_LABELS = Object.fromEntries(ROLES_INTERNES.map(r => [r.key, r.label]));
  const ROLE_COLORS = {
    gestionnaire_profils: "bg-blue-100 text-blue-700",
    superviseur_validation: "bg-green-100 text-green-700",
    dispatcher_manager: "bg-cyan-100 text-cyan-700",
    admin_secondaire: "bg-red-100 text-red-700",
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4 pb-16">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Gestion des accès</h1>
          <p className="text-xs text-muted-foreground">Déléguer des permissions à des collaborateurs</p>
        </div>
      </div>

      <Button className="w-full" onClick={() => { resetForm(); setDialogOpen(true); }}>
        <UserPlus className="h-4 w-4 mr-2" /> Ajouter un délégué
      </Button>

      {/* Liste des délégués */}
      {delegues.length === 0 ? (
        <div className="text-center py-12">
          <Shield className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Aucun délégué configuré</p>
          <p className="text-xs text-muted-foreground mt-1">Ajoutez des collaborateurs de confiance</p>
        </div>
      ) : (
        <div className="space-y-3">
          {delegues.map(delegue => {
            const perms = JSON.parse(delegue.permissions || "[]");
            return (
              <Card key={delegue.id} className={!delegue.actif ? "opacity-50" : ""}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary flex-shrink-0">
                      {delegue.user_name?.charAt(0) || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{delegue.user_name}</p>
                      <p className="text-xs text-muted-foreground">{delegue.user_email}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[delegue.role_interne] || "bg-gray-100 text-gray-700"}`}>
                        {ROLE_LABELS[delegue.role_interne] || delegue.role_interne}
                      </span>
                    </div>
                    <div className="flex-shrink-0">
                      {delegue.actif
                        ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Actif</span>
                        : <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Révoqué</span>
                      }
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {perms.slice(0, 4).map(p => {
                      const permDef = ALL_PERMISSIONS.find(ap => ap.key === p);
                      return (
                        <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {permDef?.label || p}
                        </span>
                      );
                    })}
                    {perms.length > 4 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        +{perms.length - 4} autres
                      </span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={() => openEdit(delegue)}>
                      Modifier
                    </Button>
                    <Button
                      size="sm" variant="outline"
                      className={`h-7 text-xs flex-1 ${delegue.actif ? "border-red-300 text-red-600" : "border-green-300 text-green-600"}`}
                      onClick={() => handleToggleAccess(delegue)}
                    >
                      {delegue.actif ? "Révoquer" : "Restaurer"}
                    </Button>
                    <Button
                      size="sm" variant="outline" className="h-7 text-xs border-red-300 text-red-600"
                      onClick={() => { setSelectedDelegue(delegue); setDetailDialog(true); }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>

                  <p className="text-[10px] text-muted-foreground">
                    Attribué par {delegue.attribue_par} · {moment(delegue.created_date).format("DD/MM/YYYY")}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog ajout/modification */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configurer un délégué</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Sélection utilisateur */}
            <div className="space-y-2">
              <p className="text-sm font-semibold">1. Sélectionner l'utilisateur</p>
              {selectedNewUser ? (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/5 border border-primary/20">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-sm">
                    {selectedNewUser.full_name?.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{selectedNewUser.full_name}</p>
                    <p className="text-xs text-muted-foreground">{selectedNewUser.email}</p>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setSelectedNewUser(null); setSearchUser(""); setFoundUsers([]); }}>
                    Changer
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input placeholder="Rechercher..." value={searchUser} onChange={e => setSearchUser(e.target.value)} onKeyDown={e => e.key === "Enter" && searchUsers()} />
                    <Button size="icon" onClick={searchUsers}><RefreshCw className="h-4 w-4" /></Button>
                  </div>
                  {foundUsers.map(u => (
                    <button key={u.id} onClick={() => { setSelectedNewUser(u); setFoundUsers([]); }}
                      className="w-full text-left p-2 rounded-lg border hover:bg-muted transition-colors">
                      <p className="text-sm font-medium">{u.full_name}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Rôle interne */}
            <div className="space-y-2">
              <p className="text-sm font-semibold">2. Rôle interne</p>
              <div className="grid grid-cols-1 gap-2">
                {ROLES_INTERNES.map(r => (
                  <button key={r.key} onClick={() => setRoleInterne(r.key)}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${roleInterne === r.key ? "border-primary bg-primary/10" : "border-border"}`}>
                    <p className="text-sm font-semibold">{r.label}</p>
                    <p className="text-xs text-muted-foreground">{r.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Permissions */}
            <div className="space-y-3">
              <p className="text-sm font-semibold">3. Permissions autorisées</p>
              {PERMISSION_GROUPS.map(group => (
                <div key={group} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{group}</p>
                    <button onClick={() => selectAll(group)} className="text-xs text-primary underline">Tout</button>
                  </div>
                  {ALL_PERMISSIONS.filter(p => p.group === group).map(perm => (
                    <label key={perm.key} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                      checkedPerms.includes(perm.key) ? "bg-primary/5 border-primary/30" : "border-border hover:bg-muted/50"
                    }`}>
                      <input
                        type="checkbox"
                        checked={checkedPerms.includes(perm.key)}
                        onChange={() => togglePerm(perm.key)}
                        className="h-4 w-4 accent-primary"
                      />
                      <span className="text-sm">{perm.label}</span>
                      {perm.key === "attribuer_admin" && (
                        <span className="ml-auto text-[10px] text-red-500">⚠️ Sensible</span>
                      )}
                    </label>
                  ))}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
              <span>{checkedPerms.length} permission(s) sélectionnée(s)</span>
            </div>

            <Button className="w-full" onClick={handleSave} disabled={saving || !selectedNewUser || !roleInterne}>
              {saving ? "Enregistrement..." : "Enregistrer les permissions"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog confirmation suppression */}
      <Dialog open={detailDialog} onOpenChange={setDetailDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer les accès</DialogTitle>
          </DialogHeader>
          {selectedDelegue && (
            <div className="space-y-4">
              <p className="text-sm">Êtes-vous sûr de vouloir supprimer tous les accès de <strong>{selectedDelegue.user_name}</strong> ? Cette action est irréversible.</p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setDetailDialog(false)}>Annuler</Button>
                <Button variant="destructive" className="flex-1" onClick={() => handleDelete(selectedDelegue)}>
                  <Trash2 className="h-4 w-4 mr-2" /> Supprimer
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}