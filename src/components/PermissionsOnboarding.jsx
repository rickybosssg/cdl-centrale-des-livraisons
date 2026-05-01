/**
 * CDL — Écran autorisations au premier lancement
 * VERSION ANTI-CRASH APK : toutes les APIs système sont wrappées try/catch
 * Le flux ne bloque jamais l'app, même si une permission crashe.
 */
import { useState } from "react";
import { MapPin, Bell, Camera, CheckCircle2, AlertTriangle, Settings, ChevronRight } from "lucide-react";
import { base44 } from "@/api/base44Client";

const STORAGE_KEY = "cdl_permissions_configured";

export function needsPermissionsOnboarding() {
  try { return !localStorage.getItem(STORAGE_KEY); } catch (_) { return false; }
}

export function markPermissionsConfigured() {
  try { localStorage.setItem(STORAGE_KEY, "1"); } catch (_) {}
}

/** Détecte APK Capacitor natif Android */
function isNativeAndroid() {
  try {
    if (window.location?.protocol === 'capacitor:') return true;
    if (window.location?.protocol === 'file:') return true;
    if (window.Capacitor?.getPlatform?.() === 'android') return true;
  } catch (_) {}
  return false;
}

/** Demande GPS — safe, ne crashe pas */
async function requestGps() {
  try {
    if (!navigator.geolocation) return "unavailable";
    return await new Promise((resolve) => {
      const timer = setTimeout(() => resolve("unavailable"), 10000);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(timer);
          try {
            base44.auth.updateMe({
              gps_latitude: pos.coords.latitude,
              gps_longitude: pos.coords.longitude,
              gps_enabled: true,
            }).catch(() => {});
          } catch (_) {}
          resolve("granted");
        },
        () => { clearTimeout(timer); resolve("denied"); },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
      );
    });
  } catch (_) {
    return "unavailable";
  }
}

/** Demande notifications — safe, ne crashe pas */
async function requestNotifications() {
  try {
    // Sur APK Android natif : window.Notification n'existe pas
    // Les notifs push sont gérées par FcmBootstrap séparément
    if (typeof Notification === "undefined") {
      console.log('[NOTIF] API Notification absente (APK natif) → unavailable');
      return "unavailable";
    }
    if (Notification.permission === "granted") return "granted";
    if (Notification.permission === "denied") return "denied";
    console.log('[NOTIF] request permission start');
    const perm = await Notification.requestPermission();
    console.log('[NOTIF] permission result:', perm);
    return perm;
  } catch (e) {
    console.log('[NOTIF] permission error (non-bloquant):', e?.message);
    return "unavailable";
  }
}

/** Demande caméra — safe, ne crashe pas */
async function requestCamera() {
  try {
    if (!navigator.mediaDevices?.getUserMedia) return "unavailable";
    // Sur APK, getUserMedia peut être instable — timeout court
    const stream = await Promise.race([
      navigator.mediaDevices.getUserMedia({ video: true, audio: false }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
    ]);
    try { stream.getTracks().forEach(t => t.stop()); } catch (_) {}
    return "granted";
  } catch (e) {
    if (e?.name === "NotAllowedError") return "denied";
    return "unavailable";
  }
}

export default function PermissionsOnboarding({ onDone }) {
  const [step, setStep] = useState("intro"); // intro | requesting | results
  const [results, setResults] = useState({});

  const requestAll = async () => {
    setStep("requesting");
    const res = {};

    // GPS en premier
    res.gps = await requestGps();
    console.log('[APP] GPS result:', res.gps);

    // Notifications (web seulement — APK = unavailable, FCM gère séparément)
    res.notif = await requestNotifications();
    console.log('[APP] Notif result:', res.notif);

    // Caméra en dernier (optionnel, ne crashe pas)
    res.camera = await requestCamera();
    console.log('[APP] Camera result:', res.camera);

    console.log('[APP] continue after permission');
    setResults(res);
    setStep("results");
  };

  const handleDone = () => {
    markPermissionsConfigured();
    try { onDone?.(); } catch (_) {}
  };

  const notifOk = results.notif === "granted" || results.notif === "unavailable";
  const gpsOk = results.gps === "granted" || results.gps === "unavailable";
  const allGranted = gpsOk && notifOk;
  const anyDenied = results.gps === "denied" || results.notif === "denied";

  // ── INTRO ──
  if (step === "intro") {
    return (
      <div className="fixed inset-0 z-[300] flex flex-col bg-gradient-to-br from-[#0F2A5C] to-[#1E6BFF] text-white">
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center pt-12">
          <div className="h-20 w-20 rounded-3xl bg-white/20 flex items-center justify-center mb-6 border border-white/30 overflow-hidden">
            <img
              src="https://media.base44.com/images/public/69c3c74fc4b62396dca61751/1eb51398f_Screenshot_20260330_132434_WhatsApp.jpg"
              alt="CDL"
              className="w-full h-full object-cover rounded-3xl"
              onError={e => { e.target.style.display = 'none'; }}
            />
          </div>
          <h1 className="text-3xl font-extrabold">Bienvenue sur CDL</h1>
          <p className="text-white/70 mt-2 text-base">Centrale des Livraisons</p>

          <div className="mt-8 space-y-3 w-full max-w-xs text-left">
            {[
              { id: "gps", icon: MapPin, title: "Localisation GPS", desc: "Pour trouver les livreurs proches.", required: true },
              { id: "notif", icon: Bell, title: "Notifications", desc: "Pour les alertes de livraison.", required: true },
              { id: "camera", icon: Camera, title: "Caméra & Galerie", desc: "Pour les documents et preuves.", required: false },
            ].map(item => {
              const Icon = item.icon;
              return (
                <div key={item.id} className="flex items-start gap-3 bg-white/10 rounded-2xl p-4 border border-white/15">
                  <div className="h-9 w-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold">
                      {item.title}{" "}
                      {item.required
                        ? <span className="text-amber-300 text-[10px]">• Requis</span>
                        : <span className="text-white/50 text-[10px]">• Optionnel</span>}
                    </p>
                    <p className="text-xs text-white/60 mt-0.5 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-6 pb-10 space-y-3">
          <button
            onClick={requestAll}
            className="w-full h-14 rounded-2xl bg-white text-primary font-extrabold text-base shadow-lg active:scale-[0.97] transition-all flex items-center justify-center gap-2"
          >
            Autoriser et continuer <ChevronRight className="h-5 w-5" />
          </button>
          <button
            onClick={handleDone}
            className="w-full py-3 text-white/50 text-sm font-medium"
          >
            Ignorer pour l'instant
          </button>
        </div>
      </div>
    );
  }

  // ── REQUESTING ──
  if (step === "requesting") {
    return (
      <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-gradient-to-br from-[#0F2A5C] to-[#1E6BFF] text-white px-6">
        <div className="h-16 w-16 border-4 border-white/30 border-t-white rounded-full animate-spin mb-6" />
        <p className="text-xl font-extrabold">Demande en cours…</p>
        <p className="text-white/60 text-sm mt-2 text-center">Veuillez accepter les autorisations demandées.</p>
      </div>
    );
  }

  // ── RESULTS ──
  return (
    <div className="fixed inset-0 z-[300] flex flex-col bg-background">
      <div className="bg-gradient-to-br from-[#0F2A5C] to-[#1E6BFF] px-6 pt-12 pb-8 text-white text-center">
        <div className={`h-16 w-16 rounded-full mx-auto flex items-center justify-center mb-3 ${allGranted ? "bg-emerald-400" : "bg-amber-400"}`}>
          {allGranted
            ? <CheckCircle2 className="h-9 w-9 text-white" />
            : <AlertTriangle className="h-9 w-9 text-white" />}
        </div>
        <h2 className="text-xl font-extrabold">{allGranted ? "Tout est prêt !" : "Configuration partielle"}</h2>
        <p className="text-white/70 text-sm mt-1">
          {allGranted ? "CDL est prêt à fonctionner." : "Vous pouvez continuer, certaines fonctions seront limitées."}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {[
          { id: "gps", title: "Localisation GPS", icon: MapPin, color: "text-blue-600 bg-blue-100" },
          { id: "notif", title: "Notifications", icon: Bell, color: "text-amber-600 bg-amber-100" },
          { id: "camera", title: "Caméra & Galerie", icon: Camera, color: "text-emerald-600 bg-emerald-100" },
        ].map(item => {
          const Icon = item.icon;
          const status = results[item.id];
          const ok = status === "granted" || status === "unavailable";
          return (
            <div key={item.id} className="flex items-center gap-4 p-4 rounded-2xl bg-white border border-border shadow-sm">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${item.color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-foreground">{item.title}</p>
                <p className={`text-xs mt-0.5 ${ok ? "text-emerald-600" : "text-orange-500"}`}>
                  {ok ? "✓ Autorisé" : "✗ Non autorisé — modifiable dans les paramètres"}
                </p>
              </div>
              {!ok && (
                <button
                  onClick={() => {
                    try { alert("Paramètres → Applications → CDL → Autorisations"); } catch (_) {}
                  }}
                  className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold border px-3 py-1.5 rounded-xl text-primary border-primary/30"
                >
                  <Settings className="h-3 w-3" /> Paramètres
                </button>
              )}
            </div>
          );
        })}

        {anyDenied && (
          <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4">
            <p className="text-sm font-semibold text-amber-800">⚠️ Autorisations non accordées</p>
            <p className="text-xs text-amber-700 mt-1">
              Vous pouvez les activer plus tard dans : Paramètres → Applications → CDL → Autorisations.
            </p>
          </div>
        )}
      </div>

      <div className="px-4 pb-8 space-y-2">
        <button
          onClick={handleDone}
          className="w-full h-14 rounded-2xl bg-primary text-white font-extrabold text-base shadow-md active:scale-[0.97] transition-all"
        >
          {allGranted ? "Commencer" : "Continuer quand même"}
        </button>
      </div>
    </div>
  );
}