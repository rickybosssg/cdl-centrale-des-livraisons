/**
 * SystemHealth — Page admin /system-health
 * Supervision en temps réel de tous les moteurs CDL
 * Lecture seule + boutons de relance admin uniquement
 */

import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  CheckCircle2, AlertTriangle, XCircle, RefreshCw, Activity,
  Wifi, WifiOff, ArrowLeft, Clock, Zap, Shield, Database,
  Bell, MapPin, Truck, User
} from 'lucide-react';

const ENGINE_ICONS = {
  AuthEngine:         User,
  NetworkEngine:      Wifi,
  FcmTokenEngine:     Bell,
  BedouEngine:        Database,
  NotificationEngine: Bell,
  RealtimeSyncEngine: Activity,
  DispatchEngine:     Truck,
  PermissionEngine:   Shield,
  CacheEngine:        Database,
  LocationEngine:     MapPin,
  default:            Zap,
};

const STATUS_CFG = {
  ok:       { color: 'text-green-600',  bg: 'bg-green-50  border-green-200',  icon: CheckCircle2,   label: 'OK' },
  warn:     { color: 'text-amber-600',  bg: 'bg-amber-50  border-amber-200',  icon: AlertTriangle,  label: 'WARN' },
  critical: { color: 'text-red-600',    bg: 'bg-red-50    border-red-200',    icon: XCircle,        label: 'CRITIQUE' },
  unknown:  { color: 'text-gray-400',   bg: 'bg-gray-50   border-gray-200',   icon: Clock,          label: '—' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.unknown;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${cfg.bg} ${cfg.color}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

function EngineCard({ result, onRecover, recovering }) {
  if (!result) return null;
  const cfg = STATUS_CFG[result.status] || STATUS_CFG.unknown;
  const Icon = ENGINE_ICONS[result.name] || ENGINE_ICONS.default;
  const StatusIcon = cfg.icon;

  return (
    <div className={`rounded-xl border p-4 space-y-2 ${cfg.bg}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${result.status === 'ok' ? 'bg-green-100' : result.status === 'warn' ? 'bg-amber-100' : 'bg-red-100'}`}>
            <Icon className={`w-4 h-4 ${cfg.color}`} />
          </div>
          <div>
            <p className="font-semibold text-sm">{result.name}</p>
            <p className="text-xs text-muted-foreground">{result.message}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {result.latencyMs != null && (
            <span className="text-xs text-muted-foreground">{result.latencyMs}ms</span>
          )}
          <StatusBadge status={result.status} />
        </div>
      </div>

      {result.details && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Détails</summary>
          <pre className="mt-1 bg-white/60 p-2 rounded text-[10px] overflow-auto max-h-24">
            {JSON.stringify(result.details, null, 2)}
          </pre>
        </details>
      )}

      {(result.status === 'warn' || result.status === 'critical') && onRecover && (
        <Button
          size="sm"
          variant="outline"
          className="w-full gap-1.5 text-xs"
          disabled={recovering === result.name}
          onClick={() => onRecover(result.name)}
        >
          {recovering === result.name
            ? <><span className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /> Relance...</>
            : <><RefreshCw className="w-3 h-3" /> Relancer {result.name}</>
          }
        </Button>
      )}
    </div>
  );
}

export default function SystemHealth() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [recovering, setRecovering] = useState(null);
  const [recoveryLog, setRecoveryLog] = useState([]);
  const [fcmTokens, setFcmTokens] = useState([]);
  const [lastChecked, setLastChecked] = useState(null);
  const [registrySummary, setRegistrySummary] = useState(null);

  useEffect(() => {
    base44.auth.me().then(u => {
      setUser(u);
      if (u?.role === 'admin') runHealthCheck();
    });
  }, []);

  const runHealthCheck = useCallback(async () => {
    setRunning(true);
    try {
      const HealthMonitorEngine = (await import('@/lib/HealthMonitorEngine')).default;
      const EngineRegistry = (await import('@/lib/EngineRegistry')).default;
      const RecoveryEngine = (await import('@/lib/RecoveryEngine')).default;

      // Init registry si pas encore fait
      await EngineRegistry.init();

      const [healthReport, summary, recLog] = await Promise.all([
        HealthMonitorEngine.runAll(),
        Promise.resolve(EngineRegistry.getSummary()),
        Promise.resolve(RecoveryEngine.getLog()),
      ]);

      setReport(healthReport);
      setRegistrySummary(summary);
      setRecoveryLog(recLog.slice(0, 10));
      setLastChecked(new Date());

      // Charger tokens FCM actifs
      try {
        const tokens = await base44.entities.FcmToken.filter({ is_active: true }, '-last_used', 10);
        setFcmTokens(tokens || []);
      } catch (_) {}

    } catch (e) {
      console.error('[SystemHealth] runHealthCheck error:', e.message);
    } finally {
      setRunning(false);
      setLoading(false);
    }
  }, []);

  const handleRecover = async (engineName) => {
    if (user?.role !== 'admin') return;
    setRecovering(engineName);
    try {
      const RecoveryEngine = (await import('@/lib/RecoveryEngine')).default;
      const result = await RecoveryEngine.recover(engineName, { force: true });
      console.log(`[SystemHealth] Recovery ${engineName}:`, result);
      // Recheck après recovery
      setTimeout(runHealthCheck, 1500);
    } catch (e) {
      console.error('[SystemHealth] recovery error:', e.message);
    } finally {
      setRecovering(null);
    }
  };

  const isAdmin = user?.role === 'admin';
  const globalStatus = report?.globalStatus || 'unknown';
  const globalCfg = STATUS_CFG[globalStatus] || STATUS_CFG.unknown;
  const GlobalIcon = globalCfg.icon;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Analyse des moteurs CDL...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <Shield className="w-12 h-12 text-muted-foreground mx-auto" />
          <p className="font-semibold">Accès réservé aux administrateurs</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-10 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Supervision Système CDL
          </h1>
          {lastChecked && (
            <p className="text-xs text-muted-foreground">
              Dernière vérification : {lastChecked.toLocaleTimeString()}
            </p>
          )}
        </div>
        <Button
          size="sm"
          onClick={runHealthCheck}
          disabled={running}
          className="gap-1.5"
        >
          <RefreshCw className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} />
          {running ? 'Analyse...' : 'Actualiser'}
        </Button>
      </div>

      {/* Statut global */}
      {report && (
        <div className={`rounded-2xl border-2 p-5 ${globalCfg.bg}`}>
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-xl ${globalStatus === 'ok' ? 'bg-green-100' : globalStatus === 'warn' ? 'bg-amber-100' : 'bg-red-100'}`}>
              <GlobalIcon className={`w-6 h-6 ${globalCfg.color}`} />
            </div>
            <div className="flex-1">
              <p className={`text-lg font-extrabold ${globalCfg.color}`}>
                Système {globalStatus === 'ok' ? 'Opérationnel' : globalStatus === 'warn' ? 'Dégradé' : 'En Erreur'}
              </p>
              <p className="text-sm text-muted-foreground">
                {report.summary.ok}/{report.summary.total} moteurs OK
                {report.summary.warn > 0 && ` · ${report.summary.warn} avertissements`}
                {report.summary.critical > 0 && ` · ${report.summary.critical} critiques`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Résumé EngineRegistry */}
      {registrySummary && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Database className="w-4 h-4" /> Registry des moteurs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                { label: 'Total', value: registrySummary.total, color: 'text-foreground' },
                { label: 'Prêts', value: registrySummary.ready, color: 'text-green-600' },
                { label: 'En erreur', value: registrySummary.error, color: 'text-red-600' },
                { label: 'En chargement', value: registrySummary.loading, color: 'text-amber-600' },
              ].map(s => (
                <div key={s.label} className="p-2 rounded-lg bg-muted/50">
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Moteurs */}
      {report?.results && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">État des moteurs</p>
          <div className="space-y-2">
            {report.results.map(result => (
              <EngineCard
                key={result.name}
                result={result}
                onRecover={isAdmin ? handleRecover : null}
                recovering={recovering}
              />
            ))}
          </div>
        </div>
      )}

      {/* FCM Tokens actifs */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bell className="w-4 h-4" /> Tokens FCM actifs (10 récents)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {fcmTokens.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Aucun token FCM actif trouvé</p>
          ) : (
            <div className="space-y-1">
              {fcmTokens.map(t => (
                <div key={t.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50 text-xs">
                  <div className="truncate flex-1">
                    <span className="font-medium">{t.user_email}</span>
                    <span className="text-muted-foreground ml-2">{t.device_type || 'android'}</span>
                  </div>
                  <div className="text-muted-foreground flex-shrink-0 ml-2">
                    {t.last_used ? new Date(t.last_used).toLocaleDateString() : '—'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Réseau */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            {navigator.onLine ? <Wifi className="w-4 h-4 text-green-600" /> : <WifiOff className="w-4 h-4 text-red-500" />}
            Réseau
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
            <div className={`w-3 h-3 rounded-full ${navigator.onLine ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
            <div>
              <p className="text-sm font-semibold">{navigator.onLine ? 'Connecté' : 'Hors ligne'}</p>
              <p className="text-xs text-muted-foreground">navigator.onLine = {String(navigator.onLine)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logs de recovery */}
      {recoveryLog.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <RefreshCw className="w-4 h-4" /> Historique recovery
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {recoveryLog.map((entry, i) => (
                <div key={i} className={`flex items-center gap-2 p-2 rounded-lg text-xs ${
                  entry.status === 'ok' ? 'bg-green-50 text-green-800' :
                  entry.status === 'failed' ? 'bg-red-50 text-red-800' :
                  'bg-gray-50 text-gray-600'
                }`}>
                  {entry.status === 'ok' ? <CheckCircle2 className="w-3 h-3 flex-shrink-0" /> :
                   entry.status === 'failed' ? <XCircle className="w-3 h-3 flex-shrink-0" /> :
                   <Clock className="w-3 h-3 flex-shrink-0" />}
                  <span className="font-semibold">{entry.name}</span>
                  <span className="flex-1 truncate">{entry.detail}</span>
                  <span className="text-muted-foreground flex-shrink-0">
                    {new Date(entry.ts).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions admin */}
      {isAdmin && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-blue-900">Actions admin</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              size="sm"
              variant="outline"
              className="w-full gap-1.5 text-xs"
              disabled={running}
              onClick={async () => {
                setRunning(true);
                try {
                  const RecoveryEngine = (await import('@/lib/RecoveryEngine')).default;
                  await RecoveryEngine.recoverAll();
                  setTimeout(runHealthCheck, 1500);
                } finally {
                  setRunning(false);
                }
              }}
            >
              <Zap className="w-3 h-3" />
              Relancer tous les moteurs en erreur
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="w-full gap-1.5 text-xs"
              onClick={async () => {
                const CacheEngine = (await import('@/lib/CacheEngine')).default;
                CacheEngine.clear();
                runHealthCheck();
              }}
            >
              <Database className="w-3 h-3" />
              Vider tout le cache
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}