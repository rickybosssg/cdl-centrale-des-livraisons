// Utilitaire de retour haptique (vibration)
function safeVibrate(pattern) {
  try { if (navigator?.vibrate) navigator.vibrate(pattern); } catch (_) {}
}

export function vibrateLight() { safeVibrate(30); }
export function vibrateMedium() { safeVibrate([40, 20, 40]); }
export function vibrateSuccess() { safeVibrate([20, 10, 60]); }
export function vibrateError() { safeVibrate([80, 30, 80]); }
export function vibrateNotif() { safeVibrate([50, 30, 50, 30, 80]); }

function isNativePlatform() {
  try {
    const proto = window.location?.protocol;
    return proto === 'capacitor:' || proto === 'file:' ||
      (typeof window.Capacitor !== 'undefined' && window.Capacitor?.isNativePlatform?.() === true);
  } catch (_) { return false; }
}

function playTones(notes) {
  // notes = [{freq, start, dur}]
  try {
    if (isNativePlatform()) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    let lastEnd = 0;
    notes.forEach(({ freq, start, dur }) => {
      const osc = ctx.createOscillator();
      osc.connect(gain);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur);
      lastEnd = Math.max(lastEnd, start + dur);
    });
    setTimeout(() => { try { ctx.close(); } catch (_) {} }, (lastEnd + 0.2) * 1000);
  } catch (_) {}
}

/** Son léger — info/normal */
export function playNotificationSound() {
  if (isNativePlatform()) return;
  playTones([
    { freq: 880, start: 0,    dur: 0.12 },
    { freq: 660, start: 0.18, dur: 0.10 },
  ]);
}

/** Son fort — critique (nouvelle course, recharge, profil) */
export function playNotificationSoundCritical() {
  if (isNativePlatform()) return;
  playTones([
    { freq: 1200, start: 0,    dur: 0.10 },
    { freq: 900,  start: 0.13, dur: 0.10 },
    { freq: 1200, start: 0.28, dur: 0.15 },
  ]);
}

/** Vibration forte pour critique */
export function vibrateCritical() { safeVibrate([100, 50, 100, 50, 200]); }