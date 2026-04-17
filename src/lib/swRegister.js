/**
 * Enregistrement du Service Worker Firebase pour les push notifications
 */

export async function registerSW() {
  try {
    if (!('serviceWorker' in navigator)) {
      console.log('[swRegister] ⚠️ Service Worker non supporté');
      return null;
    }

    console.log('[swRegister] ⏳ Enregistrement SW Firebase...');

    // Enregistrer le SW Firebase (ne pas unregister les anciens — Firebase en a besoin)
    let reg = null;
    const regs = await navigator.serviceWorker.getRegistrations();
    reg = regs.find(r => r.active?.scriptURL?.includes('firebase-messaging-sw'));

    if (!reg) {
      reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
      console.log('[swRegister] ✅ SW Firebase enregistré:', reg.scope);
    } else {
      console.log('[swRegister] ✅ SW Firebase déjà actif:', reg.scope);
    }

    // Envoyer la config Firebase au SW (il n'a pas accès à import.meta.env)
    await navigator.serviceWorker.ready;
    const activeWorker = reg.active || reg.installing || reg.waiting;
    if (activeWorker) {
      const { firebaseConfig } = await import('@/lib/firebaseConfig');
      activeWorker.postMessage({ type: 'FIREBASE_CONFIG', config: firebaseConfig });
      console.log('[swRegister] ✅ Config Firebase envoyée au SW');
    }

    return reg;
  } catch (err) {
    console.error('[swRegister] ❌ Erreur:', err.message);
    return null;
  }
}