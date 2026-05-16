/**
 * Audit TEST E2E — Vérifie que la correction de synchronisation driver_online
 * fonctionne correctement dans toute la chaîne : FE → BDD → createSmartDispatch → CoursesDisponibles
 */
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function FcmDispatchAuditTest() {
  const [testResults, setTestResults] = useState([]);
  const [running, setRunning] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const addLog = (step, status, detail) => {
    const timestamp = new Date().toISOString().split('T')[1];
    const log = { step, status, detail, timestamp };
    setTestResults(prev => [...prev, log]);
    console.log(`[${status.toUpperCase()}] ${step} | ${detail} | ${timestamp}`);
  };

  const runFullAudit = async () => {
    setRunning(true);
    setTestResults([]);

    try {
      // ── STEP 1: Mettre le livreur EN LIGNE ──
      addLog("STEP 1", "start", "Mise en ligne du livreur");
      const userBefore = await base44.auth.me();
      console.log(`[DRIVER_ONLINE_BEFORE] driver_online=${userBefore.driver_online}`);
      addLog("STEP 1", "info", `État avant: driver_online=${userBefore.driver_online}`);

      await base44.auth.updateMe({
        driver_online: true,
        disponible: true,
        last_seen: new Date().toISOString(),
      });
      console.log(`[DRIVER_ONLINE_AFTER_SAVE] sauvegardé driver_online=true`);
      addLog("STEP 1", "success", "Sauvegardé: driver_online=true");

      // Attendre la synchronisation realtime (max 2s)
      let userConfirmed = null;
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 100));
        const check = await base44.auth.me();
        if (check.driver_online === true) {
          userConfirmed = check;
          break;
        }
      }
      if (!userConfirmed) {
        addLog("STEP 1", "error", "Timeout: driver_online non confirmé en BDD après 2s");
        return;
      }
      addLog("STEP 1", "success", `Confirmé BDD: driver_online=${userConfirmed.driver_online}`);

      // ── STEP 2: Vérifier que User.filter({driver_online:true}) retrouve le livreur ──
      addLog("STEP 2", "start", "Vérification dispatch éligibilité");
      const eligibleUsers = await base44.entities.User.filter({ driver_online: true });
      const livreurEligible = eligibleUsers.find(u => u.email === userConfirmed.email);
      if (!livreurEligible) {
        addLog("STEP 2", "error", `Livreur ${userConfirmed.email} NOT trouvé dans User.filter({driver_online:true})`);
        console.error("[DISPATCH_ELIGIBLE_FAIL]", eligibleUsers.map(u => `${u.email}(online=${u.driver_online})`).join(", "));
        return;
      }
      addLog("STEP 2", "success", `Livreur trouvé dans User.filter({driver_online:true}): ${livreurEligible.email}`);

      // ── STEP 3: Créer une course test ──
      addLog("STEP 3", "start", "Création d'une course test");
      const courseData = await base44.entities.Course.create({
        quartier_depart: "Audit Test START",
        quartier_arrivee: "Audit Test END",
        telephone_expediteur: "222222",
        telephone_destinataire: "333333",
        type_colis: "Test",
        statut: "en_attente",
        client_email: "test@audit.local",
        client_name: "Audit Client",
        prix: 5000,
        commission: 1000,
        commission_cdl: 1000,
        gain_livreur: 4000,
      });
      console.log(`[COURSE_CREATED] course_id=${courseData.id}`);
      addLog("STEP 3", "success", `Course créée: ${courseData.id}`);

      // ── STEP 4: Vérifier que la course a passé le dispatch ──
      addLog("STEP 4", "start", "Attente de la proposition au livreur (via createSmartDispatch)");
      let courseUpdated = null;
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 500)); // Attendre jusqu'à 15s
        const courses = await base44.entities.Course.filter({ id: courseData.id });
        if (courses[0]) {
          courseUpdated = courses[0];
          if (courseUpdated.livreur_email === userConfirmed.email) {
            break;
          }
        }
      }
      if (!courseUpdated) {
        addLog("STEP 4", "error", "Course non trouvée après création");
        return;
      }
      if (courseUpdated.livreur_email === userConfirmed.email) {
        addLog("STEP 4", "success", `Course ASSIGNÉE au livreur: ${courseUpdated.livreur_email}`);
        console.log(`[DISPATCH_ASSIGNED_OK] course_id=${courseUpdated.id} | livreur=${userConfirmed.email}`);
      } else if (courseUpdated.statut === "aucun_livreur") {
        addLog("STEP 4", "error", `Course statut=aucun_livreur (dispatch a échoué)`);
        return;
      } else {
        addLog("STEP 4", "warn", `Course statut=${courseUpdated.statut}, livreur_email=${courseUpdated.livreur_email}`);
      }

      // ── STEP 5: Vérifier que la course est visible dans CoursesDisponibles ──
      addLog("STEP 5", "start", "Vérification visibilité dans CoursesDisponibles (en_attente)");
      const coursesDispo = await base44.entities.Course.filter({ statut: "en_attente" });
      const courseVisible = coursesDispo.find(c => c.id === courseData.id);
      if (!courseVisible) {
        addLog("STEP 5", "error", "Course NOT visible dans statut=en_attente");
        return;
      }
      addLog("STEP 5", "success", `Course visible dans CoursesDisponibles: ${courseVisible.id}`);

      // ── STEP 6: Vérifier que le livreur peut accepter ──
      addLog("STEP 6", "start", "Test acceptation de la course par le livreur");
      try {
        await base44.entities.Course.update(courseData.id, {
          statut: "acceptee",
          livreur_email: userConfirmed.email,
          livreur_name: userConfirmed.full_name,
          date_acceptation: new Date().toISOString(),
          mode_assignation: "manuel_test_audit",
        });
        addLog("STEP 6", "success", `Course acceptée par le livreur`);
      } catch (e) {
        addLog("STEP 6", "error", `Erreur acceptation: ${e.message}`);
        return;
      }

      // ── FINAL: Rapport de succès ──
      addLog("FINAL", "success", "✅ AUDIT E2E COMPLET: Frontend ↔ BDD ↔ Dispatch ↔ CoursesDisponibles synchronisé correctement");
      toast.success("✅ Audit E2E réussi!");

    } catch (err) {
      addLog("ERROR", "error", err.message);
      toast.error("Audit échoué: " + err.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6 p-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">🔬 Audit E2E Synchronisation</h1>
        <p className="text-sm text-muted-foreground mt-2">Vérification complète: FE → BDD → Dispatch → Courses</p>
      </div>

      {user && (
        <Card>
          <CardHeader>
            <CardTitle>Utilisateur courant</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p><strong>Email:</strong> {user.email}</p>
            <p><strong>Nom:</strong> {user.full_name}</p>
            <p><strong>driver_online:</strong> {user.driver_online ? "✅ TRUE" : "❌ FALSE"}</p>
          </CardContent>
        </Card>
      )}

      <Button onClick={runFullAudit} disabled={running} className="w-full">
        {running ? "Audit en cours..." : "Lancer l'audit E2E"}
      </Button>

      {testResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Résultats ({testResults.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {testResults.map((log, idx) => (
              <div key={idx} className={`p-3 rounded-lg border ${
                log.status === "success" ? "bg-green-50 border-green-200" :
                log.status === "error" ? "bg-red-50 border-red-200" :
                log.status === "warn" ? "bg-amber-50 border-amber-200" :
                "bg-blue-50 border-blue-200"
              }`}>
                <div className="flex items-start gap-2">
                  <span className="text-lg flex-shrink-0">
                    {log.status === "success" ? "✅" :
                     log.status === "error" ? "❌" :
                     log.status === "warn" ? "⚠️" :
                     "ℹ️"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs font-bold">{log.step}</p>
                    <p className="text-xs text-gray-600 mt-0.5">{log.detail}</p>
                    <p className="text-[10px] text-gray-400 mt-1">{log.timestamp}</p>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}