// Utilitaire de retour haptique (vibration)
export function vibrateLight() {
  if (navigator.vibrate) navigator.vibrate(30);
}

export function vibrateMedium() {
  if (navigator.vibrate) navigator.vibrate([40, 20, 40]);
}

export function vibrateSuccess() {
  if (navigator.vibrate) navigator.vibrate([20, 10, 60]);
}

export function vibrateError() {
  if (navigator.vibrate) navigator.vibrate([80, 30, 80]);
}

export function vibrateNotif() {
  if (navigator.vibrate) navigator.vibrate([50, 30, 50, 30, 80]);
}

export function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
  } catch (_) {}
}