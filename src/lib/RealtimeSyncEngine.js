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

const ENGINE_VERSION = '1.0.0';
const POLLING_INTERVAL_MS = 30_000;  // 30s fallback polling
const WS_RECONNECT_DELAY_MS = 5_000; // 5s avant reconnect

class RealtimeSyncEngine {
  constructor() {
    this.version = ENGINE_VERSION;
    this._subscriptions = new Map();
    this._pollingTimers = new Map();
    this._callbacks = new Map();
    this._active = false;
    this._userEmail = null;
  }

  /** Démarrer le moteur pour un utilisateur */
  start(userEmail) {
    if (this._active && this._userEmail === userEmail) return;
    this._userEmail = userEmail;
    this._active = true;
    console.log(`[RealtimeSyncEngine] start | user=${userEmail} | v${ENGINE_VERSION}`);
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