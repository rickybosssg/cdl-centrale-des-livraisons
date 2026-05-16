/**
 * EngineRegistry — Registre central de tous les moteurs CDL
 *
 * - Initialise les moteurs dans le bon ordre
 * - Empêche double initialisation (idempotent)
 * - Expose engine.ready / engine.error / engine.lastHeartbeat
 *
 * LOGS : [ENGINE_INIT] [ENGINE_READY] [ENGINE_ERROR] [ENGINE_REGISTRY_*]
 */

const REGISTRY_VERSION = '1.0.0';

// ── Ordre d'initialisation (priorité décroissante) ────────────────────────────
const INIT_ORDER = [
  'AuthEngine',
  'NetworkEngine',
  'PermissionEngine',
  'AuditEngine',
  'CacheEngine',
  'FcmTokenEngine',
  'BedouEngine',
  'NotificationEngine',
  'ProfileEngine',
  'CourseStatusEngine',
  'LocationEngine',
  'UploadEngine',
  'UIStateEngine',
  'RealtimeSyncEngine',
];

// ── État interne ───────────────────────────────────────────────────────────────
const _registry = new Map(); // name → { engine, status, error, lastHeartbeat, initAt }
let _initialized = false;
let _initInProgress = false;

// ── Listeners ──────────────────────────────────────────────────────────────────
const _listeners = [];
function emit(event, data) {
  _listeners.forEach(fn => { try { fn(event, data); } catch (_) {} });
}

console.log(`[ENGINE_INIT] EngineRegistry v${REGISTRY_VERSION}`);

const EngineRegistry = {
  version: REGISTRY_VERSION,

  /**
   * Initialiser tous les moteurs (idempotent)
   * @param {object} context — { userEmail?, native? } optionnel
   */
  async init(context = {}) {
    if (_initialized) {
      console.log('[ENGINE_REGISTRY_SKIP] Déjà initialisé — skip');
      return;
    }
    if (_initInProgress) {
      console.log('[ENGINE_REGISTRY_SKIP] Init en cours — skip');
      return;
    }
    _initInProgress = true;
    console.log(`[ENGINE_INIT] EngineRegistry.init | order=${INIT_ORDER.length} engines`);

    for (const name of INIT_ORDER) {
      await this._initOne(name, context);
    }

    _initialized = true;
    _initInProgress = false;
    console.log(`[ENGINE_READY] EngineRegistry.init COMPLETE | ${_registry.size} engines registered`);
    emit('registry:ready', { count: _registry.size });
  },

  /** Initialiser un moteur individuel (lazy, safe) */
  async _initOne(name, context = {}) {
    if (_registry.has(name)) {
      const existing = _registry.get(name);
      if (existing.status === 'ready') return existing.engine;
    }

    _registry.set(name, { status: 'loading', engine: null, error: null, lastHeartbeat: null, initAt: Date.now() });

    try {
      let engine = null;

      // Import dynamique selon le nom
      switch (name) {
        case 'AuthEngine':        engine = (await import('./AuthEngine')).default; break;
        case 'NetworkEngine':     engine = (await import('./NetworkEngine')).default; break;
        case 'PermissionEngine':  engine = (await import('./PermissionEngine')).default; break;
        case 'AuditEngine':       engine = (await import('./AuditEngine')).default; break;
        case 'CacheEngine':       engine = (await import('./CacheEngine')).default; break;
        case 'FcmTokenEngine':    engine = (await import('./FcmTokenEngine')).default; break;
        case 'BedouEngine':       engine = (await import('./BedouEngine')).default; break;
        case 'NotificationEngine': engine = (await import('./NotificationEngine')).default; break;
        case 'DispatchEngine':    engine = null; break; // Supprimé — dispatch géré par DispatchModeContext
        case 'ProfileEngine':     engine = (await import('./ProfileEngine')).default; break;
        case 'CourseStatusEngine': engine = (await import('./CourseStatusEngine')).default; break;
        case 'LocationEngine':    engine = (await import('./LocationEngine')).default; break;
        case 'UploadEngine':      engine = (await import('./UploadEngine')).default; break;
        case 'UIStateEngine':     engine = (await import('./UIStateEngine')).default; break;
        case 'RealtimeSyncEngine': engine = (await import('./RealtimeSyncEngine')).default; break;
        default:
          throw new Error(`Moteur inconnu: ${name}`);
      }

      _registry.set(name, {
        status: 'ready',
        engine,
        error: null,
        lastHeartbeat: Date.now(),
        initAt: Date.now(),
      });

      console.log(`[ENGINE_READY] EngineRegistry | ${name} ✅`);
      emit('engine:ready', { name });
      return engine;

    } catch (e) {
      _registry.set(name, {
        status: 'error',
        engine: null,
        error: e.message,
        lastHeartbeat: null,
        initAt: Date.now(),
      });
      console.error(`[ENGINE_ERROR] EngineRegistry | ${name} ❌ | ${e.message}`);
      emit('engine:error', { name, error: e.message });
      return null;
    }
  },

  /** Obtenir un moteur par nom */
  get(name) {
    return _registry.get(name)?.engine || null;
  },

  /** Statut d'un moteur */
  getStatus(name) {
    return _registry.get(name) || { status: 'unknown', engine: null, error: null, lastHeartbeat: null };
  },

  /** Tous les statuts */
  getAllStatuses() {
    const result = {};
    for (const [name, entry] of _registry) {
      result[name] = {
        status: entry.status,
        error: entry.error,
        lastHeartbeat: entry.lastHeartbeat,
        initAt: entry.initAt,
      };
    }
    return result;
  },

  /** Mettre à jour le heartbeat d'un moteur */
  updateHeartbeat(name) {
    const entry = _registry.get(name);
    if (entry) {
      entry.lastHeartbeat = Date.now();
      _registry.set(name, entry);
    }
  },

  /** Marquer un moteur en erreur */
  markError(name, errorMsg) {
    const entry = _registry.get(name);
    if (entry) {
      entry.status = 'error';
      entry.error = errorMsg;
      _registry.set(name, entry);
      emit('engine:error', { name, error: errorMsg });
    }
  },

  /** Réinitialiser un moteur (pour recovery) */
  async reset(name, context = {}) {
    console.log(`[ENGINE_INIT] EngineRegistry.reset | ${name}`);
    _registry.delete(name);
    return this._initOne(name, context);
  },

  /** Est-ce que le registre est prêt */
  isReady() { return _initialized; },

  /** S'abonner aux événements du registre */
  subscribe(callback) {
    _listeners.push(callback);
    return () => {
      const idx = _listeners.indexOf(callback);
      if (idx > -1) _listeners.splice(idx, 1);
    };
  },

  /** Résumé pour diagnostic */
  getSummary() {
    let ready = 0, error = 0, loading = 0;
    for (const [, entry] of _registry) {
      if (entry.status === 'ready') ready++;
      else if (entry.status === 'error') error++;
      else loading++;
    }
    return { total: _registry.size, ready, error, loading, initialized: _initialized };
  },
};

export default EngineRegistry;