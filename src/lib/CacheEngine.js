/**
 * CacheEngine — SOURCE UNIQUE pour le cache applicatif
 *
 * COMPATIBILITÉ : couche cache transparente au-dessus des appels API
 * Gère : Bedou, courses, notifications, dispatch + invalidation intelligente
 *
 * LOGS : [ENGINE_INIT] [ENGINE_READY] [ENGINE_MIGRATION_OK] [ENGINE_ERROR]
 */

const ENGINE_VERSION = '1.0.0';

// TTL par namespace (ms)
const TTL = {
  bedou:         15_000,  // 15s — solde sensible
  courses:       10_000,  // 10s — courses live
  notifications: 20_000,  // 20s
  dispatch:      8_000,   // 8s — dispatch très dynamique
  profile:       60_000,  // 60s — rarement modifié
  publicites:    120_000, // 2min
  default:       30_000,
};

console.log(`[ENGINE_INIT] CacheEngine v${ENGINE_VERSION}`);

class CacheStore {
  constructor() {
    this._store = new Map();
  }

  set(key, data, ttlMs) {
    this._store.set(key, {
      data,
      expires: Date.now() + (ttlMs || TTL.default),
      created: Date.now(),
    });
  }

  get(key) {
    const entry = this._store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expires) {
      this._store.delete(key);
      return null;
    }
    return entry.data;
  }

  invalidate(key) {
    this._store.delete(key);
  }

  invalidatePrefix(prefix) {
    for (const key of this._store.keys()) {
      if (key.startsWith(prefix)) this._store.delete(key);
    }
  }

  clear() {
    this._store.clear();
  }

  stats() {
    const now = Date.now();
    let valid = 0, expired = 0;
    for (const [k, v] of this._store) {
      if (now > v.expires) expired++;
      else valid++;
    }
    return { total: this._store.size, valid, expired };
  }
}

const _store = new CacheStore();

const CacheEngine = {
  version: ENGINE_VERSION,

  /**
   * Wrapper générique : si en cache → retourner immédiatement
   * Sinon → appeler fetchFn, stocker, retourner
   */
  async get(namespace, key, fetchFn, options = {}) {
    const ttlMs = options.ttl || TTL[namespace] || TTL.default;
    const cacheKey = `${namespace}:${key}`;

    const cached = _store.get(cacheKey);
    if (cached !== null) {
      return cached;
    }

    const data = await fetchFn();
    _store.set(cacheKey, data, ttlMs);
    console.log(`[ENGINE_MIGRATION_OK] CacheEngine.get | ns=${namespace} | key=${key} | cached=true`);
    return data;
  },

  /** Invalider une entrée */
  invalidate(namespace, key) {
    _store.invalidate(`${namespace}:${key}`);
    console.log(`[ENGINE_MIGRATION_OK] CacheEngine.invalidate | ns=${namespace} | key=${key}`);
  },

  /** Invalider tout un namespace */
  invalidateNamespace(namespace) {
    _store.invalidatePrefix(`${namespace}:`);
    console.log(`[ENGINE_MIGRATION_OK] CacheEngine.invalidateNamespace | ns=${namespace}`);
  },

  /** Invalider à la modification Bedou */
  onBedouUpdate(userEmail) {
    this.invalidate('bedou', userEmail);
    console.log(`[ENGINE_MIGRATION_OK] CacheEngine.onBedouUpdate | user=${userEmail}`);
  },

  /** Invalider à la modification d'une course */
  onCourseUpdate(courseId) {
    this.invalidate('courses', courseId);
    this.invalidateNamespace('dispatch');
  },

  /** Invalider les notifications */
  onNotificationUpdate(userEmail) {
    this.invalidate('notifications', userEmail);
  },

  /** Stocker directement */
  set(namespace, key, data, customTtlMs) {
    const ttlMs = customTtlMs || TTL[namespace] || TTL.default;
    _store.set(`${namespace}:${key}`, data, ttlMs);
  },

  /** Stats pour diagnostic */
  getStats() {
    return { ..._store.stats(), engine_version: ENGINE_VERSION };
  },

  /** Vider tout le cache */
  clear() {
    _store.clear();
    console.log(`[ENGINE_MIGRATION_OK] CacheEngine.clear | all cache cleared`);
  },

  TTL,
};

console.log(`[ENGINE_READY] CacheEngine v${ENGINE_VERSION} chargé`);

export default CacheEngine;