/**
 * HealthMonitorEngine — Surveillance continue de tous les moteurs CDL
 *
 * Surveille : FCM, Bedou, Notification, Realtime, Auth, Network, Dispatch
 * Logs : [ENGINE_HEALTH_OK] [ENGINE_HEALTH_WARN] [ENGINE_HEALTH_CRITICAL]
 *
 * LECTURE SEULE — aucune modification d'état
 */

import { base44 } from '@/api/base44Client';

const ENGINE_VERSION = '1.0.0';
const CHECK_INTERVAL_MS = 60_000;  // 1 min
const HEARTBEAT_WARN_MS  = 5 * 60_000;  // 5 min sans heartbeat → WARN
const HEARTBEAT_CRIT_MS  = 15 * 60_000; // 15 min → CRITICAL

// Historique des résultats (garde les 50 derniers)
const _history = [];
const MAX_HISTORY = 50;

// Listeners
const _listeners = [];
let _intervalId = null;
let _running = false;

function emit(event, data) {
  _listeners.forEach(fn => { try { fn(event, data); } catch (_) {} });
}

function addHistory(entry) {
  _history.unshift({ ...entry, checkedAt: Date.now() });
  if (_history.length > MAX_HISTORY) _history.length = MAX_HISTORY;
}

console.log(`[ENGINE_INIT] HealthMonitorEngine v${ENGINE_VERSION}`);

/**
 * Vérifier un moteur individuel
 * Retourne { name, status: 'ok'|'warn'|'critical', message, latencyMs }
 */
async function checkEngine(name, checkFn) {
  const start = Date.now();
  try {
    const result = await Promise.race([
      checkFn(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout 5s')), 5000)),
    ]);
    const latencyMs = Date.now() - start;
    const status = result?.status || 'ok';
    const logTag = status === 'ok' ? 'ENGINE_HEALTH_OK' : status === 'warn' ? 'ENGINE_HEALTH_WARN' : 'ENGINE_HEALTH_CRITICAL';
    console.log(`[${logTag}] ${name} | ${result?.message || 'OK'} | ${latencyMs}ms`);
    return { name, status, message: result?.message || 'OK', latencyMs, details: result?.details || null };
  } catch (e) {
    console.error(`[ENGINE_HEALTH_CRITICAL] ${name} | ERROR: ${e.message}`);
    return { name, status: 'critical', message: e.message, latencyMs: Date.now() - start, details: null };
  }
}

const HealthMonitorEngine = {
  version: ENGINE_VERSION,

  // ── Checks individuels ─────────────────────────────────────────────────────

  async checkAuth() {
    return checkEngine('AuthEngine', async () => {
      const user = await base44.auth.me();
      if (!user) return { status: 'critical', message: 'Utilisateur non connecté' };
      return { status: 'ok', message: `Connecté: ${user.email}`, details: { email: user.email, role: user.role } };
    });
  },

  async checkNetwork() {
    return checkEngine('NetworkEngine', async () => {
      const online = navigator.onLine;
      if (!online) return { status: 'critical', message: 'Hors ligne' };
      return { status: 'ok', message: 'En ligne', details: { online } };
    });
  },

  async checkFcm() {
    return checkEngine('FcmTokenEngine', async () => {
      const FcmTokenEngine = (await import('./FcmTokenEngine')).default;
      let user = null;
      try { user = await base44.auth.me(); } catch (_) {}
      if (!user?.email) return { status: 'warn', message: 'Utilisateur non connecté — vérif FCM ignorée' };

      // Vérifier si on est sur APK native
      const isNative = (
        window.location?.protocol === 'capacitor:' ||
        window.location?.protocol === 'file:' ||
        window.Capacitor?.getPlatform?.() === 'android'
      );

      const report = await FcmTokenEngine.getDiagnostics(user.email);
      if (!report) return { status: 'warn', message: 'Rapport FCM indisponible' };
      const activeCount = report.bdd_active ?? 0;

      // Si aucun token actif sur APK native → WARN (pas CRITICAL) : l'APK doit ouvrir /fcm-native-debug
      if (activeCount === 0) {
        const msg = isNative
          ? 'Aucun token FCM actif — ouvrir /fcm-native-debug pour enregistrer'
          : 'Aucun token FCM actif (web — push non configuré)';
        return { status: 'warn', message: msg, details: report };
      }

      return {
        status: 'ok',
        message: `${activeCount} token(s) actif(s)`,
        details: { bdd_active: activeCount, device: report.device?.device_type, local_match: report.local_match_in_bdd },
      };
    });
  },

  async checkBedou() {
    return checkEngine('BedouEngine', async () => {
      // Vérifier que le service Bedou répond
      const records = await base44.entities.Bedou.list(null, 1);
      return { status: 'ok', message: 'Service Bedou opérationnel', details: { sample_count: records?.length } };
    });
  },

  async checkNotifications() {
    return checkEngine('NotificationEngine', async () => {
      // Vérifier les notifs récentes non lues
      const recent = await base44.entities.Notification.list('-created_date', 5);
      const unread = recent?.filter(n => !n.lue)?.length || 0;
      return { status: 'ok', message: `Service notifs OK (${unread} non lues récentes)`, details: { recent_count: recent?.length, unread } };
    });
  },

  async checkRealtime() {
    return checkEngine('RealtimeSyncEngine', async () => {
      // RealtimeSyncEngine supprimé — les subscriptions sont directes par composant
      // Le WS est considéré actif si l'app est connectée
      const online = navigator.onLine;
      return {
        status: online ? 'ok' : 'warn',
        message: online ? 'Subscriptions directes actives (mode simplifié)' : 'Hors ligne',
        details: { mode: 'direct_subscriptions', online },
      };
    });
  },

  async checkDispatch() {
    return checkEngine('DispatchEngine', async () => {
      // LECTURE STRICTE : uniquement le doc canonique GLOBAL
      const all = await base44.entities.DispatchConfig.list('-updated_date', 50);
      const canonical = all.find(c => c.mode_key === 'GLOBAL');
      if (!canonical) {
        return { status: 'warn', message: `Aucun doc GLOBAL (${all.length} docs totaux)`, details: { totalDocs: all.length } };
      }
      const mode = canonical.mode;
      return { status: 'ok', message: `Dispatch mode: ${mode} | GLOBAL id=${canonical.id}`, details: { mode, id: canonical.id, isCanonical: true } };
    });
  },

  // ── Check global ───────────────────────────────────────────────────────────

  async runAll() {
    console.log(`[ENGINE_HEALTH_OK] HealthMonitorEngine.runAll | START`);
    const checks = await Promise.allSettled([
      this.checkAuth(),
      this.checkNetwork(),
      this.checkFcm(),
      this.checkBedou(),
      this.checkNotifications(),
      this.checkRealtime(),
      this.checkDispatch(),
    ]);

    const results = checks.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      const names = ['AuthEngine', 'NetworkEngine', 'FcmTokenEngine', 'BedouEngine', 'NotificationEngine', 'RealtimeSyncEngine', 'DispatchEngine'];
      return { name: names[i], status: 'critical', message: r.reason?.message || 'Erreur', latencyMs: 0 };
    });

    const summary = {
      ok:       results.filter(r => r.status === 'ok').length,
      warn:     results.filter(r => r.status === 'warn').length,
      critical: results.filter(r => r.status === 'critical').length,
      total:    results.length,
      checkedAt: Date.now(),
    };

    const globalStatus = summary.critical > 0 ? 'critical' : summary.warn > 0 ? 'warn' : 'ok';
    const fullReport = { results, summary, globalStatus };

    addHistory({ ...summary, globalStatus });
    emit('health:report', fullReport);

    const tag = globalStatus === 'ok' ? 'ENGINE_HEALTH_OK' : globalStatus === 'warn' ? 'ENGINE_HEALTH_WARN' : 'ENGINE_HEALTH_CRITICAL';
    console.log(`[${tag}] HealthMonitorEngine.runAll | ok=${summary.ok} warn=${summary.warn} critical=${summary.critical}`);

    return fullReport;
  },

  // ── Monitoring périodique ─────────────────────────────────────────────────

  start(intervalMs = CHECK_INTERVAL_MS) {
    if (_running) return;
    _running = true;
    // Premier check immédiat
    setTimeout(() => this.runAll(), 2000);
    _intervalId = setInterval(() => this.runAll(), intervalMs);
    console.log(`[ENGINE_READY] HealthMonitorEngine.start | every ${intervalMs / 1000}s`);
  },

  stop() {
    if (_intervalId) { clearInterval(_intervalId); _intervalId = null; }
    _running = false;
    console.log(`[ENGINE_HEALTH_OK] HealthMonitorEngine.stop`);
  },

  isRunning() { return _running; },

  // ── Historique ────────────────────────────────────────────────────────────

  getHistory() { return [..._history]; },
  getLastReport() { return _history[0] || null; },

  // ── Abonnements ───────────────────────────────────────────────────────────

  subscribe(callback) {
    _listeners.push(callback);
    return () => {
      const idx = _listeners.indexOf(callback);
      if (idx > -1) _listeners.splice(idx, 1);
    };
  },
};

console.log(`[ENGINE_READY] HealthMonitorEngine v${ENGINE_VERSION} chargé`);

export default HealthMonitorEngine;