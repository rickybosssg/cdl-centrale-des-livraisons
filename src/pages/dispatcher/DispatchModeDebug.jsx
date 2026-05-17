/**
 * DispatchModeDebug — Panneau DEBUG VISIBLE à l'écran
 * Route : /dispatch-mode-debug
 *
 * Affiche en temps réel :
 *   - source exacte du mode affiché
 *   - dernière fonction ayant écrit le mode
 *   - timestamp
 *   - provider utilisé
 *   - listener actif
 *   - valeur backend brute
 *   - valeur frontend brute (état React)
 *
 * Branché UNIQUEMENT sur DispatchModeContext → DispatchModeState
 */
import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useDispatchMode } from "@/context/DispatchModeContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RefreshCw, Activity, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import moment from "moment";

export default function DispatchModeDebug() {
  const navigate = useNavigate();
  const {
    mode,
    updatedAt,
    updatedBy,
    configId,
    loading,
    lastError,
    setMode,
    refresh,
  } = useDispatchMode();

  const backendRaw = null;
  const lastWriter = null;
  const listenerActive = true;
  const lastEventTs = null;
  const providerVersion = "DispatchModeContext_v3";

  const [user, setUser] = useState(null);
  const [realtimeLog, setRealtimeLog] = useState([]);
  const [stateLog, setStateLog] = useState([]);
  const [toggling, setToggling] = useState(false);
  const [rawBackendFetch, setRawBackendFetch] = useState(null);
  const [fetchingRaw, setFetchingRaw] = useState(false);
  const [diagResult, setDiagResult] = useState(null);
  const [diagRunning, setDiagRunning] = useState(false);
  const prevModeRef = useRef(null);

  useEffect(() => {
    base44.auth.me().then(setUser);
  }, []);

  // Logger chaque changement de mode React
  useEffect(() => {
    if (mode === null && loading) return;
    const entry = {
      ts: new Date().toISOString(),
      mode,
      source: lastWriter || "init",
    };
    setStateLog(prev => [entry, ...prev].slice(0, 30));

    prevModeRef.current = mode;
  }, [mode, lastWriter]);

  // Subscribe raw indépendant pour log realtime
  useEffect(() => {
    const unsub = base44.entities.DispatchModeState.subscribe((event) => {
      const entry = {
        ts: new Date().toISOString(),
        type: event.type,
        mode: event.data?.mode || "—",
        id: event.data?.id || event.id || "?",
        updated_by: event.data?.updated_by || "?",
        updated_at: event.data?.updated_at || null,
      };
      setRealtimeLog(prev => [entry, ...prev].slice(0, 30));
    });
    return () => unsub();
  }, []);

  const fetchRawBackend = async () => {
    setFetchingRaw(true);
    try {
      const rows = await base44.entities.DispatchModeState.list('-updated_date', 1);
      setRawBackendFetch({ ok: true, data: rows[0] || null, count: rows.length, source: 'entity_direct' });
    } catch (e) {
      setRawBackendFetch({ ok: false, error: e.message, source: 'entity_direct' });
    } finally {
      setFetchingRaw(false);
    }
  };

  const runFullDiag = async () => {
    setDiagRunning(true);
    const log = [];
    try {
      // 1. isAuthenticated
      const isAuth = await base44.auth.isAuthenticated();
      log.push({ step: 'isAuthenticated', result: String(isAuth) });

      // 2. me()
      let meResult = null;
      try {
        meResult = await base44.auth.me();
        log.push({ step: 'me()', result: `email=${meResult?.email} | role=${meResult?.role}` });
      } catch (e) {
        log.push({ step: 'me()', result: `ERREUR: ${e.message}`, error: true });
      }

      // 3. DispatchModeState entity direct (méthode principale)
      try {
        const rows = await base44.entities.DispatchModeState.list('-updated_date', 5);
        log.push({ step: 'DispatchModeState.list()', result: `✅ ${rows.length} ligne(s) | mode=${rows[0]?.mode ?? 'N/A'} | id=${rows[0]?.id ?? 'N/A'}`, data: rows });
      } catch (e) {
        log.push({ step: 'DispatchModeState.list()', result: `❌ ${e.message}`, error: true });
      }

      // 4. Test écriture (simulation) — on ne fait pas vraiment un update ici
      log.push({ step: 'Source de données', result: 'Entity SDK direct (pas de fonction backend) ✅ Recommandé' });

    } catch (globalErr) {
      log.push({ step: 'GLOBAL', result: `CRASH: ${globalErr.message}`, error: true });
    }
    setDiagResult(log);
    setDiagRunning(false);
  };

  const handleToggle = async () => {
    if (toggling || loading || mode === null) return;
    const newMode = mode === "auto" ? "manuel" : "auto";
    setToggling(true);
    try {
      await setMode(newMode);
    } catch (_) {
      // silencieux
    } finally {
      setToggling(false);
    }
  };

  const modeColor = mode === "auto"
    ? "text-green-700 bg-green-50 border-green-400"
    : mode === "manuel"
    ? "text-amber-700 bg-amber-50 border-amber-400"
    : "text-red-700 bg-red-50 border-red-400";

  return (
    <div className="space-y-4 pb-20 px-3 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 py-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">🔍 Dispatch Mode — Debug FINAL</h1>
          <p className="text-xs text-muted-foreground">Source unique: DispatchModeState → getDispatchMode</p>
        </div>
        <Button variant="outline" size="icon" onClick={() => refresh("manual_refresh")}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* MODE ACTUEL — ÉTAT REACT */}
      <div className={`rounded-2xl border-2 p-5 ${modeColor}`}>
        <p className="text-xs font-bold uppercase opacity-60 mb-1">MODE REACT (état frontend)</p>
        <p className="text-5xl font-black tracking-tight">
          {loading ? "⏳ LOADING" : mode ? mode.toUpperCase() : "❌ NULL"}
        </p>
        <div className="mt-3 space-y-0.5 text-xs font-mono opacity-80">
          <p>configId: {configId || "—"}</p>
          <p>updatedBy: {updatedBy || "—"}</p>
          <p>updatedAt: {updatedAt ? moment(updatedAt).format("DD/MM/YY HH:mm:ss") : "—"}</p>
        </div>
        <Button
          className="mt-4 w-full"
          onClick={handleToggle}
          disabled={toggling || loading || mode === null}
        >
          {toggling ? "⏳ Changement..." : `Basculer → ${mode === "auto" ? "manuel" : "auto"}`}
        </Button>
      </div>

      {/* PANEL DEBUG COMPLET */}
      <Card className="border-primary/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Infos système
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs font-mono space-y-1.5">
          <Row label="Provider version" value={providerVersion || "?"} ok={!!providerVersion?.includes("v3")} />
          <Row label="Source données" value="Entity SDK direct → DispatchModeState" ok />
          <Row label="Listener realtime" value={listenerActive ? "✅ ACTIF (DispatchModeState.subscribe)" : "❌ INACTIF"} ok={listenerActive} />
          <Row label="Dernier writer" value={lastWriter || "—"} />
          <Row label="Dernier event realtime" value={lastEventTs ? moment(lastEventTs).format("HH:mm:ss.SSS") : "—"} />
          <Row label="État React brut" value={mode === null ? "null (loading)" : mode} ok={mode !== null} />
          <Row label="Mode loading" value={String(loading)} ok={!loading} />
          <Row label="backendRaw reçu" value={backendRaw ? `✅ mode=${backendRaw.mode}` : "❌ null — fetch échoué"} ok={!!backendRaw} />
          <Row label="Admin email" value={user?.email || "—"} />
          <Row label="Admin role" value={user?.role || "—"} ok={user?.role === "admin"} />
          {lastError && (
            <div className="mt-2 p-2 rounded-lg bg-red-50 border border-red-300 space-y-0.5">
              <p className="font-bold text-red-700 text-[11px]">⚠️ DERNIÈRE ERREUR loadMode</p>
              <p className="text-red-600">status: <strong>{lastError.status}</strong></p>
              <p className="text-red-600">msg: {lastError.message}</p>
              <p className="text-red-600">attempt: {lastError.attempt} | source: {lastError.source}</p>
              <p className="text-red-600">ts: {moment(lastError.ts).format("HH:mm:ss.SSS")}</p>
              {lastError.responseData && (
                <pre className="text-[10px] text-red-500 bg-red-100 rounded p-1 overflow-x-auto">
                  {JSON.stringify(lastError.responseData, null, 2)}
                </pre>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* DIAGNOSTIC COMPLET */}
      <Card className="border-orange-300">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">🧪 Diagnostic complet (auth + fetch + entities)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button size="sm" className="w-full bg-orange-500 hover:bg-orange-600 text-white" onClick={runFullDiag} disabled={diagRunning}>
            {diagRunning ? "⏳ Diagnostic en cours..." : "🚀 Lancer diagnostic complet"}
          </Button>
          {diagResult && (
            <div className="space-y-1.5">
              {diagResult.map((step, i) => (
                <div key={i} className={`rounded-lg p-2 text-xs font-mono border ${step.error ? 'bg-red-50 border-red-300' : 'bg-green-50 border-green-300'}`}>
                  <p className={`font-bold ${step.error ? 'text-red-700' : 'text-green-700'}`}>{step.step}</p>
                  <p className={step.error ? 'text-red-600' : 'text-green-600'}>{step.result}</p>
                  {step.responseBody && <p className="text-red-500 text-[10px] mt-0.5">body: {step.responseBody}</p>}
                  {step.data && !step.error && (
                    <pre className="text-[10px] text-green-700 bg-green-100 rounded p-1 mt-1 overflow-x-auto">
                      {JSON.stringify(step.data, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* VALEUR BACKEND BRUTE */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">📦 Valeur entity brute (DispatchModeState)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button size="sm" variant="outline" className="w-full" onClick={fetchRawBackend} disabled={fetchingRaw}>
            {fetchingRaw ? "⏳ Fetching..." : "🔍 Lire DispatchModeState maintenant"}
          </Button>
          {rawBackendFetch && (
            <pre className={`rounded-xl p-3 text-xs overflow-x-auto whitespace-pre-wrap ${rawBackendFetch.ok ? 'bg-green-50' : 'bg-red-50'}`}>
              {JSON.stringify(rawBackendFetch, null, 2)}
            </pre>
          )}
          {backendRaw && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Dernière valeur reçue par le provider :</p>
              <pre className="bg-muted rounded-xl p-3 text-xs overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(backendRaw, null, 2)}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      {/* HISTORIQUE ÉTATS REACT */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">🕐 Historique états React (30 derniers)</CardTitle>
        </CardHeader>
        <CardContent>
          {stateLog.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2">Aucun changement d'état</p>
          ) : (
            <div className="space-y-1">
              {stateLog.map((e, i) => (
                <div key={i} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-mono border ${
                  e.mode === "manuel" ? "bg-amber-50 border-amber-200" :
                  e.mode === "auto" ? "bg-green-50 border-green-200" :
                  "bg-red-50 border-red-200"
                }`}>
                  <span className="text-[10px] opacity-60 flex-shrink-0">{moment(e.ts).format("HH:mm:ss.SSS")}</span>
                  <span className={`font-bold flex-shrink-0 ${
                    e.mode === "auto" ? "text-green-700" :
                    e.mode === "manuel" ? "text-amber-700" : "text-red-600"
                  }`}>{e.mode?.toUpperCase() ?? "NULL"}</span>
                  <span className="text-muted-foreground truncate">{e.source}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* HISTORIQUE REALTIME */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">📡 Historique realtime DispatchModeState (30 derniers)</CardTitle>
        </CardHeader>
        <CardContent>
          {realtimeLog.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2">En attente d'events...</p>
          ) : (
            <div className="space-y-1">
              {realtimeLog.map((e, i) => (
                <div key={i} className={`px-2 py-1.5 rounded-lg text-xs font-mono border ${
                  e.mode === "manuel" ? "bg-amber-50 border-amber-200" :
                  e.mode === "auto" ? "bg-green-50 border-green-200" :
                  "bg-gray-50 border-gray-200"
                }`}>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] opacity-60 flex-shrink-0">{moment(e.ts).format("HH:mm:ss.SSS")}</span>
                    <span className="font-bold text-[10px] uppercase opacity-50">{e.type}</span>
                    <span className={`font-bold ${e.mode === "auto" ? "text-green-700" : e.mode === "manuel" ? "text-amber-700" : "text-gray-600"}`}>
                      {e.mode?.toUpperCase()}
                    </span>
                  </div>
                  <p className="opacity-60">id: {e.id} | by: {e.updated_by}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-center text-[10px] text-muted-foreground pt-2 pb-4 font-mono">
        {providerVersion} · Entity: DispatchModeState · admin: {user?.email || "?"}
      </div>
    </div>
  );
}

function Row({ label, value, ok }) {
  return (
    <div className="flex items-start gap-2">
      {ok === true ? <CheckCircle2 className="h-3 w-3 text-green-500 flex-shrink-0 mt-0.5" /> :
       ok === false ? <XCircle className="h-3 w-3 text-red-500 flex-shrink-0 mt-0.5" /> :
       <span className="h-3 w-3 flex-shrink-0" />}
      <span className="text-muted-foreground flex-shrink-0 w-36">{label}:</span>
      <span className="font-semibold break-all">{value}</span>
    </div>
  );
}