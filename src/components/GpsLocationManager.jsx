import { useState, useEffect, useCallback, useRef } from "react";
import { MapPin, Navigation, AlertCircle, RefreshCw, Settings, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

/**
 * GpsLocationManager — Gestion complète GPS pour livreurs CDL
 * 
 * États gérés :
 * - idle         → jamais demandé
 * - loading      → en cours de géolocalisation
 * - granted      → position obtenue ✅
 * - denied       → refusé (peut réessayer)
 * - denied_perm  → refusé définitivement (doit aller dans les paramètres)
 * - unavailable  → GPS désactivé sur l'appareil
 * - timeout      → délai dépassé
 * - error        → autre erreur
 */

const GPS_STATUS = {
  idle: "idle",
  loading: "loading",
  granted: "granted",
  denied: "denied",
  denied_perm: "denied_perm",
  unavailable: "unavailable",
  timeout: "timeout",
  error: "error",
};

const ERROR_MESSAGES = {
  [GPS_STATUS.denied]:
    "Permission de localisation refusée. Appuyez sur « Réessayer » pour demander à nouveau.",
  [GPS_STATUS.denied_perm]:
    "Localisation bloquée définitivement. Allez dans les paramètres de votre téléphone pour l'activer.",
  [GPS_STATUS.unavailable]:
    "GPS désactivé sur votre téléphone. Activez la localisation dans les paramètres.",
  [GPS_STATUS.timeout]:
    "Impossible d'obtenir votre position (délai dépassé). Vérifiez que le GPS est bien activé et réessayez.",
  [GPS_STATUS.error]:
    "Une erreur inattendue s'est produite. Vérifiez vos paramètres de localisation.",
};

export default function GpsLocationManager({ onLocationUpdate, compact = false }) {
  const [status, setStatus] = useState(GPS_STATUS.idle);
  const [coords, setCoords] = useState(null);
  const [permissionState, setPermissionState] = useState(null); // 'prompt'|'granted'|'denied'
  const retryCount = useRef(0);
  const visibilityHandlerRef = useRef(null);

  // ─── Vérification initiale de la permission ─────────────────────────────
  useEffect(() => {
    checkPermissionState();
    // Écouter retour depuis les paramètres téléphone
    const onVisible = () => {
      if (document.visibilityState === "visible" && 
          (status === GPS_STATUS.unavailable || status === GPS_STATUS.denied || status === GPS_STATUS.denied_perm)) {
        checkPermissionState(true);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    visibilityHandlerRef.current = onVisible;
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [status]);

  const checkPermissionState = async (andRequest = false) => {
    if (!("geolocation" in navigator)) {
      setStatus(GPS_STATUS.error);
      return;
    }
    // Permissions API (pas dispo dans tous les WebViews Android)
    if (navigator.permissions) {
      try {
        const perm = await navigator.permissions.query({ name: "geolocation" });
        setPermissionState(perm.state);
        if (perm.state === "granted") {
          // Permission déjà accordée → récupérer position directement
          if (andRequest || status !== GPS_STATUS.granted) requestPosition();
          return;
        }
        if (perm.state === "denied") {
          setStatus(GPS_STATUS.denied_perm);
          return;
        }
        // state === "prompt" → on peut demander
        if (andRequest) requestPosition();
      } catch (_) {
        // Permissions API indisponible (WebView Android) → tenter directement
        if (andRequest) requestPosition();
      }
    } else {
      // Pas d'API permissions → tenter directement
      if (andRequest) requestPosition();
    }
  };

  // ─── Demande de position ─────────────────────────────────────────────────
  const requestPosition = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setStatus(GPS_STATUS.error);
      return;
    }
    setStatus(GPS_STATUS.loading);

    navigator.geolocation.getCurrentPosition(
      (position) => onPositionSuccess(position),
      (err) => onPositionError(err),
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 30000,
      }
    );
  }, []);

  // ─── Succès ─────────────────────────────────────────────────────────────
  const onPositionSuccess = async (position) => {
    const { latitude, longitude, accuracy } = position.coords;
    retryCount.current = 0;

    const locationData = {
      gps_latitude: latitude,
      gps_longitude: longitude,
      gps_accuracy: accuracy,
      gps_timestamp: new Date().toISOString(),
      gps_enabled: true,
    };

    setCoords({ latitude, longitude, accuracy });
    setStatus(GPS_STATUS.granted);

    // Sauvegarder en base
    try {
      await base44.auth.updateMe(locationData);
    } catch (_) {}

    if (onLocationUpdate) onLocationUpdate(locationData);
    toast.success("✅ Localisation activée avec succès");
  };

  // ─── Erreur géolocalisation ──────────────────────────────────────────────
  const onPositionError = (err) => {
    console.warn("[GPS] Erreur:", err.code, err.message);

    switch (err.code) {
      case 1: // PERMISSION_DENIED
        // Sur Android, si on a déjà essayé plusieurs fois → probablement bloqué définitivement
        if (retryCount.current >= 1 || permissionState === "denied") {
          setStatus(GPS_STATUS.denied_perm);
        } else {
          setStatus(GPS_STATUS.denied);
        }
        break;
      case 2: // POSITION_UNAVAILABLE → GPS désactivé
        setStatus(GPS_STATUS.unavailable);
        break;
      case 3: // TIMEOUT
        setStatus(GPS_STATUS.timeout);
        break;
      default:
        setStatus(GPS_STATUS.error);
    }
  };

  // ─── Bouton principal ────────────────────────────────────────────────────
  const handleActivate = () => {
    retryCount.current++;
    requestPosition();
  };

  // ─── Ouvrir paramètres Android ───────────────────────────────────────────
  const openSettings = () => {
    // Sur Android WebView Capacitor/Cordova
    if (window.cordova?.plugins?.diagnostic) {
      window.cordova.plugins.diagnostic.switchToLocationSettings();
      return;
    }
    // Fallback navigateur : URL deep-link Android (fonctionne dans certains APKs)
    try {
      window.open("intent://settings/location#Intent;scheme=android-app;end", "_blank");
    } catch (_) {}
    toast.info("Ouvrez manuellement : Paramètres → Localisation");
  };

  // ─── Rendu compact (dans LivreurHome inline) ─────────────────────────────
  if (compact) {
    if (status === GPS_STATUS.granted) {
      return (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-50 border border-green-200">
          <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
          <span className="text-xs font-medium text-green-700">GPS actif</span>
        </div>
      );
    }
    return (
      <button
        onClick={handleActivate}
        disabled={status === GPS_STATUS.loading}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium"
      >
        {status === GPS_STATUS.loading
          ? <span className="w-3 h-3 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
          : <Navigation className="h-3.5 w-3.5" />}
        Activer GPS
      </button>
    );
  }

  // ─── Rendu principal ─────────────────────────────────────────────────────
  const isGranted = status === GPS_STATUS.granted;
  const isLoading = status === GPS_STATUS.loading;
  const hasError = [GPS_STATUS.denied, GPS_STATUS.denied_perm, GPS_STATUS.unavailable, GPS_STATUS.timeout, GPS_STATUS.error].includes(status);
  const needsSettings = status === GPS_STATUS.denied_perm || status === GPS_STATUS.unavailable;

  return (
    <div className={`rounded-2xl border-2 p-4 space-y-3 transition-colors ${
      isGranted ? "border-green-300 bg-green-50" : hasError ? "border-red-200 bg-red-50" : "border-border bg-card"
    }`}>
      {/* En-tête */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            isGranted ? "bg-green-200" : hasError ? "bg-red-100" : "bg-primary/10"
          }`}>
            {isGranted
              ? <CheckCircle2 className="h-5 w-5 text-green-700" />
              : hasError
                ? <AlertCircle className="h-5 w-5 text-red-500" />
                : <Navigation className="h-5 w-5 text-primary" />}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm">📍 Localisation GPS</p>
            <p className="text-xs text-muted-foreground leading-snug">
              {isGranted
                ? `Position activée${coords ? ` · précision ${Math.round(coords.accuracy)}m` : ""}`
                : isLoading
                  ? "Récupération de votre position..."
                  : "Activez le GPS pour recevoir des courses"}
            </p>
          </div>
        </div>

        {/* Bouton principal */}
        {!isGranted && (
          <Button
            onClick={handleActivate}
            disabled={isLoading}
            size="sm"
            variant={hasError ? "destructive" : "default"}
            className="flex-shrink-0 gap-1.5"
          >
            {isLoading ? (
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                {hasError ? <RefreshCw className="h-3.5 w-3.5" /> : <Navigation className="h-3.5 w-3.5" />}
                {hasError ? "Réessayer" : "Activer"}
              </>
            )}
          </Button>
        )}
        {isGranted && (
          <Button
            onClick={handleActivate}
            size="sm"
            variant="outline"
            className="flex-shrink-0 gap-1.5 border-green-300 text-green-700 hover:bg-green-100"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Actualiser
          </Button>
        )}
      </div>

      {/* Message d'erreur + bouton paramètres */}
      {hasError && ERROR_MESSAGES[status] && (
        <div className="rounded-xl bg-red-100 border border-red-200 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700 leading-snug">{ERROR_MESSAGES[status]}</p>
          </div>
          {needsSettings && (
            <button
              onClick={openSettings}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-red-500 text-white text-xs font-semibold"
            >
              <Settings className="h-3.5 w-3.5" />
              Ouvrir les paramètres de localisation
            </button>
          )}
        </div>
      )}

      {/* Info */}
      {!hasError && (
        <p className="text-[10px] text-muted-foreground">
          💡 Votre position est utilisée uniquement pour le dispatch. Elle n'est jamais partagée publiquement.
        </p>
      )}
    </div>
  );
}