import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, RefreshCw, Wrench, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

export default function AuditUtilisateurs() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [repairing, setRepairing] = useState({});
  const [clients, setClients] = useState([]);
  const [partenaires, setPartenaires] = useState([]);
  const [codes, setCodes] = useState([]);

  const loadData = async () => {
    setLoading(true);
    const [usersData, clientsData, partenairesData, codesData] = await Promise.all([
      base44.entities.User.list("-created_date", 500),
      base44.entities.Client.list("-created_date", 500),
      base44.entities.Partenaire.list("-created_date", 500),
      base44.entities.CodePromo.list("-created_date", 500),
    ]);
    setUsers(usersData);
    setClients(clientsData);
    setPartenaires(partenairesData);
    setCodes(codesData);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const ADMIN_EMAILS = ["weezyh2@gmail.com"];

  const getIssues = (user) => {
    if (user.role === "admin" || ADMIN_EMAILS.includes(user.email)) return [];
    const issues = [];
    if (!user.user_type) issues.push("Pas de profil (user_type vide)");
    if (!user.onboarding_completed) issues.push("Onboarding non terminé");
    if (user.user_type === "client" && !clients.find(c => c.email === user.email)) {
      issues.push("Fiche Client manquante");
    }
    if (user.user_type === "partenaire" && !partenaires.find(p => p.user_email === user.email)) {
      issues.push("Fiche Partenaire manquante");
    }
    if (user.user_type === "commercial" && !codes.find(c => c.commercial_email === user.email)) {
      issues.push("Code promo manquant");
    }
    return issues;
  };

  const problemUsers = users.filter(u => getIssues(u).length > 0);

  const repairUser = async (user) => {
    setRepairing(prev => ({ ...prev, [user.id]: true }));
    try {
      // Si pas de user_type, forcer l'onboarding
      if (!user.user_type) {
        await base44.entities.User.update(user.id, { onboarding_completed: false });
        toast.success(`${user.full_name} — onboarding réinitialisé`);
        await loadData();
        return;
      }

      // Créer la fiche métier manquante
      const now = new Date().toISOString();
      if (user.user_type === "client") {
        const existing = clients.find(c => c.email === user.email);
        if (!existing) {
          await base44.entities.Client.create({
            nom_complet: user.full_name || "",
            email: user.email,
            numero_telephone: user.telephone || "",
            quartier_principal: user.quartier || "",
            statut_client: "Actif",
            date_inscription: now,
            nombre_total_courses: 0,
            total_depense: 0,
          });
        }
      }
      if (user.user_type === "partenaire") {
        const existing = partenaires.find(p => p.user_email === user.email);
        if (!existing) {
          await base44.entities.Partenaire.create({
            user_email: user.email,
            nom_commerce: user.full_name || "",
            nom_responsable: user.full_name || "",
            telephone: user.telephone || "",
            type_commerce: "Boutique",
            statut: "en_attente",
          });
        }
      }
      if (user.user_type === "commercial") {
        const existing = codes.find(c => c.commercial_email === user.email);
        if (!existing) {
          await base44.entities.CodePromo.create({
            commercial_email: user.email,
            commercial_name: user.full_name || "",
            code: "",
            statut: "en_attente",
            actif: false,
            nombre_utilisations: 0,
            commission_due: 0,
            commission_payee: 0,
            statut_paiement: "À jour",
          });
        }
      }

      // Marquer onboarding complet si pas encore fait
      if (!user.onboarding_completed && user.user_type) {
        await base44.entities.User.update(user.id, { onboarding_completed: true });
      }

      toast.success(`${user.full_name} réparé avec succès`);
      await loadData();
    } catch (err) {
      toast.error("Erreur: " + err.message);
    } finally {
      setRepairing(prev => ({ ...prev, [user.id]: false }));
    }
  };

  const repairAll = async () => {
    for (const user of problemUsers) {
      await repairUser(user);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Audit utilisateurs</h1>
          <p className="text-xs text-muted-foreground">{problemUsers.length} problème(s) détecté(s)</p>
        </div>
        <Button variant="outline" size="icon" onClick={loadData}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="p-3 rounded-xl bg-card border">
          <p className="font-bold text-lg">{users.length}</p>
          <p className="text-muted-foreground">Total users</p>
        </div>
        <div className="p-3 rounded-xl bg-card border">
          <p className="font-bold text-lg text-red-600">{problemUsers.length}</p>
          <p className="text-muted-foreground">Problèmes</p>
        </div>
        <div className="p-3 rounded-xl bg-card border">
          <p className="font-bold text-lg text-green-600">{users.length - problemUsers.length}</p>
          <p className="text-muted-foreground">OK</p>
        </div>
      </div>

      {problemUsers.length > 0 && (
        <Button className="w-full" onClick={repairAll}>
          <Wrench className="h-4 w-4 mr-2" /> Tout réparer ({problemUsers.length})
        </Button>
      )}

      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : problemUsers.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
          <p className="font-semibold text-green-700">Aucun problème détecté</p>
          <p className="text-sm text-muted-foreground">Tous les utilisateurs ont un profil cohérent</p>
        </div>
      ) : (
        <div className="space-y-3">
          {problemUsers.map(user => {
            const issues = getIssues(user);
            return (
              <Card key={user.id} className="border-red-200">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm">{user.full_name || "—"}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                      <p className="text-xs text-muted-foreground">Profil : {user.user_type || "aucun"}</p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => repairUser(user)}
                      disabled={repairing[user.id]}
                      className="flex-shrink-0"
                    >
                      <Wrench className="h-3.5 w-3.5 mr-1" />
                      {repairing[user.id] ? "..." : "Réparer"}
                    </Button>
                  </div>
                  <div className="space-y-1">
                    {issues.map((issue, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg px-2 py-1">
                        <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                        {issue}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}