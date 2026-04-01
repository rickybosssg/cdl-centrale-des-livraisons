import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Search, UserPlus, User, Shield, RefreshCw, CheckCircle2, XCircle, Eye, Plus } from "lucide-react";
import DocumentViewer from "@/components/DocumentViewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import moment from "moment";

const PROFILES = [
  { key: "client", label: "Client", emoji: "👤", color: "bg-blue-100 text-blue-700" },
  { key: "livreur", label: "Livreur", emoji: "🛵", color: "bg-green-100 text-green-700" },
  { key: "partenaire", label: "Partenaire", emoji: "🏪", color: "bg-purple-100 text-purple-700" },
  { key: "commercial", label: "Commercial", emoji: "💼", color: "bg-amber-100 text-amber-700" },
  { key: "dispatcher", label: "Dispatcher", emoji: "🎯", color: "bg-cyan-100 text-cyan-700" },
  { key: "admin", label: "Administrateur", emoji: "🔐", color: "bg-red-100 text-red-700" },
];

function generateCode(name) {
  const prefix = (name || "CDL").replace(/\s+/g, "").toUpperCase().slice(0, 4);
  return prefix + Math.floor(100 + Math.random() * 900);
}

export default function GestionProfils() {
  const navigate = useNavigate();
  const [adminUser, setAdminUser] = useState(null);
  const [adminPerms, setAdminPerms] = useState(null);
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userProfiles, setUserProfiles] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [assignDialog, setAssignDialog] = useState(false);
  const [assignProfile, setAssignProfile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [logs, setLogs] = useState([]);
  const [tab, setTab] = useState('pending'); // 'pending', 'validated', 'none'

  useEffect(() => {
    const load = async () => {
      const me = await base44.auth.me();
      setAdminUser(me);
      if (me.role !== "admin") {
        const perms = await base44.entities.AdminPermission.filter({ user_email: me.email, actif: true });
        setAdminPerms(perms[0] || null);
      }
    };
    load();
  }, []);

  // Charger automatiquement les utilisateurs et leurs profils au mount UNE SEULE FOIS
  useEffect(() => {
    const loadData = async () => {
      console.log('[GestionProfils] Chargement des utilisateurs et profils...');
      setLoading(true);
      try {
        const [users, profiles] = await Promise.all([
          base44.entities.User.list("-created_date", 500),
          base44.entities.UserProfile.list("-created_date", 1000),
        ]);
        console.log('[GestionProfils] Utilisateurs chargés:', users?.length || 0);
        console.log('[GestionProfils] Profils chargés:', profiles?.length || 0);
        setUsers(users || []);
        setUserProfiles(profiles || []);
      } catch (err) {
        console.error('[GestionProfils] Erreur chargement:', err);
        toast.error('Erreur lors du chargement');
        setUsers([]);
        setUserProfiles([]);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const canDo = (permission) => {
    if (adminUser?.role === "admin") return true;
    if (!adminPerms) return false;
    const perms = JSON.parse(adminPerms.permissions || "[]");
    return perms.includes(permission);
  };

  // Récupérer les infos de profil pour chaque utilisateur et les catégoriser
  const getUserCategory = (user) => {
    const pendingProfiles = userProfiles.filter(p => p.user_email === user.email && p.status === 'en_attente');
    const validatedProfiles = userProfiles.filter(p => p.user_email === user.email && p.status === 'actif');
    
    if (pendingProfiles.length > 0) return 'pending';
    if (validatedProfiles.length > 0) return 'validated';
    return 'none';
  };

  // Récupérer les profils en attente pour un utilisateur
  const getPendingProfiles = (user) => {
    return userProfiles.filter(p => p.user_email === user.email && p.status === 'en_attente');
  };

  // Filtrer la liste existante en temps réel
  const filteredUsers = users.filter(u => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      u.full_name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.telephone?.includes(q) ||
      u.id?.includes(q)
    );
  });

  // Catégoriser les utilisateurs filtrés (nécessite un chargement des profils en bloc)
  const usersWithPendingProfiles = [];
  const usersWithValidatedProfiles = [];
  const usersWithoutProfiles = [];

  // Note: Pour une meilleure perf, on chargerait les profils une seule fois
  // Ici on les charge au besoin lors de l'ouverture

  const openUser = async (user) => {
    console.log('[GestionProfils] Ouverture fiche utilisateur:', user.email);
    setSelectedUser(user);
    try {
      const profiles = await base44.entities.UserProfile.filter({ user_email: user.email });
      console.log('[GestionProfils] Profils trouvés:', profiles?.length || 0);
      setUserProfiles(profiles || []);
      
      const history = await base44.entities.AdminActionLog.filter({ target_email: user.email }, "-created_date", 20);
      console.log('[GestionProfils] Historique chargé:', history?.length || 0);
      setLogs(history || []);
    } catch (err) {
      console.error('[GestionProfils] Erreur chargement fiche:', err);
      toast.error('Erreur chargement fiche: ' + err.message);
      setUserProfiles([]);
      setLogs([]);
    }
    setDialogOpen(true);
  };

  const handleAssignProfile = async () => {
    if (!assignProfile) return;
    setProcessing(true);

    const existing = userProfiles.find(p => p.profile_type === assignProfile);
    if (existing) {
      toast.error("Cet utilisateur a déjà ce profil");
      setProcessing(false);
      return;
    }

    // Créer le profil
    await base44.entities.UserProfile.create({
      user_email: selectedUser.email,
      profile_type: assignProfile,
      status: "actif",
      is_active_profile: userProfiles.length === 0,
      validated_at: new Date().toISOString(),
      validated_by: adminUser.email,
    });

    // Actions spécifiques par profil
    if (assignProfile === "commercial") {
      const code = generateCode(selectedUser.full_name);
      const existing = await base44.entities.CodePromo.filter({ commercial_email: selectedUser.email });
      if (existing.length === 0) {
        await base44.entities.CodePromo.create({
          commercial_email: selectedUser.email,
          commercial_name: selectedUser.full_name,
          code,
          statut: "valide",
          actif: true,
          nombre_utilisations: 0,
          commission_due: 0,
          commission_payee: 0,
        });
      }
    }

    if (assignProfile === "admin") {
      await base44.entities.User.update(selectedUser.id, { role: "admin" });
    }

    if (assignProfile === "dispatcher") {
      await base44.entities.User.update(selectedUser.id, { role: "admin" });
    }

    // Notifier l'utilisateur
    await base44.entities.Notification.create({
      destinataire_email: selectedUser.email,
      destinataire_role: assignProfile,
      titre: `✅ Profil ${PROFILES.find(p => p.key === assignProfile)?.label} attribué`,
      message: `L'administrateur vous a attribué le profil ${PROFILES.find(p => p.key === assignProfile)?.label}.`,
      type: "success",
      lue: false,
    });

    // Journal
    await base44.entities.AdminActionLog.create({
      admin_email: adminUser.email,
      object_type: "commercial",
      object_id: selectedUser.id,
      object_name: selectedUser.full_name,
      action: "validate",
      reason: `Attribution profil: ${assignProfile}`,
      target_email: selectedUser.email,
      old_data: JSON.stringify({ profiles: userProfiles.map(p => p.profile_type) }),
      new_data: JSON.stringify({ added_profile: assignProfile }),
    });

    toast.success(`Profil ${assignProfile} attribué avec succès !`);
    setAssignDialog(false);
    setAssignProfile(null);
    await openUser(selectedUser);
    setProcessing(false);
  };

  const handleValidateProfile = async (profile) => {
    if (!canDo("modifier_profils")) return toast.error("Permission insuffisante");
    setProcessing(true);
    try {
      const res = await base44.functions.invoke('validateLivreurProfile', {
        profile_id: profile.id,
        action: 'approve',
      });
      if (res.data?.success) {
        toast.success(`✅ Profil ${profile.profile_type} validé`);
        await openUser(selectedUser);
      }
    } catch (err) {
      toast.error('Erreur validation: ' + err.message);
    }
    setProcessing(false);
  };

  const handleRejectProfile = async (profile, reason) => {
    if (!canDo("modifier_profils")) return toast.error("Permission insuffisante");
    setProcessing(true);
    try {
      const res = await base44.functions.invoke('validateLivreurProfile', {
        profile_id: profile.id,
        action: 'reject',
        refusal_reason: reason || 'Documents insuffisants',
      });
      if (res.data?.success) {
        toast.success(`❌ Profil ${profile.profile_type} refusé`);
        await openUser(selectedUser);
      }
    } catch (err) {
      toast.error('Erreur refus: ' + err.message);
    }
    setProcessing(false);
  };

  const handleRemoveProfile = async (profile) => {
    if (!canDo("retirer_profil")) return toast.error("Permission insuffisante");
    setProcessing(true);

    await base44.entities.UserProfile.delete(profile.id);

    if (profile.profile_type === "admin" || profile.profile_type === "dispatcher") {
      const remaining = userProfiles.filter(p => p.id !== profile.id && (p.profile_type === "admin" || p.profile_type === "dispatcher"));
      if (remaining.length === 0) {
        await base44.entities.User.update(selectedUser.id, { role: "user" });
      }
    }

    await base44.entities.AdminActionLog.create({
      admin_email: adminUser.email,
      object_type: "commercial",
      object_id: selectedUser.id,
      object_name: selectedUser.full_name,
      action: "delete",
      reason: `Retrait profil: ${profile.profile_type}`,
      target_email: selectedUser.email,
    });

    toast.success("Profil retiré");
    await openUser(selectedUser);
    setProcessing(false);
  };

  const handleToggleProfile = async (profile) => {
    const newStatus = profile.status === "actif" ? "suspendu" : "actif";
    await base44.entities.UserProfile.update(profile.id, { status: newStatus });

    await base44.entities.AdminActionLog.create({
      admin_email: adminUser.email,
      object_type: "commercial",
      object_id: selectedUser.id,
      object_name: selectedUser.full_name,
      action: newStatus === "actif" ? "unsuspend" : "suspend",
      reason: `${newStatus === "actif" ? "Activation" : "Suspension"} profil: ${profile.profile_type}`,
      target_email: selectedUser.email,
    });

    toast.success(`Profil ${newStatus === "actif" ? "activé" : "suspendu"}`);
    await openUser(selectedUser);
  };

  const getProfileBadge = (type) => PROFILES.find(p => p.key === type);

  const canAssignProfile = (profileKey) => {
    if (adminUser?.role === "admin") return true;
    return canDo(`attribuer_${profileKey}`);
  };

  return (
    <div className="space-y-4 pb-16">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Gestion des profils</h1>
          <p className="text-xs text-muted-foreground">Attribuer, modifier ou retirer des profils utilisateurs</p>
        </div>
      </div>

      {/* Filtre recherche et onglets */}
      <div className="space-y-3">
        <Input
          placeholder="Filtrer : nom, email, téléphone, ID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1"
        />
        
        {/* Onglets catégories */}
        <div className="flex gap-2 border-b">
          <button
            onClick={() => setTab('pending')}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'pending'
                ? 'border-amber-500 text-amber-600'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            🆕 Nouvelles demandes ({filteredUsers.filter(u => {
              // Lazy count of pending
              return true; // À améliorer avec cache
            }).length})
          </button>
          <button
            onClick={() => setTab('validated')}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'validated'
                ? 'border-green-500 text-green-600'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            ✅ Profils validés
          </button>
          <button
            onClick={() => setTab('none')}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'none'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            🔹 Aucune demande
          </button>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center space-y-2">
            <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto" />
            <p className="text-sm text-muted-foreground">Chargement des utilisateurs...</p>
          </div>
        </div>
      )}

      {/* Aucun utilisateur */}
      {!loading && users.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Aucun utilisateur disponible</p>
        </div>
      )}

      {/* Résultats filtrés par onglet */}
      {!loading && users.length > 0 && (
        <div className="space-y-3">
          {/* Onglet : Nouvelles demandes */}
          {tab === 'pending' && (
            <div className="space-y-2">
              <p className="text-xs text-amber-700 font-medium">Affichage : Utilisateurs avec demandes en attente</p>
              {filteredUsers.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-8">Aucun résultat pour "{search}"</p>
              )}
              {filteredUsers.map(user => {
                const pendingProfs = getPendingProfiles(user);
                if (pendingProfs.length === 0) return null;
                return (
                  <Card key={user.id} className="border-2 border-amber-300 bg-amber-50/50 cursor-pointer hover:shadow-md transition-all">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center font-bold text-amber-700 flex-shrink-0 text-sm">
                          {user.full_name?.charAt(0) || "?"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-sm">{user.full_name}</p>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">NOUVEAU</span>
                            {user.role === "admin" && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Admin</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                          <p className="text-xs text-muted-foreground">{user.telephone}</p>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {pendingProfs.map(prof => {
                              const badge = getProfileBadge(prof.profile_type);
                              return (
                                <span key={prof.id} className={`text-[10px] px-2 py-0.5 rounded-full ${badge?.color} font-medium`}>
                                  {badge?.emoji} {badge?.label} — En attente
                                </span>
                              );
                            })}
                          </div>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <Button
                            size="sm" variant="outline" className="h-7 text-xs px-2"
                            onClick={e => { e.stopPropagation(); openUser(user); }}
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Onglet : Profils validés */}
          {tab === 'validated' && (
            <div className="space-y-2">
              <p className="text-xs text-green-700 font-medium">Affichage : Utilisateurs avec profils validés</p>
              {filteredUsers.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-8">Aucun résultat pour "{search}"</p>
              )}
              {filteredUsers.map(user => {
                // Vérifier s'il a au moins un profil validé
                const hasValidated = filteredUsers.some(u => u.id === user.id); // À améliorer
                return (
                  <Card key={user.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => openUser(user)}>
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center font-bold text-green-700 flex-shrink-0">
                        {user.full_name?.charAt(0) || "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{user.full_name}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                        <p className="text-xs text-muted-foreground">{user.telephone}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">✅ Validé</span>
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Onglet : Aucune demande */}
          {tab === 'none' && (
            <div className="space-y-2">
              <p className="text-xs text-blue-700 font-medium">Affichage : Utilisateurs sans demande de profil</p>
              {filteredUsers.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-8">Aucun résultat pour "{search}"</p>
              )}
              {filteredUsers.map(user => (
                <Card key={user.id} className="cursor-pointer hover:shadow-md transition-shadow opacity-60" onClick={() => openUser(user)}>
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-700 flex-shrink-0">
                      {user.full_name?.charAt(0) || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{user.full_name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                      <p className="text-xs text-muted-foreground">{user.telephone}</p>
                    </div>
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {users.length === 0 && search && !loading && (
        <p className="text-center text-sm text-muted-foreground py-8">Aucun utilisateur trouvé</p>
      )}

      {/* Dialog fiche utilisateur */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Fiche utilisateur</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              {/* Infos */}
              <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center font-bold text-lg text-primary">
                  {selectedUser.full_name?.charAt(0)}
                </div>
                <div>
                  <p className="font-bold">{selectedUser.full_name}</p>
                  <p className="text-xs text-muted-foreground">{selectedUser.email}</p>
                  <p className="text-xs text-muted-foreground">{selectedUser.telephone}</p>
                  <p className="text-xs text-muted-foreground">Inscrit {moment(selectedUser.created_date).format("DD/MM/YYYY")}</p>
                </div>
              </div>

              {/* Profils actuels */}
              <div className="space-y-2">
                <p className="text-sm font-semibold">Profils actuels ({userProfiles.length})</p>
                {userProfiles.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">Aucun profil attribué</p>
                )}
                {userProfiles.map(profile => {
                  const badge = getProfileBadge(profile.profile_type);
                  return (
                    <div key={profile.id} className="flex items-center gap-2 p-2 rounded-lg border bg-card">
                      <span className="text-lg">{badge?.emoji}</span>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{badge?.label || profile.profile_type}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {profile.status === 'en_attente' ? '⏳ En attente' : profile.status === 'actif' ? '✅ Actif' : '❌ Refusé'}
                          {profile.validated_at && ` · Validé ${moment(profile.validated_at).format("DD/MM/YY")}`}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        {profile.status === 'en_attente' && (
                          <>
                            <Button
                              size="sm" variant="outline" className="h-7 text-xs px-1.5 border-green-300 text-green-600 hover:bg-green-50"
                              onClick={() => handleValidateProfile(profile)}
                              disabled={processing}
                              title="Valider ce profil"
                            >
                              ✓
                            </Button>
                            <Button
                              size="sm" variant="outline" className="h-7 text-xs px-1.5 border-red-300 text-red-600 hover:bg-red-50"
                              onClick={() => handleRejectProfile(profile, 'Documents insuffisants')}
                              disabled={processing}
                              title="Refuser ce profil"
                            >
                              ✕
                            </Button>
                          </>
                        )}
                        {profile.status === 'actif' && (
                          <Button
                            size="sm" variant="outline" className="h-7 text-xs px-2"
                            onClick={() => handleToggleProfile(profile)}
                            disabled={processing}
                          >
                            ⏸
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Attribuer un profil */}
              {canDo("modifier_profils") && (
                <Button className="w-full" onClick={() => setAssignDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" /> Attribuer un profil
                </Button>
              )}

              {/* Documents si livreur */}
              {selectedUser && selectedProfile && selectedProfile.profile_type === 'livreur' && (
                <DocumentViewer
                  profileData={selectedProfile.documents_json}
                  profileType={selectedProfile.profile_type}
                />
              )}

              {/* Historique */}
              {logs.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Historique des actions</p>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {logs.map(log => (
                      <div key={log.id} className="text-xs p-2 rounded-lg bg-muted/40 border">
                        <div className="flex justify-between">
                          <span className="font-medium">{log.action} — {log.reason}</span>
                          <span className="text-muted-foreground">{moment(log.created_date).format("DD/MM/YY HH:mm")}</span>
                        </div>
                        <p className="text-muted-foreground">Par : {log.admin_email}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog attribution profil */}
      <Dialog open={assignDialog} onOpenChange={setAssignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Attribuer un profil</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Choisissez le profil à attribuer à <strong>{selectedUser?.full_name}</strong></p>
            <div className="grid grid-cols-2 gap-2">
              {PROFILES.map(p => {
                const hasProfile = userProfiles.some(up => up.profile_type === p.key);
                const canAssign = canAssignProfile(p.key);
                return (
                  <button
                    key={p.key}
                    onClick={() => canAssign && !hasProfile && setAssignProfile(p.key)}
                    disabled={hasProfile || !canAssign}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      assignProfile === p.key
                        ? "border-primary bg-primary/10"
                        : hasProfile
                        ? "border-border bg-muted opacity-50 cursor-not-allowed"
                        : !canAssign
                        ? "border-border bg-muted opacity-40 cursor-not-allowed"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <span className="text-xl">{p.emoji}</span>
                    <p className="text-xs font-semibold mt-1">{p.label}</p>
                    {hasProfile && <p className="text-[10px] text-green-600">Déjà attribué</p>}
                    {!canAssign && !hasProfile && <p className="text-[10px] text-red-500">Non autorisé</p>}
                  </button>
                );
              })}
            </div>
            {assignProfile === "admin" && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                ⚠️ Attention : Attribuer le rôle Administrateur donne un accès complet à la plateforme.
              </div>
            )}
            <Button
              className="w-full"
              onClick={handleAssignProfile}
              disabled={!assignProfile || processing}
            >
              {processing ? "Attribution en cours..." : "Confirmer l'attribution"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}