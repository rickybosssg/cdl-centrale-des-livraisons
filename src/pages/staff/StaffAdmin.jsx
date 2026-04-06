import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Plus, Pencil, Trash2, Shield, Users, Loader2, RefreshCw, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import moment from "moment";

const ROLE_TEMPLATES = {
  "Gestionnaire Bedou":            { canManageBedou: true, canApproveTopups: true, canRejectTopups: true, canApproveWithdrawals: true, canRejectWithdrawals: true, canViewBedouHistory: true },
  "Validateur Livreurs":           { canViewDriverRequests: true, canValidateDrivers: true, canRejectDrivers: true, canSuspendDrivers: true, canRequestMissingDriverDocs: true, canViewDriverDocuments: true },
  "Dispatcher Manuel":             { canViewPendingCourses: true, canManualDispatch: true, canReassignCourse: true, canCancelAssignment: true, canViewDriverLocations: true, canContactDriver: true, canContactClient: true },
  "Support Client":                { canViewComplaints: true, canRespondComplaints: true, canEscalateComplaints: true, canCloseComplaints: true, canTrackOrders: true },
  "Superviseur Publicités & Commerciaux": { canManageAds: true, canApproveAds: true, canRejectAds: true, canViewPromoStats: true },
  "Admin secondaire":              { canViewUsers: true, canBlockUsers: true, canUnblockUsers: true, canViewAuditLogs: true, canViewDriverRequests: true, canViewPendingCourses: true, canViewComplaints: true },
};

const ALL_PERMS = [
  { key: "canManageBedou", label: "Gérer Bedou" },
  { key: "canApproveTopups", label: "Valider recharges" },
  { key: "canRejectTopups", label: "Refuser recharges" },
  { key: "canApproveWithdrawals", label: "Valider retraits" },
  { key: "canRejectWithdrawals", label: "Refuser retraits" },
  { key: "canViewBedouHistory", label: "Voir historique Bedou" },
  { key: "canAdjustBalanceManually", label: "Ajuster solde manuellement" },
  { key: "canViewDriverRequests", label: "Voir demandes livreurs" },
  { key: "canValidateDrivers", label: "Valider livreurs" },
  { key: "canRejectDrivers", label: "Refuser livreurs" },
  { key: "canSuspendDrivers", label: "Suspendre livreurs" },
  { key: "canRequestMissingDriverDocs", label: "Demander docs manquants" },
  { key: "canViewDriverDocuments", label: "Voir documents livreurs" },
  { key: "canViewPendingCourses", label: "Voir courses en attente" },
  { key: "canManualDispatch", label: "Dispatch manuel" },
  { key: "canReassignCourse", label: "Réassigner course" },
  { key: "canCancelAssignment", label: "Annuler assignation" },
  { key: "canContactDriver", label: "Contacter livreur" },
  { key: "canContactClient", label: "Contacter client" },
  { key: "canViewComplaints", label: "Voir réclamations" },
  { key: "canRespondComplaints", label: "Répondre réclamations" },
  { key: "canEscalateComplaints", label: "Escalader réclamations" },
  { key: "canCloseComplaints", label: "Clôturer réclamations" },
  { key: "canManageAds", label: "Gérer publicités" },
  { key: "canApproveAds", label: "Valider publicités" },
  { key: "canRejectAds", label: "Refuser publicités" },
  { key: "canViewPromoStats", label: "Voir stats promos" },
  { key: "canViewUsers", label: "Voir utilisateurs" },
  { key: "canBlockUsers", label: "Bloquer utilisateurs" },
  { key: "canUnblockUsers", label: "Débloquer utilisateurs" },
  { key: "canDeleteUsers", label: "Supprimer utilisateurs" },
  { key: "canViewAuditLogs", label: "Voir audit logs" },
];

const ROLES = Object.keys(ROLE_TEMPLATES);

export default function StaffAdmin() {
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({ userEmail: "", userName: "", roleLabel: "Gestionnaire Bedou", permissions: {} });
  const [processing, setProcessing] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [foundUsers, setFoundUsers] = useState([]);

  const load = async () => {
    const actor = await base44.auth.me();
    setMe(actor);
    if (actor?.role !== "admin" && actor?.email !== "weezyh2@gmail.com") {
      toast.error("Accès réservé à l'administrateur principal"); navigate(-1); return;
    }
    const staff = await base44.entities.StaffPermission.list("-created_date", 100);
    setStaffList(staff); setLoading(false);
  };

  useEffect(() => { load().catch(() => setLoading(false)); }, []);

  const searchUser = async () => {
    if (!userSearch.trim()) return;
    const users = await base44.entities.User.filter({ email: userSearch });
    if (users.length === 0) {
      const byName = await base44.entities.User.list("-created_date", 20);
      setFoundUsers(byName.filter(u => u.full_name?.toLowerCase().includes(userSearch.toLowerCase()) || u.email?.toLowerCase().includes(userSearch.toLowerCase())));
    } else {
      setFoundUsers(users);
    }
  };

  const applyTemplate = (roleLabel) => {
    const tpl = ROLE_TEMPLATES[roleLabel] || {};
    setForm(f => ({ ...f, roleLabel, permissions: { ...tpl } }));
  };

  const handleSubmit = async () => {
    if (!form.userEmail) { toast.error("Email obligatoire"); return; }
    setProcessing(true);
    const now = new Date().toISOString();
    const data = {
      userEmail: form.userEmail, userName: form.userName, roleLabel: form.roleLabel,
      isStaff: true, staffAccessActive: true, isActive: true,
      delegatedByAdminId: me.id, delegatedByAdminEmail: me.email, delegatedAt: now,
      ...form.permissions,
    };
    if (editMode && form.id) {
      await base44.entities.StaffPermission.update(form.id, data);
    } else {
      await base44.entities.StaffPermission.create(data);
    }
    await base44.entities.AuditLog.create({ actorEmail: me.email, actorName: me.full_name, actorRoleLabel: "Administrateur principal", actionType: editMode ? "STAFF_MODIFIED" : "STAFF_CREATED", targetType: "staff", targetName: form.userEmail, details: `Rôle: ${form.roleLabel}` });
    await base44.entities.Notification.create({ destinataire_email: form.userEmail, destinataire_role: "staff", titre: `✅ Accès personnel CDL ${editMode ? "modifié" : "accordé"}`, message: `Vous avez maintenant accès à l'espace ${form.roleLabel}. Connectez-vous pour y accéder.`, type: "success", lue: false });
    toast.success("Opération effectuée avec succès");
    setDialog(false); setEditMode(false); setForm({ userEmail: "", userName: "", roleLabel: "Gestionnaire Bedou", permissions: {} });
    load(); setProcessing(false);
  };

  const handleRemove = async (staff) => {
    if (!window.confirm("Confirmer cette action ?")) return;
    await base44.entities.StaffPermission.update(staff.id, { isActive: false, isStaff: false, staffAccessActive: false });
    await base44.entities.AuditLog.create({ actorEmail: me.email, actorName: me.full_name, actorRoleLabel: "Administrateur principal", actionType: "STAFF_REMOVED", targetType: "staff", targetName: staff.userEmail, details: "Accès retiré" });
    toast.success("Opération effectuée avec succès"); load();
  };

  const handleToggle = async (staff) => {
    const newVal = !staff.staffAccessActive;
    await base44.entities.StaffPermission.update(staff.id, { staffAccessActive: newVal, isActive: newVal });
    await base44.entities.AuditLog.create({ actorEmail: me.email, actorName: me.full_name, actorRoleLabel: "Administrateur principal", actionType: "STAFF_MODIFIED", targetType: "staff", targetName: staff.userEmail, details: newVal ? "Accès réactivé" : "Accès suspendu" });
    toast.success("Opération effectuée avec succès"); load();
  };

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Gestion du personnel CDL</h1>
          <p className="text-xs text-muted-foreground">Délégation des accès</p>
        </div>
        <Button size="sm" className="h-8 text-xs gap-1" onClick={() => { setEditMode(false); setForm({ userEmail: "", userName: "", roleLabel: "Gestionnaire Bedou", permissions: { ...ROLE_TEMPLATES["Gestionnaire Bedou"] } }); setDialog(true); }}>
          <Plus className="h-3 w-3" /> Ajouter
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border bg-card p-4 shadow-sm text-center">
          <p className="text-3xl font-extrabold text-primary">{staffList.filter(s => s.isActive).length}</p>
          <p className="text-xs text-muted-foreground mt-1">Membres actifs</p>
        </div>
        <div className="rounded-2xl border bg-card p-4 shadow-sm text-center">
          <p className="text-3xl font-extrabold text-slate-500">{staffList.filter(s => !s.isActive).length}</p>
          <p className="text-xs text-muted-foreground mt-1">Accès suspendus</p>
        </div>
      </div>

      <div className="space-y-3">
        {staffList.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Aucun membre du personnel configuré</p>}
        {staffList.map(staff => (
          <Card key={staff.id} className={`shadow-sm ${!staff.isActive ? "opacity-50" : ""}`}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold flex-shrink-0">{staff.userName?.charAt(0) || staff.userEmail?.charAt(0) || "?"}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{staff.userName || staff.userEmail}</p>
                  <p className="text-xs text-muted-foreground truncate">{staff.userEmail}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">{staff.roleLabel}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${staff.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>{staff.isActive ? "Actif" : "Suspendu"}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Délégué le {moment(staff.delegatedAt || staff.created_date).format("DD/MM/YYYY")}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={() => { setEditMode(true); setForm({ ...staff, permissions: { ...staff } }); setDialog(true); }}>
                  <Pencil className="h-3 w-3 mr-1" /> Modifier
                </Button>
                <Button size="sm" variant="outline" className={`h-7 text-xs flex-1 ${staff.staffAccessActive ? "border-orange-300 text-orange-600" : "border-green-300 text-green-600"}`} onClick={() => handleToggle(staff)}>
                  {staff.staffAccessActive ? "Suspendre" : "Réactiver"}
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs border-red-300 text-red-600" onClick={() => handleRemove(staff)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialog} onOpenChange={v => { if (!v) setDialog(false); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editMode ? "Modifier permissions" : "+ Ajouter un membre"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium">Email *</label>
              <input type="email" placeholder="email@example.com" value={form.userEmail} onChange={e => setForm(f => ({ ...f, userEmail: e.target.value }))}
                className="w-full mt-1 border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="text-xs font-medium">Nom</label>
              <input type="text" placeholder="Nom complet" value={form.userName} onChange={e => setForm(f => ({ ...f, userName: e.target.value }))}
                className="w-full mt-1 border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="text-xs font-medium">Rôle</label>
              <select value={form.roleLabel} onChange={e => applyTemplate(e.target.value)}
                className="w-full mt-1 border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white">
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold mb-2 block">Permissions détaillées</label>
              <div className="grid grid-cols-1 gap-1 max-h-48 overflow-y-auto border rounded-xl p-3">
                {ALL_PERMS.map(p => (
                  <label key={p.key} className="flex items-center gap-2 py-1 cursor-pointer">
                    <input type="checkbox" checked={!!(form.permissions[p.key] || form[p.key])} onChange={e => setForm(f => ({ ...f, permissions: { ...f.permissions, [p.key]: e.target.checked } }))}
                      className="rounded" />
                    <span className="text-xs">{p.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setDialog(false)}>Annuler</Button>
              <Button className="flex-1" onClick={handleSubmit} disabled={processing}>
                {processing ? "En cours…" : editMode ? "Enregistrer" : "Ajouter"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}