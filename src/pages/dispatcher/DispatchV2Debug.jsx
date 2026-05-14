/**
 * DispatchV2Debug — Page de diagnostic BLOQUANT
 * Route : /dispatch-v2-debug
 *
 * Affiche en temps réel :
 * - Le doc canonique exact (ID, mode, mode_key)
 * - Tous les docs DispatchConfig existants
 * - L'historique des events realtime reçus
 * - Un test de stabilité avec relay 1s/5s/15s/30s
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useDispatchModeV2 } from '@/context/DispatchModeV2Context';
import { CANONICAL_KEY } from '@/lib/DispatchEngineV2';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import moment from 'moment';

export default function DispatchV2Debug() {
  const navigate = useNavigate();
  const { mode, canonicalId, configData, allDocs, loading, toggling, toggle, reload } = useDispatchModeV2();
  const [user, setUser] = useState(null);
  const [realtimeLog, setRealtimeLog] = useState([]);
  const [stabilityLog, setStabilityLog] = useState([]);
  const [stabilityRunning, setStabilityRunning] = useState(false);
  const [clickSnapshot, setClickSnapshot] = useState(null);
  const [allDocsRaw, setAllDocsRaw] = useState([]);
  const [initLog, setInitLog] = useState([]); // logs visibles du bouton Initialiser
  const [initRunning, setInitRunning] = useState(false);
  const stabilityTimers = useRef([]);

  const loadRaw = useCallback(async () => {
    const all = await base44.entities.DispatchConfig.list('-updated_date', 20);
    setAllDocsRaw(all);
    return all;
  }, []);

  useEffect(() => {
    base44.auth.me().then(setUser);
    loadRaw();

    // Subscribe brut indépendant — logge TOUT ce qui arrive
    const unsub = base44.entities.DispatchConfig.subscribe((event) => {
      const entry = {
        ts: new Date().toISOString(),
        type: event.type,
        id: event.data?.id || event.id || '?',
        mode: event.data?.mode || '?',
        mode_key: event.data?.mode_key || 'NONE',
        last_changed_by: event.data?.last_changed_by || '?',
        isCanonical: event.data?.mode_key === CANONICAL_KEY,
      };
      console.log(`[DEBUG_RAW_SUBSCRIBE] type=${entry.type} | id=${entry.id} | mode=${entry.mode} | mode_key=${entry.mode_key} | canonical=${entry.isCanonical}`);
      setRealtimeLog(prev => [entry, ...prev].slice(0, 30));
      // Recharger les docs bruts à chaque event
      loadRaw();
    });

    return () => unsub();
  }, [loadRaw]);

  const runStabilityTest = async () => {
    if (stabilityRunning) return;
    setStabilityRunning(true);
    setStabilityLog([]);

    // Annuler les anciens timers
    stabilityTimers.current.forEach(t => clearTimeout(t));
    stabilityTimers.current = [];

    const modeAvant = mode;
    const modeAttendu = modeAvant === 'auto' ? 'manuel' : 'auto';
    const testStartTs = new Date().toISOString();

    // Snapshot avant clic
    const snapshot = { modeAvant, canonicalId, ts: testStartTs };
    setClickSnapshot(snapshot);

    // Lancer le toggle via setDispatchModeCanonical directement (pour capturer last_changed_at confirmé)
    let confirmedChangedAt = null;
    try {
      const res = await base44.functions.invoke('setDispatchModeCanonical', {
        mode: modeAttendu,
        source: 'admin_click',
        reason: `Stability test: ${modeAvant} → ${modeAttendu}`,
      });
      if (res.data?.success) {
        confirmedChangedAt = res.data?.config?.last_changed_at;
        console.log(`[STABILITY_TOGGLE_OK] mode=${modeAttendu} | confirmed_changed_at=${confirmedChangedAt}`);
      } else {
        console.error(`[STABILITY_TOGGLE_FAIL] ${JSON.stringify(res.data)}`);
        setStabilityRunning(false);
        return;
      }
    } catch (err) {
      console.error(`[STABILITY_TOGGLE_ERR] ${err.message}`);
      setStabilityRunning(false);
      return;
    }

    // Lire à 1s, 5s, 15s, 30s
    // Une vraie réversion = mode ≠ modeAttendu ET last_changed_at ≠ confirmedChangedAt (qqqn d'autre a écrasé)
    const delays = [1000, 5000, 15000, 30000];
    for (const delay of delays) {
      const t = setTimeout(async () => {
        const all = await base44.entities.DispatchConfig.list('-updated_date', 50);
        const canonical = all.find(c => c.mode_key === CANONICAL_KEY);
        const readMode = canonical?.mode || null;
        const readChangedAt = canonical?.last_changed_at || null;

        // RÉVERSION réelle = mode incorrect ET changed_at différent du toggle confirmé
        const modeKO = readMode !== modeAttendu;
        const changedAtKO = confirmedChangedAt && readChangedAt !== confirmedChangedAt;
        const isReverted = modeKO && changedAtKO;

        const entry = {
          delay: `${delay / 1000}s`,
          ts: new Date().toISOString(),
          mode: readMode,
          modeAttendu,
          id: canonical?.id || null,
          last_changed_by: canonical?.last_changed_by || null,
          last_changed_at: readChangedAt,
          updated_date: canonical?.updated_date || null,
          allCount: all.length,
          allModes: all.map(c => `${c.mode}(${c.mode_key || 'NO_KEY'})`).join(', '),
          isReverted,
        };
        console.log(`[STABILITY_${delay / 1000}s] mode=${readMode} (attendu=${modeAttendu}) | changedAt=${readChangedAt} | confirmedAt=${confirmedChangedAt} | reverted=${isReverted}`);
        setStabilityLog(prev => [...prev, entry]);
        if (delay === 30000) {
          setStabilityRunning(false);
          reload();
          loadRaw();
        }
      }, delay);
      stabilityTimers.current.push(t);
    }
  };

  const deleteParasites = async () => {
    const all = await base44.entities.DispatchConfig.list('-updated_date', 50);
    const parasites = all.filter(c => c.mode_key !== CANONICAL_KEY);
    for (const p of parasites) {
      await base44.entities.DispatchConfig.delete(p.id).catch(() => {});
    }
    alert(`${parasites.length} doc(s) parasite(s) supprimé(s)`);
    reload();
    loadRaw();
  };

  const addInitLog = (msg, type = 'info') => {
    const entry = { ts: new Date().toISOString(), msg, type };
    console.log(`[INITIALIZE_${type.toUpperCase()}] ${msg}`);
    setInitLog(prev => [entry, ...prev].slice(0, 20));
  };

  const initCanonical = async () => {
    if (initRunning) return;
    setInitRunning(true);
    addInitLog('INITIALIZE_CLICKED — Démarrage', 'info');

    try {
      addInitLog('INITIALIZE_STARTED — Appel setDispatchModeCanonical(auto, dispatch_v2_debug)', 'info');

      const res = await base44.functions.invoke('setDispatchModeCanonical', { mode: 'auto', source: 'dispatch_v2_debug', reason: 'Initialisation depuis DispatchV2Debug' });

      addInitLog(`Réponse reçue: status=${res.status} | success=${res.data?.success}`, 'info');

      if (!res.data?.success) {
        const errMsg = res.data?.error || JSON.stringify(res.data);
        addInitLog(`INITIALIZE_ERROR — ${errMsg}`, 'error');
        return;
      }

      const cfg = res.data?.config;
      addInitLog(`INITIALIZE_SUCCESS — id=${cfg?.id} | mode=${cfg?.mode} | mode_key=${cfg?.mode_key}`, 'success');

      // Recharger UI
      await Promise.all([reload(), loadRaw()]);
      addInitLog('Rechargement UI terminé', 'success');
    } catch (err) {
      addInitLog(`INITIALIZE_ERROR — Exception: ${err.message}`, 'error');
    } finally {
      setInitRunning(false);
    }
  };

  const canonical = allDocsRaw.find(c => c.mode_key === CANONICAL_KEY);
  const parasites = allDocsRaw.filter(c => c.mode_key !== CANONICAL_KEY);

  return (
    <div className="space-y-4 pb-20 px-3 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 py-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">Dispatch V2 — Diagnostic BLOQUANT</h1>
          <p className="text-xs text-muted-foreground">Toute réversion est un bug à tracer ici</p>
        </div>
        <Button variant="outline" size="icon" onClick={() => { reload(); loadRaw(); }}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Mode actuel Context V2 */}
      <div className={`rounded-2xl border-2 p-4 ${
        mode === 'manuel' ? 'bg-amber-50 border-amber-500' :
        mode === 'auto' ? 'bg-green-50 border-green-500' :
        'bg-red-50 border-red-400'
      }`}>
        <p className="text-xs font-bold uppercase text-muted-foreground">Mode Context V2</p>
        <p className={`text-4xl font-black mt-1 ${
          mode === 'manuel' ? 'text-amber-700' : mode === 'auto' ? 'text-green-700' : 'text-red-600'
        }`}>
          {loading ? '⏳' : mode ? mode.toUpperCase() : '❌ PAS DE CONFIG'}
        </p>
        <p className="text-xs text-muted-foreground mt-1 font-mono">canonicalId: {canonicalId || 'aucun'}</p>
      </div>

      {/* Docs en BDD */}
      <Card className={allDocsRaw.length !== 1 ? 'border-red-400' : 'border-green-300'}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            {allDocsRaw.length === 1
              ? <CheckCircle2 className="h-4 w-4 text-green-600" />
              : <AlertTriangle className="h-4 w-4 text-red-500" />
            }
            Docs DispatchConfig en BDD ({allDocsRaw.length} total)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {allDocsRaw.length === 0 && (
            <div className="space-y-2">
              <p className="text-xs text-red-600 font-bold">❌ Aucun document — le système ne peut pas fonctionner</p>
              <Button
                size="sm"
                className="w-full"
                onClick={initCanonical}
                disabled={initRunning}
              >
                {initRunning ? '⏳ Initialisation...' : '✅ Initialiser config canonique (GLOBAL)'}
              </Button>
            </div>
          )}
          {allDocsRaw.map((doc, i) => {
            const isC = doc.mode_key === CANONICAL_KEY;
            return (
              <div key={doc.id} className={`rounded-xl p-2.5 text-xs border font-mono ${
                isC ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  {isC
                    ? <span className="bg-green-600 text-white px-1.5 py-0.5 rounded text-[10px] font-bold">CANONIQUE</span>
                    : <span className="bg-red-500 text-white px-1.5 py-0.5 rounded text-[10px] font-bold">PARASITE</span>
                  }
                  <span className={`font-bold ${doc.mode === 'manuel' ? 'text-amber-700' : 'text-green-700'}`}>
                    {doc.mode?.toUpperCase()}
                  </span>
                </div>
                <p>id: <span className="text-primary">{doc.id}</span></p>
                <p>mode_key: {doc.mode_key || '❌ ABSENT'}</p>
                <p>last_changed_by: {doc.last_changed_by || '—'}</p>
                <p>last_changed_at: {doc.last_changed_at ? moment(doc.last_changed_at).format('HH:mm:ss') : moment(doc.updated_date).format('HH:mm:ss')}</p>
              </div>
            );
          })}
          {parasites.length > 0 && (
            <Button size="sm" variant="destructive" onClick={deleteParasites} className="w-full">
              🗑️ Supprimer {parasites.length} doc(s) parasite(s)
            </Button>
          )}
          {allDocsRaw.length > 0 && !canonical && (
            <Button size="sm" onClick={initCanonical} className="w-full" disabled={initRunning}>
              {initRunning ? '⏳...' : '✅ Créer config canonique (mode_key=GLOBAL)'}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Test de stabilité 30s */}
      <Card className="border-primary/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">🧪 Test stabilité 30s</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {clickSnapshot && (
            <div className="bg-muted rounded-xl p-2 text-xs font-mono space-y-0.5">
              <p className="font-bold">Snapshot avant clic :</p>
              <p>mode avant: <span className={clickSnapshot.modeAvant === 'manuel' ? 'text-amber-700 font-bold' : 'text-green-700 font-bold'}>{clickSnapshot.modeAvant}</span></p>
              <p>id: {clickSnapshot.canonicalId || 'aucun'}</p>
              <p>ts: {moment(clickSnapshot.ts).format('HH:mm:ss')}</p>
            </div>
          )}
          <Button
            className="w-full"
            disabled={stabilityRunning || loading || !canonical}
            onClick={runStabilityTest}
          >
            {stabilityRunning
              ? `⏳ Test en cours... (attendre 30s)`
              : `▶ Toggle + Vérifier 1s/5s/15s/30s`}
          </Button>
          {!canonical && (
            <p className="text-xs text-red-600 text-center">❌ Aucun doc canonique — initialiser d'abord</p>
          )}
          {stabilityLog.length > 0 && (
            <div className="space-y-1.5">
              {stabilityLog.map((entry, i) => (
                <div key={i} className={`rounded-xl p-2 text-xs font-mono border ${
                  entry.isReverted ? 'bg-red-50 border-red-400' : 'bg-green-50 border-green-300'
                }`}>
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-sm">+{entry.delay}</span>
                    <span className={`font-bold ${entry.mode === 'manuel' ? 'text-amber-700' : entry.mode === 'auto' ? 'text-green-700' : 'text-red-600'}`}>
                      {entry.mode ? entry.mode.toUpperCase() : '❌ NULL'}
                      {entry.modeAttendu && entry.mode !== entry.modeAttendu && ` (attendu: ${entry.modeAttendu})`}
                    </span>
                    {entry.isReverted
                      ? <span className="text-red-600 font-bold">⚠️ RÉVERSION</span>
                      : <span className="text-green-700 font-bold">✅ STABLE</span>
                    }
                  </div>
                  <p>id: {entry.id || '—'}</p>
                  <p>changed_by: <span className="font-bold">{entry.last_changed_by || '—'}</span></p>
                  <p>changed_at: {entry.last_changed_at ? moment(entry.last_changed_at).format('HH:mm:ss') : '—'}</p>
                  <p>updated_date: <span className={entry.isReverted ? 'text-red-600 font-bold' : ''}>{entry.updated_date ? moment(entry.updated_date).format('HH:mm:ss.SSS') : '—'}</span></p>
                  <p>all_docs ({entry.allCount}): {entry.allModes}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Logs Initialisation */}
      {initLog.length > 0 && (
        <Card className="border-blue-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">🪵 Logs Initialisation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {initLog.map((e, i) => (
                <div key={i} className={`rounded-lg px-2 py-1 text-xs font-mono ${
                  e.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' :
                  e.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' :
                  'bg-blue-50 text-blue-700 border border-blue-200'
                }`}>
                  <span className="text-[10px] opacity-60 mr-2">{moment(e.ts).format('HH:mm:ss')}</span>
                  {e.msg}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Historique realtime brut */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">📡 Historique Realtime (brut, 30 derniers)</CardTitle>
        </CardHeader>
        <CardContent>
          {realtimeLog.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2">En attente d'events...</p>
          ) : (
            <div className="space-y-1.5">
              {realtimeLog.map((e, i) => (
                <div key={i} className={`rounded-lg p-2 text-xs font-mono border ${
                  !e.isCanonical ? 'bg-red-50 border-red-200' :
                  e.mode === 'manuel' ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'
                }`}>
                  <div className="flex justify-between">
                    <span className="font-bold">{moment(e.ts).format('HH:mm:ss')}</span>
                    <span className={`font-bold ${e.mode === 'manuel' ? 'text-amber-700' : e.mode === 'auto' ? 'text-green-700' : 'text-gray-500'}`}>
                      {e.type?.toUpperCase()} → {e.mode?.toUpperCase()}
                    </span>
                    {!e.isCanonical && <span className="text-red-600 font-bold">NON-CANONIQUE</span>}
                  </div>
                  <p>id: {e.id} | mode_key: {e.mode_key} | by: {e.last_changed_by}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Infos config canonique détaillée */}
      {configData && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">📝 Config canonique détaillée</CardTitle>
          </CardHeader>
          <CardContent className="text-xs font-mono space-y-1">
            <p>id: <span className="text-primary">{configData.id}</span></p>
            <p>mode: <span className="font-bold">{configData.mode}</span></p>
            <p>mode_key: {configData.mode_key || '❌ ABSENT'}</p>
            <p>force_override: {String(configData.force_override)}</p>
            <p>last_changed_by: {configData.last_changed_by || '—'}</p>
            <p>last_changed_reason: {configData.last_changed_reason || '—'}</p>
            <p>last_changed_at: {configData.last_changed_at ? moment(configData.last_changed_at).format('DD/MM/YY HH:mm:ss') : '—'}</p>
            <p>updated_date: {configData.updated_date ? moment(configData.updated_date).format('DD/MM/YY HH:mm:ss') : '—'}</p>
          </CardContent>
        </Card>
      )}

      <div className="text-center text-[10px] text-muted-foreground pt-2">
        Dispatch V2 Debug · CANONICAL_KEY="{CANONICAL_KEY}" · admin={user?.email || '?'}
      </div>
    </div>
  );
}