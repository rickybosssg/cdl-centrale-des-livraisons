/**
 * Enregistrement simple du Service Worker
 */

export async function registerSW() {
  try {
    if (!('serviceWorker' in navigator)) {
      console.log('[swRegister] ⚠️ Service Worker non supporté');
      return null;
    }

    console.log('[swRegister] ⏳ Enregistrement SW...');
    
    // Unregister tous les anciens SW d'abord
    const allRegs = await navigator.serviceWorker.getRegistrations();
    for (const reg of allRegs) {
      console.log('[swRegister] 🗑️ Unregister ancien:', reg.scope);
      await reg.unregister();
    }

    // Enregistrer le nouveau SW minimal
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    console.log('[swRegister] ✅ SW enregistré:', reg.scope);
    
    return reg;
  } catch (err) {
    console.error('[swRegister] ❌ Erreur:', err.message);
    return null;
  }
}