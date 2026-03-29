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
    if (ctx.state === 'suspended') ctx.resume();
    
    // 2 beeps : bip haut puis bas
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    
    // Premier beep (haut)
    const osc1 = ctx.createOscillator();
    osc1.connect(gain);
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(1000, ctx.currentTime);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.15);
    
    // Deuxième beep (bas)
    const osc2 = ctx.createOscillator();
    osc2.connect(gain);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(700, ctx.currentTime + 0.2);
    osc2.start(ctx.currentTime + 0.2);
    osc2.stop(ctx.currentTime + 0.35);
  } catch (_) {}
}