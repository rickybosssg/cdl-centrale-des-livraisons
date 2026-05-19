/**
 * NetworkEngine — SOURCE UNIQUE pour la gestion réseau
 *
 * COMPATIBILITÉ : couche réseau transparente — ne modifie rien d'existant
 * Gère : online/offline, ping backend, retry intelligent, timeout, queue offline
 *
 * LOGS : [ENGINE_INIT] [ENGINE_READY] [ENGINE_MIGRATION_OK] [ENGINE_ERROR]
 */

const ENGINE_VERSION = '1.0.0';
const PING_INTERVAL_MS = 30_000;
const PING_TIMEOUT_MS  = 5_000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;
const OFFLINE_QUEUE_MAX = 50;



// Queue des opérations offline
const _offlineQueue = [];
// Listeners
const _listeners = new Map();
let _isOnline = navigator.onLine;
let _pingTimer = null;
let _lastPingMs = null;

function emit(event, data) {
  const handlers = _listeners.get(event) || [];
  handlers.forEach(fn => { try { fn(data); } catch (_) {} });
}

function setOnline(online) {
  if (_isOnline === online) return;
  _isOnline = online;
  console.log(`[ENGINE_${online ? 'READY' : 'ERROR'}] NetworkEngine | online=${online}`);
  emit('status:change', { online });
  if (online) NetworkEngine._flushQueue();
}

// Écouter les events natifs
window.addEventListener('online',  () => setOnline(true));
window.addEventListener('offline', () => setOnline(false));

const NetworkEngine = {
  version: ENGINE_VERSION,

  /** Vérifier si en ligne */
  isOnline() { return _isOnline; },

  /** Latence du dernier ping (ms) */
  getLastPingMs() { return _lastPingMs; },

  /**
   * Wrapper fetch avec timeout + retry automatique
   * @param {string} url
   * @param {RequestInit} options
   * @param {object} retryOptions — { maxRetries, timeoutMs, retryOn }
   */
  async fetch(url, options = {}, retryOptions = {}) {
    const {
      maxRetries = MAX_RETRIES,
      timeoutMs = PING_TIMEOUT_MS,
      retryOn = [408, 429, 500, 502, 503, 504],
    } = retryOptions;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeoutId);

        if (!res.ok && retryOn.includes(res.status) && attempt < maxRetries) {
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
          console.warn(`[ENGINE_ERROR] NetworkEngine.fetch | status=${res.status} | retry ${attempt}/${maxRetries} in ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        console.log(`[ENGINE_MIGRATION_OK] NetworkEngine.fetch | url=${url.slice(0, 50)} | status=${res.status} | attempt=${attempt}`);
        return res;
      } catch (e) {
        clearTimeout(timeoutId);
        const isTimeout = e.name === 'AbortError';
        const isNetErr = e.name === 'TypeError';

        if ((isTimeout || isNetErr) && attempt < maxRetries) {
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
          console.warn(`[ENGINE_ERROR] NetworkEngine.fetch | ${isTimeout ? 'TIMEOUT' : 'NET_ERR'} | retry ${attempt}/${maxRetries} in ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        setOnline(false);
        throw new Error(`Network error after ${attempt} attempts: ${e.message}`);
      }
    }
  },

  /** Ping le backend pour vérifier la connectivité */
  async ping(url = null) {
    const pingUrl = url || (import.meta.env.VITE_BASE44_APP_BASE_URL || 'https://cdl.base44.app') + '/functions/ping';
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
      await fetch(pingUrl, { method: 'HEAD', signal: controller.signal });
      clearTimeout(timeoutId);
      _lastPingMs = Date.now() - start;
      setOnline(true);
      console.log(`[ENGINE_MIGRATION_OK] NetworkEngine.ping | latency=${_lastPingMs}ms`);
      return { online: true, latencyMs: _lastPingMs };
    } catch (_) {
      _lastPingMs = null;
      setOnline(false);
      return { online: false, latencyMs: null };
    }
  },

  /** Démarrer le ping périodique */
  startPingInterval(intervalMs = PING_INTERVAL_MS) {
    if (_pingTimer) clearInterval(_pingTimer);
    _pingTimer = setInterval(() => this.ping(), intervalMs);
    console.log(`[ENGINE_READY] NetworkEngine.startPingInterval | every ${intervalMs / 1000}s`);
  },

  /** Arrêter le ping */
  stopPingInterval() {
    if (_pingTimer) { clearInterval(_pingTimer); _pingTimer = null; }
  },

  /**
   * Ajouter une opération à la queue offline
   * Elle sera exécutée dès le retour en ligne
   */
  enqueue(fn, label = 'unknown') {
    if (_offlineQueue.length >= OFFLINE_QUEUE_MAX) {
      console.warn(`[ENGINE_ERROR] NetworkEngine.enqueue | queue full | dropping ${label}`);
      return;
    }
    _offlineQueue.push({ fn, label, queuedAt: Date.now() });
    console.log(`[ENGINE_MIGRATION_OK] NetworkEngine.enqueue | label=${label} | queueSize=${_offlineQueue.length}`);
  },

  /** Flush la queue offline (appelé automatiquement au retour en ligne) */
  async _flushQueue() {
    if (_offlineQueue.length === 0) return;
    console.log(`[ENGINE_MIGRATION_OK] NetworkEngine._flushQueue | size=${_offlineQueue.length}`);
    const toFlush = _offlineQueue.splice(0, _offlineQueue.length);
    for (const { fn, label } of toFlush) {
      try {
        await fn();
        console.log(`[ENGINE_MIGRATION_OK] NetworkEngine.flushQueue | ${label} OK`);
      } catch (e) {
        console.error(`[ENGINE_ERROR] NetworkEngine.flushQueue | ${label} FAILED | ${e.message}`);
      }
    }
  },

  /** S'abonner aux changements de statut réseau */
  onStatusChange(callback) {
    if (!_listeners.has('status:change')) _listeners.set('status:change', []);
    _listeners.get('status:change').push(callback);
    return () => {
      const arr = _listeners.get('status:change') || [];
      const idx = arr.indexOf(callback);
      if (idx > -1) arr.splice(idx, 1);
    };
  },

  /** Taille de la queue offline */
  queueSize() { return _offlineQueue.length; },
};



export default NetworkEngine;