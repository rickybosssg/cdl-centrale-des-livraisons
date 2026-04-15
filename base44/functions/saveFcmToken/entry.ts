import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * saveFcmToken — Enregistrer le token FCM natif en BDD
 * Appelée par AppLayoutWrapper quand le token est reçu
 */
Deno.serve(async (req) => {
  try {
    console.log('[saveFcmToken] 🔴 Request reçue');
    
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    console.log('[saveFcmToken] User:', user?.email, '| role:', user?.role);

    if (!user) {
      console.error('[saveFcmToken] ❌ User unauthorized');
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { token } = await req.json();
    
    console.log('[saveFcmToken] 🟡 Token reçu:');
    console.log('   - Longueur:', token?.length);
    console.log('   - Début (25 chars):', token?.substring(0, 25) + '...');
    
    if (!token) {
      console.error('[saveFcmToken] ❌ Token vide');
      return Response.json({ error: 'Token requis' }, { status: 400 });
    }

    // Créer le nouveau token (pas de nettoyage ancien, juste ajouter)
    console.log('[saveFcmToken] 🟢 Création nouveau FcmToken record...');
    const result = await base44.entities.FcmToken.create({
      user_email: user.email,
      token,
      device_type: 'android_native',
      registered_at: new Date().toISOString(),
    });

    console.log('[saveFcmToken] ✅ TOKEN ENREGISTRÉ AVEC SUCCÈS:');
    console.log('   - token_id:', result.id);
    console.log('   - user_email:', user.email);
    console.log('   - user_role:', user.role);
    console.log('   - device:', 'android_native');
    
    return Response.json({
      success: true,
      token_id: result.id,
      message: `Token FCM enregistré pour ${user.email}`,
    });
  } catch (error) {
    console.error('[saveFcmToken] ❌ ERREUR CRITIQUE:');
    console.error('   - message:', error.message);
    console.error('   - stack:', error.stack);
    return Response.json({
      error: error.message,
      debug: {
        message: error.message,
        type: error.constructor.name,
      }
    }, { status: 500 });
  }
});