import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Retourne la configuration Firebase complète depuis les secrets du backend.
 * Le frontend l'utilise pour initialiser Firebase et passer les params au SW.
 */
Deno.serve(async (req) => {
  try {
    const apiKey = Deno.env.get('VITE_FIREBASE_API_KEY') || '';
    const authDomain = Deno.env.get('VITE_FIREBASE_AUTH_DOMAIN') || 'cdl-app-4743c.firebaseapp.com';
    const projectId = Deno.env.get('VITE_FIREBASE_PROJECT_ID') || 'cdl-app-4743c';
    const storageBucket = Deno.env.get('VITE_FIREBASE_STORAGE_BUCKET') || 'cdl-app-4743c.appspot.com';
    const messagingSenderId = Deno.env.get('VITE_FIREBASE_MESSAGING_SENDER_ID') || '';
    const appId = Deno.env.get('VITE_FIREBASE_APP_ID') || '';
    const vapidKey = Deno.env.get('VITE_FIREBASE_VAPID_KEY') || '';

    const config = {
      apiKey,
      authDomain,
      projectId,
      storageBucket,
      messagingSenderId,
      appId,
      vapidKey,
    };

    // Vérifier la complétude
    const missing = [];
    if (!config.apiKey) missing.push('VITE_FIREBASE_API_KEY');
    if (!config.messagingSenderId) missing.push('VITE_FIREBASE_MESSAGING_SENDER_ID');
    if (!config.appId) missing.push('VITE_FIREBASE_APP_ID');
    if (!config.vapidKey) missing.push('VITE_FIREBASE_VAPID_KEY');

    // Log détaillé pour débogage
    console.log('[getFirebaseConfig] Config brute de Deno.env:', {
      apiKey: apiKey ? apiKey.substring(0, 8) + '...' : '❌ EMPTY',
      messagingSenderId: messagingSenderId ? messagingSenderId.substring(0, 8) + '...' : '❌ EMPTY',
      appId: appId ? appId.substring(0, 8) + '...' : '❌ EMPTY',
      vapidKey: vapidKey ? vapidKey.substring(0, 8) + '...' : '❌ EMPTY',
    });

    return Response.json({
      success: true,
      config,
      complete: missing.length === 0,
      missing,
    });
  } catch (error) {
    console.error('[getFirebaseConfig] Error:', error.message);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});