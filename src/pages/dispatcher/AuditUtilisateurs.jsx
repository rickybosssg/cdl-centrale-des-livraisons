import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, RefreshCw, Wrench, AlertTriangle, CheckCircle2, UserCog, Search, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

const ADMIN_EMAILS = ["weezyh2@gmail.com"];
const ROLES = ["client", "livreur", "partenaire", "commercial"];
const ROLE_PRIORITY = ['admin', 'partenaire', 'commercial', 'livreur', 'client'];

const STATUT_CONFIG = {
  OK:              { color: "bg-green-100 text-green-700",  label: "✅ OK" },
  ROLE_MANQUANT:   { color: "bg-red-100 text-red-700",     label: "🚫 Sans profil" },
  DESYNC:          { color: "bg-purple-100 text-purple-700",label: "🔄 Désynchronisé" },
  INCOMPLET:       { color: "bg-orange-100 text-orange-700",label: "📝 Incomplet" },
  ADMIN:           { color: "bg-blue-100 text-blue-700",   label: "🛡️ Admin" },
};

function pickPrimaryRole(profileTypes) {
  for (const r of ROLE_PRIORITY) {
    if (profileTypes.includes(r)) return r;
  }
  return profileTypes[0] || null;
}

// Source de vérité : UserProfile
function detectStatut(user, profilesByEmail) {
  if (user.role === "admin" || ADMIN_EMAILS.includes(user.email)) return "ADMIN";
  const profiles = profilesByEmail[user.email] || [];
  const profileTypes = profiles.map(p => p.profile_type).filter(Boolean);

  if (profileTypes.length === 0) {
    // Vrai sans profil
    return "ROLE_MANQUANT";
  }

  const expectedRole = pickPrimaryRole(profileTypes);
  if (user.user_type !== expectedRole || !user.onboarding_completed) {
    return "DESYNC"; // Profil existe mais user_type ne correspond pas
  }
  if (!user.onboarding_completed) return "INCOMPLET";
  return "OK";
}

// Réparer un user : synchroniser user_type depuis ses profils UserProfile réels
async function repairOne(user, profilesByEmail) {
  const profiles = profilesByEmail[user.email] || [];
  const profileTypes = profiles.map(p => p.profile_type).filter(Boolean);

  if (profileTypes.length === 0) {
    console.log(`[Audit] Aucun profil pour ${user.email} — pas de réparation`);
    return;
  }

  const primaryRole = pickPrimaryRole(profileTypes);
  console.log(`[Audit] Réparation ${user.email} : ${user.user_type || 'null'} → ${primaryRole} (profils: [${profileTypes.join(', ')}])`);

  await base44.entities.User.update(user.id, {
    user_type: primaryRole,
    onboarding_completed: true,
  });
}

export default function AuditUtilisateurs() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [repairLogs, setRepairLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [repairing, setRepairing] = useState({});
  const [repairingAll, setRepairingAll] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [filterStatut, setFilterStatut] = useState("TOUS");
  const [search, setSearch] = useState("");
  const [assignDialog, setAssignDialog] = useState(null);
  const [assignRole, setAssignRole] = useState("client");
  const [assigning, setAssigning] = useState(false);

  const loadData = async () => {
    setLoading(true);
    const [usersData, profilesData, logsData] = await Promise.all([
      base44.entities.User.list("-created_date", 500),
      base44.entities.UserProfile.filter({ deleted: false }),
      base44.entities.RepairLog.list("-created_date", 100),
    ]);
    setUsers(usersData);
    setProfiles(profilesData);
    setRepairLogs(logsData);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  // Index profils par email
  const profilesByEmail = {};
  for (const p of profiles) {
    if (!p.user_email) continue;
    if (!profilesByEmail[p.user_email]) profilesByEmail[p.user_email] = [];
    profilesByEmail[p.user_email].push(p);
  }

  const enriched = users.map(u => {
    const userProfiles = profilesByEmail[u.email] || [];
    const profileTypes = userProfiles.map(p => p.profile_type).filter(Boolean);
    return {
      ...u,
      _profiles: userProfiles,
      _profileTypes: profileTypes,
      statut: detectStatut(u, profilesByEmail),
    };
  });

  const counts = {
    TOUS: enriched.length,
    OK: enriched.filter(u => u.statut === "OK").length,
    ROLE_MANQUANT: enriched.filter(u => u.statut === "ROLE_MANQUANT").length,
    DESYNC: enriched.filter(u => u.statut === "DESYNC").length,
    INCOMPLET: enriched.filter(u => u.statut === "INCOMPLET").length,
    ADMIN: enriched.filter(u => u.statut === "ADMIN").length,
  };

  const filtered = enriched.filter(u => {
    const matchFiltre = filterStatut === "TOUS" || u.statut === filterStatut;
    const q = search.toLowerCase();
    const matchSearch = !q || (u.full_name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q) || (u.telephone || "").includes(q);
    return matchFiltre && matchSearch;
  });

  const repairableUsers = enriched.filter(u => u.statut === "DESYNC" || u.statut === "INCOMPLET");

  const repairUser = async (user) => {
    setRepairing(prev => ({ ...prev, [user.id]: true }));
    try {
      await repairOne(user, profilesByEmail);
      try { await base44.entities.RepairLog.create({ user_id: user.id, user_email: user.email, user_type: pickPrimaryRole(user._profileTypes || []) || '', correction: 'audit_manuel', detail: `Réparation manuelle : profils [${(user._profileTypes || []).join(', ')}]`, contexte: 'audit' }); } catch (_) {}
      toast.success(`${user.full_name || user.email} réparé`);
      await loadData();
    } catch (err) {
      toast.error("Erreur : " + err.message);
    } finally {
      setRepairing(prev => ({ ...prev, [user.id]: false }));
    }
  };

  const repairAll = async () => {
    setRepairingAll(true);
    let count = 0;
    for (const user of repairableUsers) {
      try { await repairOne(user, profilesByEmail); count++; } catch (_) {}
    }
    toast.success(`${count} compte(s) réparé(s)`);
    await loadData();
    setRepairingAll(false);
  };

  const syncAllViaBackend = async () => {
    setSyncing(true);
    try {
      const res = await base44.functions.invoke('syncUserRoles', {});
      if (res.data?.success) {
        const { fixed, noProfile, errors } = res.data.results;
        toast.success(`✅ Sync terminée : ${fixed} réparé(s), ${noProfile} sans profil, ${errors} erreur(s)`);
        await loadData();
      } else {
        toast.error('Erreur sync : ' + (res.data?.error || 'inconnue'));
      }
    } catch (err) {
      toast.error('Erreur : ' + err.message);
    }
    setSyncing(false);
  };

  const assignerRole = async () => {
    if (!assignDialog) return;
    setAssigning(true);
    try {
      await base44.entities.User.update(assignDialog.id, {
        user_type: assignRole,
        onboarding_completed: true,
      });
      const updated = { ...assignDialog, user_type: assignRole, onboarding_completed: true };
      await repairOne(updated);
      toast.success(`Rôle "${assignRole}" attribué et fiche créée`);
      setAssignDialog(null);
      await loadData();
    } catch (err) {
      toast.error("Erreur : " + err.message);
    } finally {
      setAssigning(false);
    }
  };

  const FILTRES = [
    { key: "TOUS", label: "Tous" },
    { key: "ROLE_MANQUANT", label: "Sans profil" },
    { key: "DESYNC", label: "Désynchronisé" },
    { key: "INCOMPLET", label: "Incomplet" },
    { key: "OK", label: "OK" },
    { key: "ADMIN", label: "Admin" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Audit utilisateurs</h1>
          <p className="text-xs text-muted-foreground">{users.length} utilisateurs · {repairableUsers.length} à réparer</p>
        </div>
        <Button variant="outline" size="icon" onClick={loadData}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {/* Bouton sync globale */}
      <Button className="w-full bg-purple-600 hover:bg-purple-700" onClick={syncAllViaBackend} disabled={syncing}>
        <Zap className="h-4 w-4 mr-2" />
        {syncing ? "Synchronisation en cours..." : "🔄 Sync globale des rôles (source: UserProfile)"}
      </Button>

      {/* Compteur réparations */}
      {repairLogs.length > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-blue-50 border border-blue-200 text-sm">
          <Wrench className="h-4 w-4 text-blue-600 flex-shrink-0" />
          <div>
            <span className="font-bold text-blue-700">{repairLogs.length}</span>
            <span className="text-blue-600"> réparation(s) automatique(s) enregistrée(s)</span>
            <span className="text-xs text-blue-500 ml-1">({[...new Set(repairLogs.map(l => l.user_email))].length} utilisateur(s) uniques)</span>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="p-3 rounded-xl bg-card border"><p className="font-bold text-lg">{counts.TOUS}</p><p className="text-muted-foreground">Total</p></div>
        <div className="p-3 rounded-xl bg-green-50 border border-green-200"><p className="font-bold text-lg text-green-600">{counts.OK}</p><p className="text-green-700">OK</p></div>
        <div className="p-3 rounded-xl bg-red-50 border border-red-200"><p className="font-bold text-lg text-red-600">{counts.ROLE_MANQUANT + counts.DESYNC + counts.INCOMPLET}</p><p className="text-red-700">Problèmes</p></div>
      </div>

      {/* Bouton réparation massive */}
      {repairableUsers.length > 0 && (
        <Button className="w-full" onClick={repairAll} disabled={repairingAll}>
          <Wrench className="h-4 w-4 mr-2" />
          {repairingAll ? "Réparation en cours..." : `Tout réparer (${repairableUsers.length} comptes)`}
        </Button>
      )}

      {/* Recherche */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Rechercher par nom, email, téléphone..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Filtres */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {FILTRES.map(f => (
          <button key={f.key} onClick={() => setFilterStatut(f.key)}
            className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              filterStatut === f.key ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border"
            }`}>
            {f.label}
            {counts[f.key] !== undefined && counts[f.key] > 0 && (
              <span className={`ml-1.5 text-[10px] font-bold ${filterStatut === f.key ? "opacity-80" : "text-muted-foreground"}`}>
                {counts[f.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
          <p className="font-semibold text-green-700">Aucun problème ici</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(user => {
            const cfg = STATUT_CONFIG[user.statut] || STATUT_CONFIG.INCOMPLET;
            const isRepairing = repairing[user.id];
            const canRepair = user.statut === "INCOMPLET";
            const needsRole = user.statut === "ROLE_MANQUANT";
            return (
              <Card key={user.id} className={user.statut === "ROLE_MANQUANT" ? "border-red-200" : user.statut === "DESYNC" ? "border-purple-200" : ""}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{user.full_name || "—"}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                      {user.telephone && <p className="text-xs text-muted-foreground">{user.telephone}</p>}
                      <p className="text-xs mt-0.5">
                        <span className="text-muted-foreground">Rôle actuel : </span>
                        <span className={`font-semibold ${user.user_type ? "text-foreground" : "text-red-500"}`}>
                          {user.user_type || "aucun"}
                        </span>
                      </p>
                      {user._profileTypes?.length > 0 && (
                        <p className="text-xs mt-0.5">
                          <span className="text-muted-foreground">Profils : </span>
                          <span className="font-semibold text-primary">{user._profileTypes.join(', ')}</span>
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5 items-end flex-shrink-0">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span>
                      {canRepair && (
                        <Button size="sm" className="h-7 text-xs" onClick={() => repairUser(user)} disabled={isRepairing}>
                          <Wrench className="h-3 w-3 mr-1" />{isRepairing ? "..." : "Réparer"}
                        </Button>
                      )}
                      {needsRole && (
                        <Button size="sm" variant="outline" className="h-7 text-xs border-red-300 text-red-600" onClick={() => { setAssignDialog(user); setAssignRole("client"); }}>
                          <UserCog className="h-3 w-3 mr-1" />Assigner rôle
                        </Button>
                      )}
                    {user.statut === "DESYNC" && (
                        <Button size="sm" className="h-7 text-xs bg-purple-600 hover:bg-purple-700" onClick={() => repairUser(user)} disabled={repairing[user.id]}>
                          <Wrench className="h-3 w-3 mr-1" />{repairing[user.id] ? "..." : "Sync"}
                        </Button>
                      )}
                    </div>
                  </div>
                  {user.statut === "DESYNC" && (
                    <div className="flex items-center gap-2 text-xs text-purple-700 bg-purple-50 rounded-lg px-2 py-1">
                      <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                      Profil(s) détecté(s) [{user._profileTypes?.join(', ')}] mais user_type=«{user.user_type || 'null'}» — cliquez Sync
                    </div>
                  )}
                  {user.statut === "ROLE_MANQUANT" && (
                    <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 rounded-lg px-2 py-1">
                      <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                      Aucun profil trouvé — utilisateur sans rôle
                    </div>
                  )}
                  {user.statut === "INCOMPLET" && (
                    <div className="flex items-center gap-2 text-xs text-orange-700 bg-orange-50 rounded-lg px-2 py-1">
                      <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                      Onboarding non terminé (rôle : {user.user_type || "?"})
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog assignation de rôle */}
      <Dialog open={!!assignDialog} onOpenChange={v => { if (!v) setAssignDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCog className="h-5 w-5 text-primary" />Assigner un rôle
            </DialogTitle>
          </DialogHeader>
          {assignDialog && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted text-sm">
                <p className="font-semibold">{assignDialog.full_name || "—"}</p>
                <p className="text-muted-foreground text-xs">{assignDialog.email}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Choisir un rôle :</p>
                <div className="grid grid-cols-2 gap-2">
                  {ROLES.map(r => (
                    <button key={r} onClick={() => setAssignRole(r)}
                      className={`p-3 rounded-xl border text-sm font-medium capitalize transition-all ${
                        assignRole === r ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"
                      }`}>
                      {r === "client" ? "👤" : r === "livreur" ? "🛵" : r === "partenaire" ? "🏪" : "📢"} {r.charAt(0).toUpperCase() + r.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-2">
                Cette action va : enregistrer le rôle, marquer l'onboarding complet, et créer la fiche métier correspondante.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setAssignDialog(null)}>Annuler</Button>
                <Button className="flex-1" onClick={assignerRole} disabled={assigning}>
                  {assigning ? "Enregistrement..." : `Assigner "${assignRole}"`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}