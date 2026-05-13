/**
 * RecoveryEngine — Réparation automatique des moteurs bloqués
 *
 * - Tente réparation si un moteur est en état critique
 * - Ne bloque JAMAIS une action en cours (tout est async fire-and-forget)
 * - Relance FCM, realtime, cache, network si nécessaire
 * - Anti-spam : cooldown 2min par moteur
 *
 * LOGS : [ENGINE_RECOVERY_START] [ENGINE_RECOVERY_OK] [ENGINE_RECOVERY_FAILED] [ENGINE_RECOVERY_SKIP]
 */

import EngineRegistry from './EngineRegistry';

const ENGINE_VERSION = '1.0.0';
const RECOVERY_COOLDOWN_MS = 2 * 60_000; // 2 min entre deux tentatives sur le même moteur
const MAX_ATTEMPTS = 3;

// Historique des récupérations
const _recoveryLog = [];
const MAX_LOG = 30;

// Cooldowns par moteur
const _cooldowns = new Map();
// Tentatives par moteur (reset après succès)
const _attempts = new Map();

console.log(`[ENGINE_INIT] RecoveryEngine v${ENGINE_VERSION}`);

function logRecovery(name, status, detail = '') {
  const entry = { name, status, detail, ts: Date.now() };
  _recoveryLog.unshift(entry);
  if (_recoveryLog.length > MAX_LOG) _recoveryLog.length = MAX_LOG;
  const tag = status === 'ok' ? 'ENGINE_RECOVERY_OK' : status === 'failed' ? 'ENGINE_RECOVERY_FAILED' : 'ENGINE_RECOVERY_SKIP';
  console.log(`[${tag}] RecoveryEngine | ${name} | ${detail}`);
}

function isCoolingDown(name) {
  const last = _cooldowns.get(name);
  if (!last) return false;
  return (Date.now() - last) < RECOVERY_COOLDOWN_MS;
}

function setCooldown(name) {
  _cooldowns.set(name, Date.now());
}

function incrementAttempts(name) {
  const n = (_attempts.get(name) || 0) + 1;
  _attempts.set(name, n);
  return n;
}

function resetAttempts(name) {
  _attempts.delete(name);
}

// ── Stratégies de recovery par moteur ─────────────────────────────────────────

const RECOVERY_STRATEGIES = {

  FcmTokenEngine: async () => {
    // Dispatcher l'event de re-register FCM (FcmBootstrap l'écoute)
    window.dispatchEvent(new CustomEvent('cdl_fcm_force_register', {
      detail: { source: 'RecoveryEngine', ts: Date.now() },
    }));
    return 'FCM re-register event dispatché';
  },

  RealtimeSyncEngine: async () => {
    const mod = await import('./RealtimeSyncEngine');
    const engine = mod.default;
    if (engine.reconnect) {
      await engine.reconnect();
      return 'Realtime reconnecté';
    }
    return 'Realtime — pas de méthode reconnect';
  },

  NetworkEngine: async () => {
    const mod = await import('./NetworkEngine');
    const engine = mod.default;
    const result = await engine.ping();
    if (result.online) {
      await engine._flushQueue();
      return `Réseau OK | latency=${result.latencyMs}ms | queue flushée`;
    }
    throw new Error('Réseau toujours hors ligne après ping');
  },

  CacheEngine: async () => {
    const mod = await import('./CacheEngine');
    const engine = mod.default;
    engine.clear();
    return 'Cache vidé';
  },

  AuthEngine: async () => {
    const mod = await import('./AuthEngine');
    const engine = mod.default;
    engine.clearCache();
    await engine.me(true); // Force refresh
    return 'Auth cache rechargé';
  },

  BedouEngine: async () => {
    // Pas de recovery destructive sur Bedou — on invalide juste le cache
    const mod = await import('./CacheEngine');
    mod.default.invalidateNamespace('bedou');
    return 'Cache Bedou invalidé';
  },

  NotificationEngine: async () => {
    const mod = await import('./CacheEngine');
    mod.default.invalidateNamespace('notifications');
    return 'Cache notifications invalidé';
  },

  DispatchEngine: async () => {
    const mod = await import('./CacheEngine');
    mod.default.invalidateNamespace('dispatch');
    return 'Cache dispatch invalidé';
  },
};

const RecoveryEngine = {
  version: ENGINE_VERSION,

  /**
   * Tenter recovery d'un moteur spécifique
   * @param {string} name — nom du moteur
   * @param {object} options — { force: bool } pour bypasser le cooldown
   */
  async recover(name, options = {}) {
    const { force = false } = options;

    // Cooldown check
    if (!force && isCoolingDown(name)) {
      const remaining = Math.round((RECOVERY_COOLDOWN_MS - (Date.now() - _cooldowns.get(name))) / 1000);
      logRecovery(name, 'skip', `Cooldown actif — ${remaining}s restants`);
      return { success: false, reason: 'cooldown', remaining };
    }

    // Max attempts check
    const attempts = incrementAttempts(name);
    if (!force && attempts > MAX_ATTEMPTS) {
      logRecovery(name, 'skip', `Max tentatives atteint (${MAX_ATTEMPTS}) — escalade manuelle requise`);
      return { success: false, reason: 'max_attempts', attempts };
    }

    const strategy = RECOVERY_STRATEGIES[name];
    if (!strategy) {
      logRecovery(name, 'skip', `Pas de stratégie de recovery pour ${name}`);
      return { success: false, reason: 'no_strategy' };
    }

    console.log(`[ENGINE_RECOVERY_START] RecoveryEngine | ${name} | attempt=${attempts}`);
    setCooldown(name);

    try {
      const detail = await strategy();
      resetAttempts(name);
      EngineRegistry.updateHeartbeat(name);
      logRecovery(name, 'ok', detail);
      return { success: true, detail };
    } catch (e) {
      logRecovery(name, 'failed', e.message);
      EngineRegistry.markError(name, e.message);
      return { success: false, reason: 'strategy_failed', error: e.message };
    }
  },

  /**
   * Recovery automatique basé sur un rapport de santé
   * À appeler avec le résultat de HealthMonitorEngine.runAll()
   * Fire-and-forget — ne bloque jamais
   */
  async autoRecover(healthReport) {
    if (!healthReport?.results) return;

    const criticals = healthReport.results.filter(r => r.status === 'critical');
    const warns = healthReport.results.filter(r => r.status === 'warn');

    // Priorité aux critiques d'abord
    for (const check of criticals) {
      // Recovery async non-bloquant
      this.recover(check.name).catch(() => {});
    }

    // Puis les warnings (uniquement si stratégie disponible)
    for (const check of warns) {
      if (RECOVERY_STRATEGIES[check.name]) {
        this.recover(check.name).catch(() => {});
      }
    }
  },

  /** Forcer recovery de tous les moteurs en erreur */
  async recoverAll() {
    console.log(`[ENGINE_RECOVERY_START] RecoveryEngine.recoverAll`);
    const statuses = EngineRegistry.getAllStatuses();
    const results = {};
    for (const [name, entry] of Object.entries(statuses)) {
      if (entry.status === 'error') {
        results[name] = await this.recover(name, { force: true });
      }
    }
    return results;
  },

  /** Logs de recovery */
  getLog() { return [..._recoveryLog]; },

  /** Cooldowns actifs */
  getCooldowns() {
    const result = {};
    for (const [name, ts] of _cooldowns) {
      result[name] = {
        since: ts,
        remaining: Math.max(0, Math.round((RECOVERY_COOLDOWN_MS - (Date.now() - ts)) / 1000)),
      };
    }
    return result;
  },

  /** Noms des moteurs avec stratégie disponible */
  getRecoverableEngines() {
    return Object.keys(RECOVERY_STRATEGIES);
  },
};

console.log(`[ENGINE_READY] RecoveryEngine v${ENGINE_VERSION} chargé`);

export default RecoveryEngine;