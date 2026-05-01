// Utilitaire de retour haptique (vibration)
function safeVibrate(pattern) {
  try { if (navigator?.vibrate) navigator.vibrate(pattern); } catch (_) {}
}

export function vibrateLight() { safeVibrate(30); }
export function vibrateMedium() { safeVibrate([40, 20, 40]); }
export function vibrateSuccess() { safeVibrate([20, 10, 60]); }
export function vibrateError() { safeVibrate([80, 30, 80]); }
export function vibrateNotif() { safeVibrate([50, 30, 50, 30, 80]); }

export function playNotificationSound() {
  // Sur APK natif Capacitor (capacitor: ou file:), AudioContext peut crasher
  // la WebView Android → on désactive complètement le son sur natif
  try {
    const proto = window.location?.protocol;
    const isNative = proto === 'capacitor:' || proto === 'file:' ||
      (typeof window.Capacitor !== 'undefined' && window.Capacitor?.isNativePlatform?.() === true);
    if (isNative) return; // Vibration suffit sur APK — pas de son synthétique
  } catch (_) { return; }

  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') ctx.resume();

    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);

    const osc1 = ctx.createOscillator();
    osc1.connect(gain);
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(1000, ctx.currentTime);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.15);

    const osc2 = ctx.createOscillator();
    osc2.connect(gain);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(700, ctx.currentTime + 0.2);
    osc2.start(ctx.currentTime + 0.2);
    osc2.stop(ctx.currentTime + 0.35);

    // Fermer le contexte après usage pour libérer les ressources
    osc2.onended = () => { try { ctx.close(); } catch (_) {} };
  } catch (_) {}
}