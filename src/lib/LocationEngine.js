/**
 * LocationEngine — SOURCE UNIQUE pour la géolocalisation
 *
 * COMPATIBILITÉ : wrapper autour des APIs natives — aucun changement destructif
 * Gère : GPS client/livreur, permissions, précision, distance, ETA, fallback
 *
 * LOGS : [ENGINE_INIT] [ENGINE_READY] [ENGINE_MIGRATION_OK] [ENGINE_ERROR]
 */

import { base44 } from '@/api/base44Client';

const ENGINE_VERSION = '1.0.0';
const GPS_HIGH_ACCURACY_TIMEOUT = 10_000;
const GPS_LOW_ACCURACY_TIMEOUT  = 5_000;
const EARTH_RADIUS_KM = 6371;



// Cache position récente (30s)
let _lastPosition = null;
let _lastPositionTs = 0;
const POS_CACHE_TTL_MS = 30_000;

/** Degrés → radians */
function toRad(deg) { return deg * Math.PI / 180; }

const LocationEngine = {
  version: ENGINE_VERSION,

  /** Vérifier la permission GPS */
  async checkPermission() {
    try {
      if ('permissions' in navigator) {
        const result = await navigator.permissions.query({ name: 'geolocation' });
        return result.state; // 'granted' | 'denied' | 'prompt'
      }
      return 'unknown';
    } catch (e) {
      console.error(`[ENGINE_ERROR] LocationEngine.checkPermission | ${e.message}`);
      return 'unknown';
    }
  },

  /** Demander la position GPS (haute précision, puis fallback basse précision) */
  async getCurrentPosition(options = {}) {
    const { useCache = true, highAccuracy = true } = options;

    // Cache récent
    if (useCache && _lastPosition && Date.now() - _lastPositionTs < POS_CACHE_TTL_MS) {
      return _lastPosition;
    }

    return new Promise((resolve, reject) => {
      const successFn = (pos) => {
        const result = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        };
        _lastPosition = result;
        _lastPositionTs = Date.now();
        console.log(`[ENGINE_MIGRATION_OK] LocationEngine.getCurrentPosition | lat=${result.lat.toFixed(4)} | accuracy=${Math.round(result.accuracy)}m`);
        resolve(result);
      };

      const errorFn = (err) => {
        console.error(`[ENGINE_ERROR] LocationEngine.getCurrentPosition | code=${err.code} | ${err.message}`);
        // Fallback : tenter basse précision si haute a échoué
        if (highAccuracy && err.code === err.TIMEOUT) {
          navigator.geolocation.getCurrentPosition(
            successFn,
            (err2) => reject(new Error(`GPS unavailable: ${err2.message}`)),
            { enableHighAccuracy: false, timeout: GPS_LOW_ACCURACY_TIMEOUT, maximumAge: 60000 }
          );
        } else {
          reject(new Error(`GPS error (${err.code}): ${err.message}`));
        }
      };

      if (!navigator.geolocation) {
        reject(new Error('Geolocation API non disponible'));
        return;
      }

      navigator.geolocation.getCurrentPosition(successFn, errorFn, {
        enableHighAccuracy: highAccuracy,
        timeout: highAccuracy ? GPS_HIGH_ACCURACY_TIMEOUT : GPS_LOW_ACCURACY_TIMEOUT,
        maximumAge: useCache ? POS_CACHE_TTL_MS : 0,
      });
    });
  },

  /** Watchposition — stream temps réel (retourne stopFn) */
  watchPosition(callback, errorCallback) {
    if (!navigator.geolocation) {
      errorCallback?.(new Error('Geolocation non disponible'));
      return () => {};
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const result = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        _lastPosition = result;
        _lastPositionTs = Date.now();
        callback(result);
      },
      (err) => {
        console.error(`[ENGINE_ERROR] LocationEngine.watchPosition | ${err.message}`);
        errorCallback?.(err);
      },
      { enableHighAccuracy: true, timeout: GPS_HIGH_ACCURACY_TIMEOUT, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  },

  /** Distance Haversine entre deux points (km) */
  distance(lat1, lng1, lat2, lng2) {
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },

  /** ETA estimé (vitesse moto ~25 km/h en ville) */
  eta(distanceKm, speedKmh = 25) {
    const minutes = Math.ceil((distanceKm / speedKmh) * 60);
    return { minutes, label: minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)}h` };
  },

  /** Sauvegarder la position du livreur en BDD — SOURCE UNIQUE : gps_latitude/gps_longitude */
  async saveDriverPosition(userId, lat, lng) {
    try {
      await base44.auth.updateMe({ gps_latitude: lat, gps_longitude: lng });
      console.log(`[ENGINE_MIGRATION_OK] LocationEngine.saveDriverPosition | user=${userId} | lat=${lat.toFixed(4)}`);
    } catch (e) {
      console.error(`[ENGINE_ERROR] LocationEngine.saveDriverPosition | ${e.message}`);
    }
  },

  /** Appeler le backend pour ETA précis */
  async getEtaFromBackend(from, to) {
    try {
      const res = await base44.functions.invoke('calculateETA', { from, to });
      return res.data;
    } catch (e) {
      console.error(`[ENGINE_ERROR] LocationEngine.getEtaFromBackend | ${e.message}`);
      // Fallback local
      const dist = this.distance(from.lat, from.lng, to.lat, to.lng);
      return this.eta(dist);
    }
  },

  /** Dernier point GPS connu (depuis cache) */
  getLastKnown() {
    return _lastPosition;
  },

  // ── Redirection paramètres Android (depuis PermissionEngine) ───────────────
  openAndroidSettings() {
    try {
      if (window.Capacitor?.isNativePlatform?.()) {
        import('@capacitor/app').then(({ App }) => App.exitApp()).catch(() => {});
      }
    } catch (_) {}
  },
};



export default LocationEngine;