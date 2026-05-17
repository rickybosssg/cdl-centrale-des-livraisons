import { useState, useCallback, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Trash2, Zap, FlaskConical, Wifi, WifiOff, AlertCircle } from "lucide-react";
import SandboxCourseGenerator from "@/components/sandbox/SandboxCourseGenerator";
import SandboxFakeDrivers from "@/components/sandbox/SandboxFakeDrivers";
import SandboxDispatchTests from "@/components/sandbox/SandboxDispatchTests";
import SandboxDiagConsole from "@/components/sandbox/SandboxDiagConsole";

export default function SandboxTest() {
  const [logs, setLogs] = useState([]);
  const [sandboxCourses, setSandboxCourses] = useState([]);
  const [purging, setPurging] = useState(false);
  const [authStatus, setAuthStatus] = useState(null); // { email, role, realtimeOk, status }

  const addLog = useCallback((msg, type = "info") => {
    setLogs((prev) => [
      ...prev,
      { msg, type, ts: new Date().toISOString() },
    ]);
  }, []);

  // Diagnostic auth + realtime au mount
  useEffect(() => {
    let unsub = null;
    let realtimeOk = false;

    const run = async () => {
      try {
        const user = await base44.auth.me();
        if (!user) { setAuthStatus({ status: "AUTH_ERROR", detail: "auth.me() → null" }); return; }

        // Test subscription realtime
        const subTimer = setTimeout(() => {
          if (!realtimeOk) setAuthStatus(prev => ({ ...prev, realtimeOk: false }));
        }, 4000);

        unsub = base44.entities.Course.subscribe((ev) => {
          if (!realtimeOk) {
            realtimeOk = true;
            clearTimeout(subTimer);
            setAuthStatus(prev => ({ ...prev, realtimeOk: true }));
          }
        });

        setAuthStatus({
          status: user.role === "admin" ? "CONNECTED" : "DENIED",
          email: user.email,
          role: user.role,
          realtimeOk: null, // pending
        });

        if (user.role !== "admin") {
          addLog(`⛔ role=${user.role} — autoDispatch/cdlDispatch nécessite admin`, "error");
        } else {
          addLog(`✅ Auth OK: ${user.email} (${user.role})`, "success");
        }
      } catch (e) {
        setAuthStatus({ status: "AUTH_ERROR", detail: e.message });
        addLog("❌ Auth error: " + e.message, "error");
      }
    };
    run();
    return () => { unsub?.(); };
  }, []);

  const reloadCourses = useCallback(async () => {
    try {
      const data = await base44.entities.Course.filter(
        { client_email: "sandbox@cdl-test.local" },
        "-created_date",
        50
      );
      setSandboxCourses(Array.isArray(data) ? data : []);
    } catch (_) {}
  }, []);

  const purgeAll = async () => {
    setPurging(true);
    addLog("🗑️ Purge des courses sandbox en cours...", "warn");
    try {
      const data = await base44.entities.Course.filter(
        { client_email: "sandbox@cdl-test.local" },
        "-created_date",
        100
      );
      const arr = Array.isArray(data) ? data : [];
      await Promise.allSettled(arr.map((c) => base44.entities.Course.delete(c.id)));
      setSandboxCourses([]);
      addLog(`✅ ${arr.length} course(s) sandbox supprimées`, "success");
    } catch (e) {
      addLog("❌ Purge erreur: " + e.message, "error");
    }
    setPurging(false);
  };

  // Stress test
  const stressTest = async () => {
    addLog("🔥 Stress test 20 courses simultanées...", "warn");
    const QUARTIERS = ["Koulouba", "Pissy", "Gounghin", "Nonsin", "Hamdalaye", "Patte d'Oie", "Dapoya", "Tampouy", "Tanghin", "Ouaga 2000"];
    const start = Date.now();
    const promises = Array.from({ length: 20 }, (_, i) => {
      const dep = QUARTIERS[i % QUARTIERS.length];
      const arr = QUARTIERS[(i + 3) % QUARTIERS.length];
      return base44.entities.Course.create({
        quartier_depart: dep,
        quartier_arrivee: arr,
        telephone_expediteur: "+22600000000",
        telephone_destinataire: "+22600000001",
        type_colis: "Petit colis",
        statut: "en_attente",
        client_email: "sandbox@cdl-test.local",
        client_name: "Stress Test CDL",
        prix: 1000,
        mode_assignation: "auto",
        description: `[SANDBOX_STRESS] Course ${i + 1}/20`,
      });
    });
    const results = await Promise.allSettled(promises);
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const elapsed = Date.now() - start;
    addLog(`${ok === 20 ? "✅" : "⚠️"} Stress test: ${ok}/20 créées en ${elapsed}ms`, ok === 20 ? "success" : "warn");
    reloadCourses();
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center shadow">
            <FlaskConical className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold">Mode Sandbox / Tests</h1>
            <p className="text-xs text-muted-foreground">Environnement isolé — données <code className="font-mono bg-gray-100 px-1 rounded">sandbox@cdl-test.local</code></p>
          </div>
        </div>
        <Badge className="bg-violet-100 text-violet-700 text-xs">🧪 Sandbox</Badge>
      </div>

      {/* Auth + Realtime status badges */}
      <Card>
        <CardContent className="p-3 flex flex-wrap gap-2 items-center">
          {/* Auth badge */}
          {!authStatus ? (
            <Badge className="bg-gray-100 text-gray-600 gap-1 animate-pulse">
              <div className="w-2 h-2 rounded-full bg-gray-400" />
              Vérification auth...
            </Badge>
          ) : authStatus.status === "CONNECTED" ? (
            <Badge className="bg-green-100 text-green-800 gap-1">
              <Wifi className="h-3 w-3" /> CONNECTED · {authStatus.email} ({authStatus.role})
            </Badge>
          ) : authStatus.status === "DENIED" ? (
            <Badge className="bg-red-100 text-red-700 gap-1">
              <WifiOff className="h-3 w-3" /> DENIED · role={authStatus.role} (admin requis)
            </Badge>
          ) : (
            <Badge className="bg-red-200 text-red-800 gap-1">
              <AlertCircle className="h-3 w-3" /> AUTH_ERROR · {authStatus.detail}
            </Badge>
          )}

          {/* Realtime badge */}
          {authStatus && (
            authStatus.realtimeOk === null ? (
              <Badge className="bg-blue-50 text-blue-600 gap-1 animate-pulse">
                <div className="w-2 h-2 rounded-full bg-blue-400" />
                REALTIME testing...
              </Badge>
            ) : authStatus.realtimeOk ? (
              <Badge className="bg-green-100 text-green-700 gap-1">
                <Wifi className="h-3 w-3" /> REALTIME OK
              </Badge>
            ) : (
              <Badge className="bg-amber-100 text-amber-700 gap-1">
                <WifiOff className="h-3 w-3" /> REALTIME TIMEOUT
              </Badge>
            )
          )}

          {/* Avertissement si non-admin */}
          {authStatus?.status === "DENIED" && (
            <p className="text-xs text-red-600 w-full mt-1">
              ⚠️ Le dispatch (autoDispatch/cdlDispatch) nécessite le rôle <strong>admin</strong>. Le test sandbox essaiera quand même les deux endpoints et affichera la raison exacte du refus.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Actions globales */}
      <div className="flex gap-2">
        <Button
          onClick={stressTest}
          className="flex-1 bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold gap-2"
        >
          <Zap className="h-4 w-4" />
          Stress Test (20 courses)
        </Button>
        <Button
          onClick={purgeAll}
          disabled={purging}
          variant="outline"
          className="gap-2 border-red-300 text-red-600 hover:bg-red-50"
        >
          {purging ? (
            <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
          Purger
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="dispatch">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="courses">Courses</TabsTrigger>
          <TabsTrigger value="drivers">Livreurs</TabsTrigger>
          <TabsTrigger value="dispatch">Dispatch</TabsTrigger>
          <TabsTrigger value="console">Console</TabsTrigger>
        </TabsList>

        <TabsContent value="courses" className="mt-4">
          <SandboxCourseGenerator onLog={addLog} onReload={reloadCourses} sandboxCourses={sandboxCourses} />
        </TabsContent>

        <TabsContent value="drivers" className="mt-4">
          <SandboxFakeDrivers onLog={addLog} />
        </TabsContent>

        <TabsContent value="dispatch" className="mt-4">
          <SandboxDispatchTests onLog={addLog} sandboxCourses={sandboxCourses} onReload={reloadCourses} />
        </TabsContent>

        <TabsContent value="console" className="mt-4">
          <SandboxDiagConsole logs={logs} onClear={() => setLogs([])} />
        </TabsContent>
      </Tabs>
    </div>
  );
}