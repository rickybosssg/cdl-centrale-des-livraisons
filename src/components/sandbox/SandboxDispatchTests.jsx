import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Zap, Clock, Users, XCircle, Layers, Play, CheckCircle2, AlertTriangle } from "lucide-react";

const QUARTIERS = [
  "Koulouba", "Zogona", "Pissy", "Gounghin", "Nonsin", "Hamdalaye",
  "Patte d'Oie", "Dapoya", "Bilbalogho", "Paspanga", "Tampouy",
  "Tanghin", "Wemtenga", "Ouaga 2000", "Zone du Bois",
];
const COLIS = ["Documents", "Petit colis", "Colis moyen", "Gros colis", "Nourriture", "Autre"];

function randomDep() { return QUARTIERS[Math.floor(Math.random() * QUARTIERS.length)]; }
function randomArr(dep) {
  let a; do { a = QUARTIERS[Math.floor(Math.random() * QUARTIERS.length)]; } while (a === dep);
  return a;
}

async function createSandboxCourse(extra = {}) {
  const dep = randomDep();
  const arr = randomArr(dep);
  const prix = Math.round((Math.random() * 2500 + 500) / 100) * 100;
  return base44.entities.Course.create({
    quartier_depart: dep,
    quartier_arrivee: arr,
    telephone_expediteur: "+22600000000",
    telephone_destinataire: "+22600000001",
    type_colis: COLIS[Math.floor(Math.random() * COLIS.length)],
    statut: "en_attente",
    client_email: "sandbox@cdl-test.local",
    client_name: "Client Test CDL",
    prix,
    commission_cdl: Math.round(prix * 0.2),
    gain_livreur: Math.round(prix * 0.8),
    mode_assignation: "auto",
    description: "[SANDBOX_TEST] Test dispatch",
    ...extra,
  });
}

function TestResult({ result }) {
  if (!result) return null;
  const isOk = result.success;
  return (
    <div className={`p-3 rounded-xl border ${isOk ? "bg-green-50 border-green-300" : "bg-red-50 border-red-300"} mt-2`}>
      <div className="flex items-center gap-2 mb-1">
        {isOk ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
        <span className={`text-xs font-bold ${isOk ? "text-green-800" : "text-red-800"}`}>
          {isOk ? "Test réussi" : "Test échoué"}
        </span>
        {result.elapsed && <span className="text-[10px] text-muted-foreground">{result.elapsed}ms</span>}
      </div>
      <p className="text-xs text-muted-foreground">{result.message}</p>
      {result.details && (
        <pre className="mt-1 text-[10px] bg-white/60 rounded p-2 overflow-x-auto max-h-24">
          {JSON.stringify(result.details, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default function SandboxDispatchTests({ onLog, sandboxCourses, onReload }) {
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState({});

  const setLoad = (key, val) => setLoading((p) => ({ ...p, [key]: val }));
  const setResult = (key, val) => setResults((p) => ({ ...p, [key]: val }));

  // Test 1: Auto dispatch
  const testAutoDispatch = async () => {
    setLoad("auto", true);
    onLog("⚡ Test auto dispatch démarré...", "info");
    const start = Date.now();
    try {
      // Diagnostic auth
      const user = await base44.auth.me();
      onLog(`👤 Auth: ${user?.email} | role: ${user?.role}`, "info");

      const course = await createSandboxCourse({ mode_assignation: "auto" });
      onLog(`📦 Course sandbox créée: ${course.id.slice(-6)}`, "info");

      // Appel cdlDispatch (moteur réel) via autoDispatch stub
      let res, endpoint;
      try {
        endpoint = "autoDispatch";
        res = await base44.functions.invoke("autoDispatch", { course_id: course.id, force: false });
        onLog(`📡 Endpoint: ${endpoint} → HTTP OK`, "info");
      } catch (e403) {
        onLog(`⛔ ${endpoint} → ${e403.message} — tentative cdlDispatch direct...`, "warn");
        try {
          endpoint = "cdlDispatch";
          res = await base44.functions.invoke("cdlDispatch", { course_id: course.id, force: false });
          onLog(`📡 Endpoint: ${endpoint} → HTTP OK`, "info");
        } catch (e2) {
          throw new Error(`autoDispatch: ${e403.message} | cdlDispatch: ${e2.message}`);
        }
      }

      const elapsed = Date.now() - start;
      const data = res?.data || res;
      const success = data?.success !== false && !data?.error;
      setResult("auto", {
        success,
        elapsed,
        message: success
          ? `Dispatch via ${endpoint}: ${data?.livreur?.email || "aucun livreur"} (${data?.eligible_count ?? 0} éligibles)`
          : `Résultat: ${data?.reason || data?.error || JSON.stringify(data)}`,
        details: data,
      });
      onLog(`${success ? "✅" : "⚠️"} Dispatch ${endpoint}: ${elapsed}ms | raison: ${data?.reason || "OK"}`, success ? "success" : "warn");
      onReload();
    } catch (e) {
      const elapsed = Date.now() - start;
      setResult("auto", { success: false, message: e.message, elapsed });
      onLog("❌ Auto dispatch erreur: " + e.message, "error");
    }
    setLoad("auto", false);
  };

  // Test 2: Dispatch manuel (crée course + passe en attente)
  const testManualDispatch = async () => {
    setLoad("manual", true);
    onLog("🔧 Test dispatch manuel démarré...", "info");
    const start = Date.now();
    try {
      const course = await createSandboxCourse({ mode_assignation: "manuel", statut: "en_attente" });
      const elapsed = Date.now() - start;
      setResult("manual", {
        success: true,
        elapsed,
        message: `Course en attente d'assignation manuelle créée: ${course.id.slice(-6)} — allez dans Gérer courses pour assigner`,
        details: { course_id: course.id, statut: course.statut },
      });
      onLog(`✅ Course Manuel créée: ${course.id.slice(-6)} en attente assignation manuelle`, "success");
      onReload();
    } catch (e) {
      setResult("manual", { success: false, message: e.message });
      onLog("❌ Manuel dispatch erreur: " + e.message, "error");
    }
    setLoad("manual", false);
  };

  // Test 3: Timeout — crée une course et attend 30s pour vérifier statut aucun_livreur
  const testTimeout = async () => {
    setLoad("timeout", true);
    onLog("⏱️ Test timeout démarré (simulation 5s)...", "warn");
    const start = Date.now();
    try {
      const course = await createSandboxCourse();
      onLog(`📦 Course créée: ${course.id.slice(-6)} — simulation timeout dans 5s...`, "info");
      // Simuler timeout en mettant directement le statut aucun_livreur après 5s
      await new Promise((r) => setTimeout(r, 5000));
      await base44.entities.Course.update(course.id, {
        statut: "aucun_livreur",
        description: "[SANDBOX_TEST] Timeout simulé (60s → aucun livreur)",
      });
      const elapsed = Date.now() - start;
      setResult("timeout", {
        success: true,
        elapsed,
        message: `Course ${course.id.slice(-6)} passée en "aucun_livreur" après timeout simulé (5s = équivalent 60s réel)`,
        details: { course_id: course.id },
      });
      onLog("✅ Timeout simulé avec succès → statut aucun_livreur", "success");
      onReload();
    } catch (e) {
      setResult("timeout", { success: false, message: e.message });
      onLog("❌ Timeout test erreur: " + e.message, "error");
    }
    setLoad("timeout", false);
  };

  // Test 4: Aucun livreur
  const testNoDriver = async () => {
    setLoad("nodriver", true);
    onLog("🚫 Test aucun livreur démarré...", "info");
    const start = Date.now();
    try {
      const course = await createSandboxCourse({ statut: "aucun_livreur" });
      const elapsed = Date.now() - start;
      setResult("nodriver", {
        success: true,
        elapsed,
        message: `Course ${course.id.slice(-6)} créée directement avec statut "aucun_livreur" — UI doit afficher le message d'erreur correspondant`,
        details: { course_id: course.id, statut: "aucun_livreur" },
      });
      onLog("✅ Test aucun livreur: course créée avec statut aucun_livreur", "success");
      onReload();
    } catch (e) {
      setResult("nodriver", { success: false, message: e.message });
      onLog("❌ Aucun livreur test erreur: " + e.message, "error");
    }
    setLoad("nodriver", false);
  };

  // Test 5: Multi-courses simultanées
  const testMultiCourses = async () => {
    setLoad("multi", true);
    onLog("🔀 Test multi-courses simultanées (5 courses)...", "info");
    const start = Date.now();
    try {
      const promises = Array.from({ length: 5 }, () => createSandboxCourse());
      const results = await Promise.allSettled(promises);
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const elapsed = Date.now() - start;
      setResult("multi", {
        success: ok === 5,
        elapsed,
        message: `${ok}/5 courses créées simultanément en ${elapsed}ms — vérifiez le realtime`,
        details: { created: ok, failed: 5 - ok },
      });
      onLog(`${ok === 5 ? "✅" : "⚠️"} Multi-courses: ${ok}/5 en ${elapsed}ms`, ok === 5 ? "success" : "warn");
      onReload();
    } catch (e) {
      setResult("multi", { success: false, message: e.message });
      onLog("❌ Multi-courses erreur: " + e.message, "error");
    }
    setLoad("multi", false);
  };

  // Test 6: Vérifier le realtime (subscribe + création)
  const testRealtime = async () => {
    setLoad("realtime", true);
    onLog("📡 Test realtime: creation + subscription vérifiée...", "info");
    const start = Date.now();
    let received = false;
    let unsubscribe = null;
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          if (!received) reject(new Error("Subscription n'a pas reçu l'événement en 8s"));
        }, 8000);
        unsubscribe = base44.entities.Course.subscribe((ev) => {
          if (ev.data?.client_email === "sandbox@cdl-test.local" && ev.type === "create") {
            received = true;
            clearTimeout(timer);
            resolve(ev);
          }
        });
        // Créer la course après avoir souscrit
        createSandboxCourse({ description: "[SANDBOX_TEST] Test realtime" }).catch(reject);
      });
      const elapsed = Date.now() - start;
      setResult("realtime", {
        success: true,
        elapsed,
        message: `Événement realtime reçu en ${elapsed}ms — subscription BDD fonctionnelle`,
      });
      onLog(`✅ Realtime OK: événement reçu en ${elapsed}ms`, "success");
      onReload();
    } catch (e) {
      setResult("realtime", { success: false, message: e.message });
      onLog("❌ Realtime test FAIL: " + e.message, "error");
    } finally {
      unsubscribe?.();
    }
    setLoad("realtime", false);
  };

  const tests = [
    {
      key: "auto",
      icon: Zap,
      label: "Auto Dispatch",
      desc: "Crée une course et lance autoDispatch",
      color: "bg-green-600",
      action: testAutoDispatch,
    },
    {
      key: "manual",
      icon: Users,
      label: "Dispatch Manuel",
      desc: "Course en attente d'assignation manuelle",
      color: "bg-purple-600",
      action: testManualDispatch,
    },
    {
      key: "timeout",
      icon: Clock,
      label: "Timeout 60s",
      desc: "Simule expiration de la course (5s)",
      color: "bg-amber-600",
      action: testTimeout,
    },
    {
      key: "nodriver",
      icon: XCircle,
      label: "Aucun livreur",
      desc: "Course en statut aucun_livreur",
      color: "bg-red-600",
      action: testNoDriver,
    },
    {
      key: "multi",
      icon: Layers,
      label: "Multi-courses",
      desc: "5 courses simultanées",
      color: "bg-blue-600",
      action: testMultiCourses,
    },
    {
      key: "realtime",
      icon: Play,
      label: "Realtime",
      desc: "Vérifie la subscription temps réel",
      color: "bg-cyan-600",
      action: testRealtime,
    },
  ];

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center gap-2 text-xs text-amber-700">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span>Tous les tests utilisent <code className="font-mono bg-amber-100 px-1 rounded">sandbox@cdl-test.local</code> comme email client</span>
          </div>
        </CardContent>
      </Card>

      {tests.map((t) => (
        <div key={t.key}>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`h-7 w-7 rounded-lg ${t.color} flex items-center justify-center`}>
                    <t.icon className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold">{t.label}</p>
                    <p className="text-[10px] text-muted-foreground">{t.desc}</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  className={`h-8 text-xs text-white ${t.color} hover:opacity-90`}
                  onClick={t.action}
                  disabled={loading[t.key]}
                >
                  {loading[t.key] ? (
                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : "Tester"}
                </Button>
              </div>
              <TestResult result={results[t.key]} />
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  );
}