/**
 * SystemHealth — Page admin /system-health
 * Supervision directe CDL — sans HealthMonitorEngine ni RecoveryEngine (supprimés).
 * Vérifie directement : Auth, Réseau, FCM, Bedou, Dispatch, Notifications.
 */

import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  CheckCircle2, AlertTriangle, XCircle, RefreshCw, Activity,
  Wifi, WifiOff, ArrowLeft, Clock, Zap, Shield, Database,
  Bell, Truck, User
} from 'lucide-react';

const STATUS_CFG = {
  ok:       { color: 'text-green-600',  bg: 'bg-green-50  border-green-200',  icon: CheckCircle2,   label: 'OK' },
  warn:     { color: 'text-amber-600',  bg: 'bg-amber-50  border-amber-200',  icon: AlertTriangle,  label: 'WARN' },
  critical: { color: 'text-red-600',    bg: 'bg-red-50    border-red-200',    icon: XCircle,        label: 'CRITIQUE' },
  unknown:  { color: 'text-gray-400',   bg: 'bg-gray-50   border-gray-200',   icon: Clock,          label: '—' },
};

const ENGINE_ICONS = {
  Auth:          User,
  Réseau:        Wifi,
  FCM:           Bell,
  Bedou:         Database,
  Notifications: Bell,
  Dispatch:      Truck,
  default:       Zap,
};

// ── Checks directs sans moteur externe ─────────────────────────────────────────

async function checkAuth() {
  const start = Date.now();
  try {
    const user = await base44.auth.me();
    if (!user) return { name: 'Auth', status: 'critical', message: 'Non connecté', latencyMs: Date.now() - start };
    return { name: 'Auth', status: 'ok', message: `Connecté : ${user.email}`, latencyMs: Date.now() - start, details: { email: user.email, role: user.role } };
  } catch (e) {
    return { name: 'Auth', status: 'critical', message: e.message, latencyMs: Date.now() - start };
  }
}

async function checkNetwork() {
  const start = Date.now();
  const online = navigator.onLine;
  return { name: 'Réseau', status: online ? 'ok' : 'critical', message: online ? 'En ligne' : 'Hors ligne', latencyMs: Date.now() - start };
}

async function checkFcm() {
  const start = Date.now();
  try {
    const tokens = await base44.entities.FcmToken.filter({ is_active: true }, null, 20);
    const count = tokens?.length || 0;
    return {
      name: 'FCM',
      status: count > 0 ? 'ok' : 'warn',
      message: count > 0 ? `${count} token(s) actif(s)` : 'Aucun token FCM actif',
      latencyMs: Date.now() - start,
      details: { active_tokens: count },
    };
  } catch (e) {
    return { name: 'FCM', status: 'critical', message: e.message, latencyMs: Date.now() - start };
  }
}

async function checkBedou() {
  const start = Date.now();
  try {
    const records = await base44.entities.Bedou.list(null, 1);
    return { name: 'Bedou', status: 'ok', message: 'Service Bedou opérationnel', latencyMs: Date.now() - start, details: { sample_count: records?.length } };
  } catch (e) {
    return { name: 'Bedou', status: 'critical', message: e.message, latencyMs: Date.now() - start };
  }
}

async function checkNotifications() {
  const start = Date.now();
  try {
    const recent = await base44.entities.Notification.list('-created_date', 5);
    const unread = recent?.filter(n => !n.lue)?.length || 0;
    return { name: 'Notifications', status: 'ok', message: `Service OK · ${unread} non lues récentes`, latencyMs: Date.now() - start, details: { recent_count: recent?.length, unread } };
  } catch (e) {
    return { name: 'Notifications', status: 'critical', message: e.message, latencyMs: Date.now() - start };
  }
}

async function checkDispatch() {
  const start = Date.now();
  try {
    const rows = await base44.entities.DispatchModeState.list('-updated_date', 1);
    const doc = rows[0];
    if (!doc) return { name: 'Dispatch', status: 'warn', message: 'Aucun doc DispatchModeState', latencyMs: Date.now() - start };
    return { name: 'Dispatch', status: 'ok', message: `Mode : ${doc.mode}`, latencyMs: Date.now() - start, details: { mode: doc.mode } };
  } catch (e) {
    return { name: 'Dispatch', status: 'critical', message: e.message, latencyMs: Date.now() - start };
  }
}

// ── Composants UI ───────────────────────────────────────────────────────────

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

function EngineCard({ result }) {
  if (!result) return null;
  const cfg = STATUS_CFG[result.status] || STATUS_CFG.unknown;
  const Icon = ENGINE_ICONS[result.name] || ENGINE_ICONS.default;

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
    </div>
  );
}

// ── Page principale ─────────────────────────────────────────────────────────

export default function SystemHealth() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [fcmTokens, setFcmTokens] = useState([]);
  const [lastChecked, setLastChecked] = useState(null);

  const runChecks = useCallback(async () => {
    setRunning(true);
    try {
      const checks = await Promise.allSettled([
        checkAuth(),
        checkNetwork(),
        checkFcm(),
        checkBedou(),
        checkNotifications(),
        checkDispatch(),
      ]);

      const r = checks.map((c, i) => {
        if (c.status === 'fulfilled') return c.value;
        const names = ['Auth', 'Réseau', 'FCM', 'Bedou', 'Notifications', 'Dispatch'];
        return { name: names[i], status: 'critical', message: c.reason?.message || 'Erreur', latencyMs: 0 };
      });

      setResults(r);
      setLastChecked(new Date());

      // Tokens FCM récents
      try {
        const tokens = await base44.entities.FcmToken.filter({ is_active: true }, '-last_used', 10);
        setFcmTokens(tokens || []);
      } catch (_) {}

    } finally {
      setRunning(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    base44.auth.me().then(u => {
      setUser(u);
      if (u?.role === 'admin') runChecks();
      else setLoading(false);
    });
  }, []);

  const isAdmin = user?.role === 'admin';
  const ok = results.filter(r => r.status === 'ok').length;
  const warn = results.filter(r => r.status === 'warn').length;
  const critical = results.filter(r => r.status === 'critical').length;
  const globalStatus = critical > 0 ? 'critical' : warn > 0 ? 'warn' : results.length > 0 ? 'ok' : 'unknown';
  const globalCfg = STATUS_CFG[globalStatus];
  const GlobalIcon = globalCfg.icon;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Analyse système CDL...</p>
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
        <Button size="sm" onClick={runChecks} disabled={running} className="gap-1.5">
          <RefreshCw className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} />
          {running ? 'Analyse...' : 'Actualiser'}
        </Button>
      </div>

      {/* Statut global */}
      {results.length > 0 && (
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
                {ok}/{results.length} checks OK
                {warn > 0 && ` · ${warn} avertissement(s)`}
                {critical > 0 && ` · ${critical} critique(s)`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Checks individuels */}
      {results.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Checks système</p>
          {results.map(r => <EngineCard key={r.name} result={r} />)}
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

      {/* Actions admin */}
      {isAdmin && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-blue-900">Actions admin</CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              size="sm"
              variant="outline"
              className="w-full gap-1.5 text-xs border-orange-200 text-orange-700 hover:bg-orange-50"
              disabled={running}
              onClick={async () => {
                setRunning(true);
                try {
                  const res = await base44.functions.invoke('cleanupStaleTokens', {});
                  alert(`✅ FCM nettoyé\n- Supprimés (inactifs > 7j) : ${res.data?.deleted_stale ?? 0}\n- Dédupliqués (actifs) : ${res.data?.deduped_active ?? 0}`);
                  runChecks();
                } catch (e) {
                  alert(`❌ Erreur: ${e.message}`);
                } finally {
                  setRunning(false);
                }
              }}
            >
              <Bell className="w-3 h-3" />
              Nettoyer tokens FCM anciens
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}