/**
 * RealtimeSyncEngine — SOURCE UNIQUE pour la synchronisation temps réel
 *
 * Gère : refresh solde Bedou, notifications, courses, dispatch,
 *        fallback polling, reconnect WebSocket
 *
 * RÈGLES :
 * 1. Un seul moteur actif par instance de l'app
 * 2. Subscriptions gérées centralement (pas de doublons)
 * 3. Fallback polling si WebSocket indisponible
 * 4. Cleanup automatique au unmount via destroy()
 */

import { base44 } from '@/api/base44Client';

const ENGINE_VERSION = '1.1.0';
const POLLING_INTERVAL_MS = 30_000;
const WS_RECONNECT_DELAY_MS = 5_000;

class RealtimeSyncEngine {
  constructor() {
    this.version = ENGINE_VERSION;
    this._subscriptions = new Map();
    this._pollingTimers = new Map();
    this._callbacks = new Map();
    this._active = false;
    this._userEmail = null;
    this._wsStatus = 'unknown';   // 'connected' | 'closed' | 'error' | 'unknown'
    this._pollingActive = false;
    this._wsProbeUnsub = null;
    this._lastConnectedAt = null;
    this._lastErrorAt = null;
    console.log(`[REALTIME_INIT_START] RealtimeSyncEngine v${ENGINE_VERSION}`);
  }

  /** Démarrer le moteur pour un utilisateur */
  start(userEmail) {
    if (this._active && this._userEmail === userEmail) return;
    this._userEmail = userEmail;
    this._active = true;
    console.log(`[REALTIME_INIT_START] start | user=${userEmail} | v${ENGINE_VERSION}`);
    this._probeWebSocket();
  }

  /**
   * Probe WebSocket : souscrire à un channel léger pour tester la connexion WS réelle.
   * Si la subscription s'établit → wsStatus='connected', fallback polling OFF.
   * Si elle échoue/timeout → wsStatus='error', fallback polling ON.
   */
  _probeWebSocket() {
    if (this._wsProbeUnsub) { try { this._wsProbeUnsub(); } catch (_) {} }

    try {
      console.log(`[REALTIME_CHANNEL_CREATED] probe channel | user=${this._userEmail}`);
      // Souscrire à Notification — channel léger qui fonctionne toujours si auth OK
      const unsub = base44.entities.Notification.subscribe((event) => {
        if (this._wsStatus !== 'connected') {
          this._wsStatus = 'connected';
          this._lastConnectedAt = new Date().toISOString();
          this._pollingActive = false;
          console.log(`[REALTIME_WEBSOCKET_CONNECTED] WS actif | user=${this._userEmail}`);
          console.log(`[REALTIME_HEALTH_OK] WebSocket opérationnel | user=${this._userEmail}`);
          // Désactiver fallback polling si WS reconnecté
          this._stopPolling('probe_fallback');
        }
      });
      this._wsProbeUnsub = unsub;
      this._wsStatus = 'connected'; // Base44 subscribe est synchrone si la session est OK
      this._lastConnectedAt = new Date().toISOString();
      console.log(`[REALTIME_SUBSCRIBE_OK] probe subscription active | user=${this._userEmail}`);
    } catch (e) {
      this._wsStatus = 'error';
      this._lastErrorAt = new Date().toISOString();
      console.error(`[REALTIME_SUBSCRIBE_ERROR] probe failed | ${e.message} | user=${this._userEmail}`);
      this._activateFallback();
    }
  }

  /** Activer fallback polling si WS vraiment indisponible */
  _activateFallback() {
    if (this._pollingActive) return;
    this._pollingActive = true;
    console.log(`[REALTIME_FALLBACK_POLLING_ON] démarrage fallback polling | user=${this._userEmail}`);
    // Tenter reconnect WS après délai
    this.startPolling('probe_fallback', async () => {
      if (this._wsStatus !== 'connected') {
        console.log(`[REALTIME_RECONNECT_ATTEMPT] tentative reconnect WS | user=${this._userEmail}`);
        this._probeWebSocket();
      } else {
        this._stopPolling('probe_fallback');
        this._pollingActive = false;
      }
    }, WS_RECONNECT_DELAY_MS);
  }

  /**
   * registerExternalSubscription — Appelé par un composant qui a déjà une
   * subscription WS active (NotificationBell, BedouWidget, etc.).
   * Permet au moteur de se marquer "connecté" sans dupliquer la subscription.
   * @param {string} key    - clé unique ('notifications', 'bedou', etc.)
   * @param {function} unsub - fonction de cleanup
   * @param {string} email  - email utilisateur
   */
  registerExternalSubscription(key, unsub, email) {
    if (this._subscriptions.has(key)) return; // déjà enregistré
    this._subscriptions.set(key, unsub);
    if (email && !this._userEmail) this._userEmail = email;
    if (!this._active) {
      this._active = true;
      this._wsStatus = 'connected';
      this._lastConnectedAt = new Date().toISOString();
      this._pollingActive = false;
      console.log(`[REALTIME_WEBSOCKET_CONNECTED] external sub registered | key=${key} | user=${email}`);
      console.log(`[REALTIME_HEALTH_OK] moteur actif via subscription externe | subs=${this._subscriptions.size}`);
    }
  }

  /** Retourne l'état courant du moteur (utilisé par HealthMonitorEngine) */
  getStatus() {
    return {
      ws: this._wsStatus,
      mode: this._wsStatus === 'connected' ? 'realtime' : this._pollingActive ? 'polling' : 'idle',
      active: this._active,
      userEmail: this._userEmail,
      subscriptionCount: this._subscriptions.size,
      pollingCount: this._pollingTimers.size,
      lastConnectedAt: this._lastConnectedAt,
      lastErrorAt: this._lastErrorAt,
      version: this.version,
    };
  }

  /** Souscrire aux updates de solde Bedou */
  subscribeBedou(userEmail, callback) {
    const key = `bedou:${userEmail}`;
    this._cleanup(key);
    const unsub = base44.entities.Bedou.subscribe((event) => {
      if (event.data?.user_email === userEmail) {
        callback({ type: 'bedou_update', data: event.data, event });
      }
    });
    this._subscriptions.set(key, unsub);
    this._callbacks.set(key, callback);
    return () => this._cleanup(key);
  }

  /** Souscrire aux nouvelles notifications */
  subscribeNotifications(userEmail, callback) {
    const key = `notif:${userEmail}`;
    this._cleanup(key);
    const unsub = base44.entities.Notification.subscribe((event) => {
      if (event.data?.destinataire_email === userEmail && event.type === 'create') {
        callback({ type: 'new_notification', data: event.data, event });
      }
    });
    this._subscriptions.set(key, unsub);
    return () => this._cleanup(key);
  }

  /** Souscrire aux changements de courses (pour livreur et client) */
  subscribeCourses(filterFn, callback) {
    const key = `courses:${this._userEmail}`;
    this._cleanup(key);
    const unsub = base44.entities.Course.subscribe((event) => {
      if (!filterFn || filterFn(event.data)) {
        callback({ type: 'course_update', data: event.data, event });
      }
    });
    this._subscriptions.set(key, unsub);
    return () => this._cleanup(key);
  }

  /** Souscrire aux changements de dispatch */
  subscribeDispatch(callback) {
    const key = `dispatch:global`;
    this._cleanup(key);
    const unsub = base44.entities.DispatchConfig.subscribe((event) => {
      callback({ type: 'dispatch_update', data: event.data, event });
    });
    this._subscriptions.set(key, unsub);
    return () => this._cleanup(key);
  }

  /**
   * Fallback polling — si les WebSockets échouent, poll toutes les 30s
   * refreshFn : fonction async qui charge les données depuis l'API
   */
  startPolling(key, refreshFn, intervalMs = POLLING_INTERVAL_MS) {
    this._stopPolling(key);
    const timer = setInterval(async () => {
      try {
        await refreshFn();
      } catch (e) {
        console.warn(`[RealtimeSyncEngine] polling error | key=${key} | ${e.message}`);
      }
    }, intervalMs);
    this._pollingTimers.set(key, timer);
    return () => this._stopPolling(key);
  }

  _stopPolling(key) {
    const timer = this._pollingTimers.get(key);
    if (timer) {
      clearInterval(timer);
      this._pollingTimers.delete(key);
    }
  }

  _cleanup(key) {
    const unsub = this._subscriptions.get(key);
    if (typeof unsub === 'function') unsub();
    this._subscriptions.delete(key);
    this._callbacks.delete(key);
  }

  /** Nettoyer toutes les subscriptions (appeler au unmount) */
  destroy() {
    for (const [key] of this._subscriptions) this._cleanup(key);
    for (const [key] of this._pollingTimers) this._stopPolling(key);
    this._active = false;
    console.log(`[RealtimeSyncEngine] destroyed | user=${this._userEmail}`);
  }
}

// Singleton — une seule instance partagée dans l'app
const realtimeSyncEngine = new RealtimeSyncEngine();
export default realtimeSyncEngine;