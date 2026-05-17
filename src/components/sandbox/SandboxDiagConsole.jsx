import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, Activity, Wifi, Lock, AlertCircle, CheckCircle2 } from "lucide-react";
import moment from "moment";

const TYPE_CONFIG = {
  info: { color: "text-blue-600", bg: "bg-blue-50" },
  success: { color: "text-green-700", bg: "bg-green-50" },
  error: { color: "text-red-700", bg: "bg-red-50" },
  warn: { color: "text-amber-700", bg: "bg-amber-50" },
};

function LogLine({ log }) {
  const cfg = TYPE_CONFIG[log.type] || TYPE_CONFIG.info;
  return (
    <div className={`flex items-start gap-2 px-3 py-1.5 rounded-lg ${cfg.bg} border border-transparent`}>
      <span className="text-[9px] font-mono text-muted-foreground flex-shrink-0 mt-0.5">
        {moment(log.ts).format("HH:mm:ss.SSS")}
      </span>
      <span className={`text-[11px] font-medium leading-tight ${cfg.color}`}>{log.msg}</span>
    </div>
  );
}

export default function SandboxDiagConsole({ logs, onClear }) {
  const scrollRef = useRef(null);
  const [systemInfo, setSystemInfo] = useState(null);
  const [checking, setChecking] = useState(false);

  const counts = {
    info: logs.filter((l) => l.type === "info").length,
    success: logs.filter((l) => l.type === "success").length,
    error: logs.filter((l) => l.type === "error").length,
    warn: logs.filter((l) => l.type === "warn").length,
  };

  const checkSystem = async () => {
    setChecking(true);
    const startAuth = Date.now();
    try {
      const user = await base44.auth.me();
      const authTime = Date.now() - startAuth;

      // Test subscription
      const startSub = Date.now();
      let subLatency = null;
      await new Promise((resolve) => {
        const unsub = base44.entities.Course.subscribe((ev) => {
          if (ev && subLatency === null) {
            subLatency = Date.now() - startSub;
            unsub?.();
            resolve();
          }
        });
        // Timeout après 3s
        setTimeout(() => { unsub?.(); resolve(); }, 3000);
      });

      // Test lecture BDD
      const startRead = Date.now();
      const testCourses = await base44.entities.Course.filter(
        { client_email: "sandbox@cdl-test.local" },
        "-created_date",
        1
      );
      const readTime = Date.now() - startRead;

      setSystemInfo({
        user: user?.email || "inconnu",
        role: user?.role || "—",
        authTime,
        subLatency: subLatency ?? "timeout",
        readTime,
        sandboxCount: Array.isArray(testCourses) ? testCourses.length : 0,
        ts: new Date().toISOString(),
      });
    } catch (e) {
      setSystemInfo({ error: e.message });
    }
    setChecking(false);
  };

  return (
    <div className="space-y-3">
      {/* System Info */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Diagnostic système
            </p>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={checkSystem}
              disabled={checking}
            >
              {checking ? (
                <div className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              ) : "Vérifier"}
            </Button>
          </div>

          {systemInfo && !systemInfo.error && (
            <div className="space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <Lock className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">Auth</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono">{systemInfo.user}</span>
                  <Badge className="text-[9px] bg-green-100 text-green-700">{systemInfo.authTime}ms</Badge>
                </div>
              </div>
              <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <Wifi className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">Subscription</span>
                </div>
                <Badge className={`text-[9px] ${systemInfo.subLatency === "timeout" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                  {systemInfo.subLatency === "timeout" ? "⚠️ timeout" : `${systemInfo.subLatency}ms`}
                </Badge>
              </div>
              <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <Activity className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">Lecture BDD</span>
                </div>
                <Badge className={`text-[9px] ${systemInfo.readTime > 1000 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
                  {systemInfo.readTime}ms
                </Badge>
              </div>
              <div className="flex items-center justify-between bg-violet-50 rounded-lg px-3 py-2">
                <span className="text-muted-foreground">Courses sandbox</span>
                <Badge className="text-[9px] bg-violet-100 text-violet-700">{systemInfo.sandboxCount} trouvée(s)</Badge>
              </div>
            </div>
          )}
          {systemInfo?.error && (
            <div className="flex items-center gap-2 p-2 bg-red-50 rounded-lg">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <span className="text-xs text-red-700">{systemInfo.error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Console logs */}
      <Card>
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold">Console diagnostic</p>
              <Badge className="text-[9px] bg-gray-100 text-gray-600">{logs.length} entrées</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="text-[9px] bg-green-100 text-green-700">✓ {counts.success}</Badge>
              <Badge className="text-[9px] bg-red-100 text-red-700">✗ {counts.error}</Badge>
              <Badge className="text-[9px] bg-amber-100 text-amber-700">⚠ {counts.warn}</Badge>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onClear}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>

          <div
            ref={scrollRef}
            className="max-h-80 overflow-y-auto space-y-1 font-mono"
          >
            {logs.length === 0 && (
              <p className="text-xs text-center text-muted-foreground py-6">Aucun log. Lancez un test pour voir les résultats ici.</p>
            )}
            {logs.map((log, i) => (
              <LogLine key={i} log={log} />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Checklist UI */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <p className="text-sm font-bold">Checklist tests UI temps réel</p>
          {[
            "Bloc résumé apparaît immédiatement après création course",
            "Overlay NewCourseAlert s'affiche côté livreur",
            "ManualDispatchAlert s'affiche côté admin en mode manuel",
            "Navigation entre onglets préserve les alertes globales",
            "Arrière-plan / reprise app → alertes toujours visibles",
            "Stress test (20 courses) sans crash ni doublon",
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-2 p-2 bg-gray-50 rounded-lg">
              <CheckCircle2 className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <span className="text-xs text-muted-foreground">{item}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}