/**
 * keyboardFeedback.js — Couche UX clavier premium CDL
 *
 * Fournit : vibration légère + son discret + effet visuel sur saisie.
 * Entièrement opt-out via localStorage 'cdl_keyboard_fx'.
 * Ne touche à AUCUNE logique métier (Bedou, FCM, auth, dispatch...).
 */

// ── Préférences utilisateur ───────────────────────────────────────────────────
const PREF_KEY = 'cdl_keyboard_fx';

export function isKeyboardFxEnabled() {
  try { return localStorage.getItem(PREF_KEY) !== 'off'; } catch (_) { return true; }
}
export function setKeyboardFxEnabled(enabled) {
  try { localStorage.setItem(PREF_KEY, enabled ? 'on' : 'off'); } catch (_) {}
}

// ── Vibration courte (5–8 ms, APK uniquement) ────────────────────────────────
function isNative() {
  try {
    const p = window.location?.protocol;
    return p === 'capacitor:' || p === 'file:' ||
      (typeof window.Capacitor !== 'undefined' && window.Capacitor?.isNativePlatform?.() === true);
  } catch (_) { return false; }
}

export function vibrateKey() {
  if (!isNative()) return;
  try { navigator?.vibrate?.(6); } catch (_) {}
}

// ── Son clavier très discret (web uniquement, unique AudioContext partagé) ────
let _audioCtx = null;
let _lastKeySound = 0;
const KEY_SOUND_THROTTLE_MS = 40; // max 25 sons/sec — évite saturation

function getAudioCtx() {
  if (_audioCtx && _audioCtx.state !== 'closed') return _audioCtx;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    _audioCtx = new Ctx();
    return _audioCtx;
  } catch (_) { return null; }
}

export function playKeySound() {
  if (isNative()) return; // Sur APK : vibration suffit, pas de son web
  const now = Date.now();
  if (now - _lastKeySound < KEY_SOUND_THROTTLE_MS) return;
  _lastKeySound = now;
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.04, ctx.currentTime); // très discret vol 4%
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.06);
  } catch (_) {}
}

// ── Effet visuel scale (appliqué sur l'élément cible) ────────────────────────
// Applique un scale 1.012 pendant 80ms via style inline — aucun impact DOM.
let _animFrame = null;

export function animateKeyPress(el) {
  if (!el) return;
  // Annuler l'animation précédente si toujours en cours
  if (_animFrame) { cancelAnimationFrame(_animFrame); _animFrame = null; }
  el.style.transition = 'transform 40ms ease-out';
  el.style.transform = 'scale(1.012)';
  _animFrame = requestAnimationFrame(() => {
    setTimeout(() => {
      if (el) {
        el.style.transform = 'scale(1)';
        // Nettoyer après la transition
        setTimeout(() => {
          if (el) el.style.transition = '';
        }, 80);
      }
      _animFrame = null;
    }, 80);
  });
}

// ── Trigger combiné — à appeler sur chaque frappe ────────────────────────────
export function triggerKeyFeedback(el) {
  if (!isKeyboardFxEnabled()) return;
  vibrateKey();
  playKeySound();
  animateKeyPress(el);
}