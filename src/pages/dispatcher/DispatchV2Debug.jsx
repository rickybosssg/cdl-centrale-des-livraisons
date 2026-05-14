/**
 * Page de diagnostic DispatchEngine V2
 * Route : /dispatch-v2-debug
 */
import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useDispatchModeV2 } from '@/context/DispatchModeV2Context';
import { normalizeModeV2 } from '@/lib/DispatchEngineV2';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw, ShieldCheck, ShieldX, Zap, ZapOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import moment from 'moment';

export default function DispatchV2Debug() {
  const navigate = useNavigate();
  const { mode, configId, configData, loading, toggling, toggle, reload } = useDispatchModeV2();
  const [dbMode, setDbMode] = useState(null);
  const [dbConfig, setDbConfig] = useState(null);
  const [history, setHistory] = useState([]);
  const [autoDispatchStatus, setAutoDispatchStatus] = useState(null);
  const [testRunning, setTestRunning] = useState(false);
  const [user, setUser] = useState(null);

  const loadAll = async () => {
    try {
      const [u, configs] = await Promise.all([
        base44.auth.me(),
        base44.entities.DispatchConfig.list('-updated_date', 10),
      ]);
      setUser(u);

      if (configs.length > 0) {
        setDbConfig(configs[0]);
        setDbMode(normalizeModeV2(configs[0].mode));
        setHistory(configs.slice(0, 10));
      } else {
        setDbMode(null);
        setHistory([]);
      }
    } catch (e) {
      console.error('[DispatchV2Debug] loadAll error:', e.message);
    }
  };

  const testAutoDispatchBlocked = async () => {
    setTestRunning(true);
    try {
      // Simuler un call autoDispatch avec une fausse course (juste pour tester le blocage mode)
      const res = await base44.functions.invoke('autoDispatch', {
        course_id: 'TEST_DEBUG_V2_FAKE',
        _v2_test: true,
      });
      const blocked = res.data?.blocked === true;
      setAutoDispatchStatus({
        blocked,
        reason: res.data?.reason || 'non bloqué',
        mode: res.data?.mode || '?',
        raw: res.data,
      });
    } catch (e) {
      setAutoDispatchStatus({ blocked: null, error: e.message });
    } finally {
      setTestRunning(false);
    }
  };

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 10000);
    return () => clearInterval(interval);
  }, []);

  const modeMatch = mode === dbMode;

  return (
    <div className="space-y-4 pb-16 px-4">
      <div className="flex items-center gap-3 py-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">DispatchEngine V2 — Debug</h1>
          <p className="text-xs text-muted-foreground">Diagnostic complet mode dispatch</p>
        </div>
        <Button variant="outline" size="icon" onClick={() => { reload(); loadAll(); }}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Status global */}
      <div className={`rounded-2xl border-2 p-4 ${
        mode === 'manuel' ? 'bg-amber-50 border-amber-400' :
        mode === 'auto' ? 'bg-green-50 border-green-400' :
        'bg-gray-50 border-gray-300'
      }`}>
        <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Mode actuel (UI Context V2)</p>
        <p className={`text-3xl font-black ${
          mode === 'manuel' ? 'text-amber-700' :
          mode === 'auto' ? 'text-green-700' :
          'text-gray-500'
        }`}>
          {loading ? '⏳ Chargement...' : mode ? mode.toUpperCase() : '❌ AUCUNE CONFIG'}
        </p>
        <p className="text-xs text-muted-foreground mt-1">configId: {configId || 'none'}</p>
      </div>

      {/* Comparaison UI vs BDD */}
      <Card className={modeMatch ? 'border-green-300' : 'border-red-400 bg-red-50'}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            {modeMatch ? <ShieldCheck className="h-4 w-4 text-green-600" /> : <ShieldX className="h-4 w-4 text-red-600" />}
            Cohérence UI ↔ BDD
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Mode UI (context V2)</span>
            <span className={`font-bold ${mode === 'manuel' ? 'text-amber-700' : 'text-green-700'}`}>{mode ?? 'null'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Mode BDD (lecture directe)</span>
            <span className={`font-bold ${dbMode === 'manuel' ? 'text-amber-700' : 'text-green-700'}`}>{dbMode ?? 'null'}</span>
          </div>
          {!modeMatch && (
            <p className="text-red-600 font-bold mt-2">⚠️ DÉSYNCHRONISATION DÉTECTÉE</p>
          )}
          {modeMatch && (
            <p className="text-green-700 font-medium mt-1">✅ Synchronisés</p>
          )}
        </CardContent>
      </Card>

      {/* Dernier write */}
      {dbConfig && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">📝 Dernier changement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Admin</span>
              <span className="font-medium">{dbConfig.last_changed_by || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Raison</span>
              <span className="font-medium text-right max-w-[60%]">{dbConfig.last_changed_reason || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Timestamp</span>
              <span className="font-medium">{dbConfig.last_changed_at ? moment(dbConfig.last_changed_at).format('DD/MM HH:mm:ss') : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">force_override</span>
              <span className={`font-bold ${dbConfig.force_override ? 'text-primary' : 'text-muted-foreground'}`}>
                {String(dbConfig.force_override)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Test autoDispatch bloqué */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">🧪 Test : autoDispatch bloqué ?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={testAutoDispatchBlocked}
            disabled={testRunning}
          >
            {testRunning ? '⏳ Test en cours...' : 'Tester autoDispatch (fausse course)'}
          </Button>
          {autoDispatchStatus && (
            <div className={`rounded-xl p-3 text-xs space-y-1 ${
              autoDispatchStatus.blocked ? 'bg-amber-50 border border-amber-300' : 'bg-green-50 border border-green-300'
            }`}>
              <div className="flex items-center gap-2">
                {autoDispatchStatus.blocked
                  ? <ZapOff className="h-4 w-4 text-amber-600" />
                  : <Zap className="h-4 w-4 text-green-600" />
                }
                <span className="font-bold">
                  {autoDispatchStatus.blocked
                    ? '✅ Bloqué correctement (mode manuel)'
                    : autoDispatchStatus.error
                    ? `❌ Erreur: ${autoDispatchStatus.error}`
                    : '⚡ Non bloqué (mode auto)'}
                </span>
              </div>
              <p>Raison : {autoDispatchStatus.reason}</p>
              <p>Mode BDD lu : {autoDispatchStatus.mode}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Historique configs */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">📋 Historique DispatchConfig (10 derniers)</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2">Aucune config en BDD</p>
          ) : (
            <div className="space-y-2">
              {history.map((cfg, idx) => (
                <div key={cfg.id || idx} className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs border ${
                  cfg.mode === 'manuel' ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'
                }`}>
                  <div>
                    <span className={`font-bold ${cfg.mode === 'manuel' ? 'text-amber-700' : 'text-green-700'}`}>
                      {cfg.mode?.toUpperCase()}
                    </span>
                    <span className="text-muted-foreground ml-2">{cfg.last_changed_by || 'system'}</span>
                  </div>
                  <span className="text-muted-foreground">
                    {cfg.last_changed_at ? moment(cfg.last_changed_at).format('DD/MM HH:mm:ss') : moment(cfg.updated_date).format('DD/MM HH:mm:ss')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Switch test V2 */}
      <Card className="border-primary/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">🔧 Switch V2 (test direct)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Utilise <code>toggle()</code> du context V2 directement.
            Vérifie que le mode reste stable 30 secondes après.
          </p>
          <Button
            className="w-full"
            variant={mode === 'auto' ? 'default' : 'outline'}
            onClick={() => toggle(user?.email)}
            disabled={toggling || loading}
          >
            {toggling ? '⏳ En cours...' : mode === 'auto' ? '→ Passer en Manuel' : '→ Passer en Auto'}
          </Button>
          <p className="text-[10px] text-muted-foreground text-center">
            Admin : {user?.email || 'inconnu'} | État toggle : {toggling ? 'en cours' : 'prêt'}
          </p>
        </CardContent>
      </Card>

      <div className="text-center text-[10px] text-muted-foreground pt-2">
        Auto-refresh toutes les 10s · DispatchEngine V2
      </div>
    </div>
  );
}