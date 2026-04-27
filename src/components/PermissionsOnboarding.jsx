/**
 * CDL — Écran autorisations au premier lancement
 * GPS + Notifications + Caméra/Galerie
 * Affiché une seule fois, mémorisé en localStorage
 */
import { useState } from "react";
import { MapPin, Bell, Camera, CheckCircle2, AlertTriangle, Settings, ChevronRight } from "lucide-react";
import { base44 } from "@/api/base44Client";

const STORAGE_KEY = "cdl_permissions_configured";

export function needsPermissionsOnboarding() {
  try {
    return !localStorage.getItem(STORAGE_KEY);
  } catch (_) {
    return false;
  }
}

export function markPermissionsConfigured() {
  try { localStorage.setItem(STORAGE_KEY, "1"); } catch (_) {}
}

const PERM_ITEMS = [
  {
    id: "gps",
    icon: MapPin,
    color: "text-blue-600 bg-blue-100",
    title: "Localisation GPS",
    desc: "Pour vous trouver les livreurs les plus proches et suivre vos livraisons en temps réel.",
    required: true,
  },
  {
    id: "notif",
    icon: Bell,
    color: "text-amber-600 bg-amber-100",
    title: "Notifications",
    desc: "Pour vous alerter quand votre livreur arrive, ou quand une course vous est proposée.",
    required: true,
  },
  {
    id: "camera",
    icon: Camera,
    color: "text-emerald-600 bg-emerald-100",
    title: "Caméra & Galerie",
    desc: "Pour envoyer vos documents livreur et les preuves de paiement Bedou.",
    required: false,
  },
];

export default function PermissionsOnboarding({ onDone }) {
  const [step, setStep] = useState("intro"); // intro | requesting | results
  const [results, setResults] = useState({});
  const [requesting, setRequesting] = useState(false);

  const requestAll = async () => {
    setRequesting(true);
    setStep("requesting");
    const res = {};

    // 1. GPS
    try {
      const gpsResult = await new Promise((resolve) => {
        if (!navigator.geolocation) { resolve("denied"); return; }
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            base44.auth.updateMe({ gps_latitude: pos.coords.latitude, gps_longitude: pos.coords.longitude, gps_enabled: true }).catch(() => {});
            resolve("granted");
          },
          () => resolve("denied"),
          { enableHighAccuracy: true, timeout: 8000 }
        );
      });
      res.gps = gpsResult;
    } catch (_) { res.gps = "denied"; }

    // 2. Notifications
    try {
      if (!("Notification" in window)) {
        res.notif = "unavailable";
      } else if (Notification.permission === "granted") {
        res.notif = "granted";
      } else {
        const perm = await Notification.requestPermission();
        res.notif = perm;
      }
    } catch (_) { res.notif = "denied"; }

    // 3. Caméra (test silencieux)
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(t => t.stop());
        res.camera = "granted";
      } else {
        res.camera = "unavailable";
      }
    } catch (_) { res.camera = "denied"; }

    setResults(res);
    setRequesting(false);
    setStep("results");
  };

  const openSettings = () => {
    // APK Capacitor — ouvrir paramètres app
    const isNative = window?.Capacitor?.isNativePlatform?.() === true;
    if (isNative) {
      import("@capacitor/core").then(({ Capacitor }) => {
        // Ouvrir paramètres Android
        window.cordova?.plugins?.diagnostic?.switchToAppSettings?.(() => {}, () => {});
      }).catch(() => {
        alert("Ouvrez les paramètres de votre téléphone → Applications → CDL → Autorisations");
      });
    } else {
      alert("Ouvrez les paramètres de votre navigateur pour activer les autorisations CDL.");
    }
  };

  const handleDone = () => {
    markPermissionsConfigured();
    onDone?.();
  };

  const allGranted = results.gps === "granted" && (results.notif === "granted" || results.notif === "unavailable");
  const anyDenied = results.gps === "denied" || results.notif === "denied";

  // ── INTRO ──
  if (step === "intro") {
    return (
      <div className="fixed inset-0 z-[300] flex flex-col bg-gradient-to-br from-[#0F2A5C] to-[#1E6BFF] text-white">
        {/* Logo */}
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

          <div className="mt-10 space-y-3 w-full max-w-xs text-left">
            {PERM_ITEMS.map(item => {
              const Icon = item.icon;
              return (
                <div key={item.id} className="flex items-start gap-3 bg-white/10 rounded-2xl p-4 border border-white/15">
                  <div className={`h-9 w-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0`}>
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold">{item.title} {item.required ? <span className="text-amber-300 text-[10px]">• Requis</span> : <span className="text-white/50 text-[10px]">• Optionnel</span>}</p>
                    <p className="text-xs text-white/60 mt-0.5 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 pb-10 space-y-3">
          <button
            onClick={requestAll}
            className="w-full h-14 rounded-2xl bg-white text-primary font-extrabold text-base shadow-lg active:scale-[0.97] transition-all flex items-center justify-center gap-2"
          >
            Activer GPS et notifications <ChevronRight className="h-5 w-5" />
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
        <p className="text-white/60 text-sm mt-2 text-center">Veuillez accepter les autorisations demandées par votre appareil.</p>
      </div>
    );
  }

  // ── RESULTS ──
  return (
    <div className="fixed inset-0 z-[300] flex flex-col bg-background">
      <div className="bg-gradient-to-br from-[#0F2A5C] to-[#1E6BFF] px-6 pt-12 pb-8 text-white text-center">
        <div className={`h-16 w-16 rounded-full mx-auto flex items-center justify-center mb-3 ${allGranted ? "bg-emerald-400" : "bg-amber-400"}`}>
          {allGranted ? <CheckCircle2 className="h-9 w-9 text-white" /> : <AlertTriangle className="h-9 w-9 text-white" />}
        </div>
        <h2 className="text-xl font-extrabold">{allGranted ? "Tout est prêt !" : "Autorisations partielles"}</h2>
        <p className="text-white/70 text-sm mt-1">{allGranted ? "CDL est configuré pour fonctionner parfaitement." : "Certaines fonctions seront limitées."}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {PERM_ITEMS.map(item => {
          const Icon = item.icon;
          const status = results[item.id];
          const granted = status === "granted" || status === "unavailable";
          return (
            <div key={item.id} className="flex items-center gap-4 p-4 rounded-2xl bg-white border border-border shadow-sm">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${item.color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground">{item.title}</p>
                <p className={`text-xs mt-0.5 ${granted ? "text-emerald-600" : "text-red-500"}`}>
                  {granted ? "✓ Autorisé" : "✗ Refusé"}
                </p>
              </div>
              {!granted && (
                <button onClick={openSettings} className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold text-primary border border-primary/30 px-3 py-1.5 rounded-xl">
                  <Settings className="h-3 w-3" /> Paramètres
                </button>
              )}
            </div>
          );
        })}

        {anyDenied && (
          <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4">
            <p className="text-sm font-semibold text-amber-800">⚠️ Certaines autorisations sont refusées</p>
            <p className="text-xs text-amber-700 mt-1">Pour activer GPS ou notifications : ouvrez les paramètres de votre téléphone → Applications → CDL → Autorisations.</p>
            <button onClick={openSettings} className="mt-2 flex items-center gap-1.5 text-xs font-bold text-amber-800 underline">
              <Settings className="h-3 w-3" /> Ouvrir les paramètres de l'application
            </button>
          </div>
        )}
      </div>

      <div className="px-4 pb-8 space-y-2">
        {anyDenied && (
          <button onClick={requestAll} className="w-full h-12 rounded-2xl border-2 border-primary text-primary font-bold text-sm active:scale-95 transition-all">
            Réessayer les autorisations
          </button>
        )}
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