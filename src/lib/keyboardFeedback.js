/**
 * keyboardFeedback.js — Couche UX clavier CDL
 *
 * Trois effets indépendants :
 *   - Vibration (APK uniquement, courte 6ms)
 *   - Son discret (oscillateur Web Audio — contrôlé séparément)
 *   - Animation visuelle scale(1.012)
 *
 * Deux préférences localStorage indépendantes :
 *   cdl_keyboard_fx      → active vibration + animation (défaut: on)
 *   cdl_keyboard_sound   → active uniquement le son CDL (défaut: off sur APK, on sur web)
 *
 * Ne touche à AUCUNE logique métier (Bedou, FCM, auth, dispatch, notifications).
 */

// ── Détection plateforme ──────────────────────────────────────────────────────
export function isNativeApp() {
  try {
    const p = window.location?.protocol;
    return (
      p === 'capacitor:' ||
      p === 'file:' ||
      (typeof window.Capacitor !== 'undefined' && window.Capacitor?.isNativePlatform?.() === true)
    );
  } catch (_) { return false; }
}

// ── Préférence effets globaux (vibration + animation) ────────────────────────
const PREF_FX_KEY = 'cdl_keyboard_fx';

export function isKeyboardFxEnabled() {
  try { return localStorage.getItem(PREF_FX_KEY) !== 'off'; } catch (_) { return true; }
}
export function setKeyboardFxEnabled(enabled) {
  try { localStorage.setItem(PREF_FX_KEY, enabled ? 'on' : 'off'); } catch (_) {}
}

// ── Préférence son clavier CDL (indépendante) ─────────────────────────────────
// Sur APK : désactivé par défaut pour ne pas doubler le son système Android
// Sur web  : activé par défaut (seul son disponible car pas de son système)
const PREF_SOUND_KEY = 'cdl_keyboard_sound';

export function isKeyboardSoundEnabled() {
  try {
    const stored = localStorage.getItem(PREF_SOUND_KEY);
    if (stored !== null) return stored === 'on';
    // Défaut selon la plateforme
    return !isNativeApp(); // web=on, APK=off
  } catch (_) { return false; }
}
export function setKeyboardSoundEnabled(enabled) {
  try { localStorage.setItem(PREF_SOUND_KEY, enabled ? 'on' : 'off'); } catch (_) {}
}

// ── Vibration courte (APK uniquement) ────────────────────────────────────────
export function vibrateKey() {
  if (!isNativeApp()) return;
  try { navigator?.vibrate?.(6); } catch (_) {}
}

// ── Son clavier (web + APK si activé) ─────────────────────────────────────────
// Même synthèse sur les deux plateformes pour cohérence sonore.
let _audioCtx = null;
let _lastKeySound = 0;
const KEY_SOUND_THROTTLE_MS = 40; // max 25 sons/sec

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
  if (!isKeyboardSoundEnabled()) return;
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
    gain.gain.setValueAtTime(0.04, ctx.currentTime); // vol 4% — très discret
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.06);
  } catch (_) {}
}

// ── Effet visuel scale ────────────────────────────────────────────────────────
let _animFrame = null;

export function animateKeyPress(el) {
  if (!el) return;
  if (_animFrame) { cancelAnimationFrame(_animFrame); _animFrame = null; }
  el.style.transition = 'transform 40ms ease-out';
  el.style.transform = 'scale(1.012)';
  _animFrame = requestAnimationFrame(() => {
    setTimeout(() => {
      if (el) {
        el.style.transform = 'scale(1)';
        setTimeout(() => { if (el) el.style.transition = ''; }, 80);
      }
      _animFrame = null;
    }, 80);
  });
}

// ── Trigger combiné ───────────────────────────────────────────────────────────
export function triggerKeyFeedback(el) {
  if (isKeyboardFxEnabled()) {
    vibrateKey();
    animateKeyPress(el);
  }
  // Son géré indépendamment (sa propre préférence)
  playKeySound();
}