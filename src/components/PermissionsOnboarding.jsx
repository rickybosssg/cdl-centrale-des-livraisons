/**
 * CDL — Écran autorisations au premier lancement
 * VERSION DÉFINITIVE ANTI-CRASH APK
 *
 * RÈGLES ABSOLUES :
 * 1. Timeout global 6s → continuer quoi qu'il arrive
 * 2. Sur APK Android : NE PAS appeler navigator.geolocation (crash WebView)
 * 3. Sur APK Android : NE PAS appeler Notification.requestPermission (API absente)
 * 4. NE PAS appeler PushNotifications.register() ici → c'est le rôle de FcmBootstrap
 * 5. setStep("results") TOUJOURS atteint dans le finally
 */
import { useState, useRef } from "react";
import { MapPin, Bell, Camera, CheckCircle2, ChevronRight } from "lucide-react";

const STORAGE_KEY = "cdl_permissions_configured";

export function needsPermissionsOnboarding() {
  try { return !localStorage.getItem(STORAGE_KEY); } catch (_) { return false; }
}

export function markPermissionsConfigured() {
  try { localStorage.setItem(STORAGE_KEY, "1"); } catch (_) {}
}

/** Détecte APK Capacitor natif — méthode unifiée */
function isNativeAndroid() {
  try {
    if (window.location?.protocol === 'capacitor:') return true;
    if (window.location?.protocol === 'file:') return true;
    if (window.Capacitor?.getPlatform?.() === 'android') return true;
  } catch (_) {}
  return false;
}

/** Demande permission notification Android via Capacitor PushNotifications (sans register) */
async function requestAndroidNotifPermission() {
  console.log('[PERMISSIONS] notification request start (Android native)');
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const check = await PushNotifications.checkPermissions();
    console.log('[PERMISSIONS] checkPermissions result:', check.receive);
    if (check.receive === 'granted') return 'granted';
    if (check.receive === 'denied') return 'denied';
    // 'prompt' → demander
    const req = await PushNotifications.requestPermissions();
    console.log('[PERMISSIONS] requestPermissions result:', req.receive);
    return req.receive === 'granted' ? 'granted' : 'denied';
  } catch (e) {
    console.log('[PERMISSIONS] Android notif error (non-bloquant):', e?.message);
    return 'unavailable';
  }
}

/** Demande permission notification Web (PWA) */
async function requestWebNotifPermission() {
  console.log('[PERMISSIONS] notification request start (web)');
  try {
    if (typeof Notification === 'undefined') return 'unavailable';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    const perm = await Notification.requestPermission();
    console.log('[PERMISSIONS] notification result:', perm);
    return perm;
  } catch (e) {
    console.log('[PERMISSIONS] web notif error:', e?.message);
    return 'unavailable';
  }
}

/** Demande GPS via web API — uniquement sur web, avec timeout */
async function requestGpsWeb() {
  try {
    if (!navigator.geolocation) return 'unavailable';
    return await Promise.race([
      new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          () => resolve('granted'),
          () => resolve('denied'),
          { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
        );
      }),
      new Promise((resolve) => setTimeout(() => resolve('unavailable'), 6000)),
    ]);
  } catch (_) {
    return 'unavailable';
  }
}

export default function PermissionsOnboarding({ onDone }) {
  const [step, setStep] = useState("intro");
  const [results, setResults] = useState({});
  const doneRef = useRef(false);

  const safeFinish = (res) => {
    if (doneRef.current) return;
    doneRef.current = true;
    console.log('[PERMISSIONS] continue app | results:', JSON.stringify(res));
    setResults(res || {});
    setStep("results");
  };

  const requestAll = async () => {
    console.log('[PERMISSIONS] start');
    setStep("requesting");
    doneRef.current = false;

    const native = isNativeAndroid();
    console.log('[PERMISSIONS] platform native:', native);
    const res = {};

    // ── Timeout global 6s — quoi qu'il arrive, continuer ────────────────────
    const globalTimer = setTimeout(() => {
      console.log('[PERMISSIONS] timeout fallback → continue app');
      safeFinish({ ...res, _timeout: true });
    }, 6000);

    try {
      // GPS
      if (native) {
        // Sur APK : ne pas appeler navigator.geolocation (crash / blocage WebView)
        // Le GPS sera demandé par le plugin quand nécessaire dans l'app
        res.gps = 'unavailable';
        console.log('[PERMISSIONS] GPS skipped on native (will be requested in-app)');
      } else {
        res.gps = await requestGpsWeb();
        console.log('[PERMISSIONS] GPS result:', res.gps);
      }

      // Notifications
      if (native) {
        res.notif = await requestAndroidNotifPermission();
      } else {
        res.notif = await requestWebNotifPermission();
      }
      console.log('[PERMISSIONS] notification result:', res.notif);

      // Caméra : skip sur APK (crash potentiel), ok sur web
      if (native) {
        res.camera = 'unavailable';
      } else {
        try {
          if (navigator.mediaDevices?.getUserMedia) {
            const stream = await Promise.race([
              navigator.mediaDevices.getUserMedia({ video: true }),
              new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 4000)),
            ]);
            try { stream.getTracks().forEach(t => t.stop()); } catch (_) {}
            res.camera = 'granted';
          } else {
            res.camera = 'unavailable';
          }
        } catch (_) {
          res.camera = 'unavailable';
        }
      }

    } catch (e) {
      console.log('[PERMISSIONS] unexpected error (non-bloquant):', e?.message);
    } finally {
      clearTimeout(globalTimer);
      safeFinish(res);
    }
  };

  const handleDone = () => {
    console.log('[PERMISSIONS] user pressed done/skip');
    markPermissionsConfigured();
    try { onDone?.(); } catch (_) {}
  };

  const notifOk = results.notif === 'granted' || results.notif === 'unavailable';
  const gpsOk = results.gps === 'granted' || results.gps === 'unavailable';
  const allOk = gpsOk && notifOk;

  // ── INTRO ──────────────────────────────────────────────────────────────────
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
              { icon: MapPin, title: "Localisation GPS", desc: "Pour trouver les livreurs proches.", required: true },
              { icon: Bell, title: "Notifications", desc: "Pour les alertes de livraison en temps réel.", required: true },
              { icon: Camera, title: "Caméra & Galerie", desc: "Pour vos documents (optionnel).", required: false },
            ].map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} className="flex items-start gap-3 bg-white/10 rounded-2xl p-4 border border-white/15">
                  <div className="h-9 w-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold">
                      {item.title}{" "}
                      <span className={`text-[10px] ${item.required ? "text-amber-300" : "text-white/50"}`}>
                        • {item.required ? "Requis" : "Optionnel"}
                      </span>
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

  // ── REQUESTING ─────────────────────────────────────────────────────────────
  if (step === "requesting") {
    return (
      <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-gradient-to-br from-[#0F2A5C] to-[#1E6BFF] text-white px-6">
        <div className="h-16 w-16 border-4 border-white/30 border-t-white rounded-full animate-spin mb-6" />
        <p className="text-xl font-extrabold">Demande en cours…</p>
        <p className="text-white/60 text-sm mt-2 text-center">
          Acceptez ou refusez les autorisations demandées.
        </p>
        <p className="text-white/30 text-xs mt-4">
          L'application continue automatiquement dans quelques secondes.
        </p>
      </div>
    );
  }

  // ── RESULTS ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[300] flex flex-col bg-background">
      <div className={`px-6 pt-12 pb-8 text-white text-center ${allOk ? "bg-gradient-to-br from-emerald-600 to-emerald-500" : "bg-gradient-to-br from-[#0F2A5C] to-[#1E6BFF]"}`}>
        <div className="h-16 w-16 rounded-full mx-auto flex items-center justify-center mb-3 bg-white/20">
          <CheckCircle2 className="h-9 w-9 text-white" />
        </div>
        <h2 className="text-xl font-extrabold">
          {allOk ? "Parfait, tout est prêt !" : "Configuration enregistrée"}
        </h2>
        <p className="text-white/80 text-sm mt-1">
          {allOk
            ? "CDL est configuré pour fonctionner au mieux."
            : "Vous pouvez modifier les autorisations plus tard dans les paramètres."}
        </p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <p className="text-muted-foreground text-sm">
          Les notifications push seront configurées automatiquement en arrière-plan.
        </p>
      </div>

      <div className="px-4 pb-10">
        <button
          onClick={handleDone}
          className="w-full h-14 rounded-2xl bg-primary text-white font-extrabold text-base shadow-md active:scale-[0.97] transition-all"
        >
          Accéder à CDL →
        </button>
      </div>
    </div>
  );
}