import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * saveFcmToken — Enregistrer le token FCM natif en BDD
 * Appelée par AppLayoutWrapper quand le token est reçu
 */
Deno.serve(async (req) => {
  try {
    console.log('\n[saveFcmToken] 🔴 ════════════════════════════════════');
    console.log('[saveFcmToken] 🔴 REQUÊTE REÇUE');
    
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    console.log('[saveFcmToken] 🔴 User auth:', user?.email, '| role:', user?.role, '| id:', user?.id);

    if (!user) {
      console.error('[saveFcmToken] ❌ USER UNAUTHORIZED');
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { token, userId, userEmail, userRole } = body;
    
    console.log('[saveFcmToken] 🟡 PAYLOAD REÇU:');
    console.log('   - token longueur:', token?.length);
    console.log('   - token début (25):', token?.substring(0, 25) + '...');
    console.log('   - userId:', userId);
    console.log('   - userEmail:', userEmail);
    console.log('   - userRole:', userRole);
    
    if (!token) {
      console.error('[saveFcmToken] ❌ TOKEN VIDE/UNDEFINED');
      return Response.json({ error: 'Token requis' }, { status: 400 });
    }

    console.log('[saveFcmToken] 🟢 CRÉATION RECORD FcmToken...');
    console.log('   - user_email:', user.email);
    console.log('   - device_type: android_native');
    
    const result = await base44.entities.FcmToken.create({
      user_email: user.email,
      token,
      device_type: 'android_native',
      registered_at: new Date().toISOString(),
      is_active: true,
    });

    console.log('[saveFcmToken] ✅ ════════════════════════════════════');
    console.log('[saveFcmToken] ✅ TOKEN ENREGISTRÉ EN BDD AVEC SUCCÈS');
    console.log('   - token_id:', result.id);
    console.log('   - user_email:', user.email);
    console.log('   - user_role:', user.role);
    console.log('   - device_type: android_native');
    console.log('   - timestamp:', result.registered_at);
    console.log('[saveFcmToken] ✅ ════════════════════════════════════\n');
    
    return Response.json({
      success: true,
      token_id: result.id,
      message: `Token FCM enregistré pour ${user.email}`,
    });
  } catch (error) {
    console.error('[saveFcmToken] ❌ ════════════════════════════════════');
    console.error('[saveFcmToken] ❌ ERREUR ENREGISTREMENT TOKEN');
    console.error('   - message:', error.message);
    console.error('   - name:', error.name);
    console.error('   - stack:', error.stack?.split('\n').slice(0, 5).join('\n'));
    console.error('[saveFcmToken] ❌ ════════════════════════════════════\n');
    
    return Response.json({
      error: error.message,
      debug: {
        message: error.message,
        type: error.constructor.name,
      }
    }, { status: 500 });
  }
});