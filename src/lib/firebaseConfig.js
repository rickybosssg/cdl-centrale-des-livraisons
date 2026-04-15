/**
 * Configuration Firebase — Source unique et fiable
 * Chargée une seule fois du backend, cachée en mémoire
 */

let cachedConfig = null;

export async function getFirebaseConfig() {
  if (cachedConfig) {
    console.log('[firebaseConfig] Config retournée du cache');
    return cachedConfig;
  }

  try {
    console.log('[firebaseConfig] ⏳ Chargement du backend...');
    const { base44 } = await import('@/api/base44Client');
    const res = await base44.functions.invoke('getFirebaseConfig', {});

    if (!res.data?.success) {
      console.error('[firebaseConfig] ❌ Erreur backend:', res.data?.error);
      return null;
    }

    if (!res.data.config) {
      console.error('[firebaseConfig] ❌ Pas de config dans la réponse');
      return null;
    }

    // Valider que les 3 champs essentiels sont présents
    const { apiKey, messagingSenderId, appId, vapidKey } = res.data.config;
    if (!apiKey || !messagingSenderId || !appId || !vapidKey) {
      console.error('[firebaseConfig] ❌ Config incomplète:', {
        apiKey: !!apiKey,
        messagingSenderId: !!messagingSenderId,
        appId: !!appId,
        vapidKey: !!vapidKey,
      });
      return null;
    }

    cachedConfig = res.data.config;
    console.log('[firebaseConfig] ✅ Config valide et cachée');
    return cachedConfig;
  } catch (err) {
    console.error('[firebaseConfig] ❌ Erreur:', err.message);
    return null;
  }
}

/**
 * Invalider le cache (pour tests, redéploiement, etc.)
 */
export function clearFirebaseConfigCache() {
  cachedConfig = null;
  console.log('[firebaseConfig] Cache vidé');
}