/**
 * Configuration Firebase centralisée
 * Chargée depuis le backend via getFirebaseConfig pour éviter les doublons
 */

let cachedConfig = null;

export async function getFirebaseConfig() {
  if (cachedConfig) return cachedConfig;

  try {
    const { base44 } = await import('@/api/base44Client');
    const res = await base44.functions.invoke('getFirebaseConfig', {});
    
    if (res.data?.success && res.data.config) {
      cachedConfig = res.data.config;
      
      // Log la config (sans exposer les secrets complètement)
      console.log('[firebaseConfig] Loaded:', {
        apiKey: res.data.config.apiKey ? res.data.config.apiKey.substring(0, 8) + '...' : 'MISSING',
        messagingSenderId: res.data.config.messagingSenderId ? res.data.config.messagingSenderId.substring(0, 8) + '...' : 'MISSING',
        appId: res.data.config.appId ? res.data.config.appId.substring(0, 8) + '...' : 'MISSING',
        vapidKey: res.data.config.vapidKey ? res.data.config.vapidKey.substring(0, 8) + '...' : 'MISSING',
        complete: res.data.complete,
        missing: res.data.missing,
      });
      
      return cachedConfig;
    }
  } catch (err) {
    console.error('[firebaseConfig] Error loading config:', err.message);
  }

  return null;
}