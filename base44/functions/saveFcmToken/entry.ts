import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * saveFcmToken — Enregistrer le token FCM natif en BDD (APK Android)
 * 
 * IMPORTANT : SANS asServiceRole, auth utilisateur standard uniquement
 * Appelée par AppLayoutWrapper quand le token Capacitor/FCM est reçu
 */
Deno.serve(async (req) => {
  try {
    console.log('\n[FCM BACKEND] 🔴 ════════════════════════════════════');
    console.log('[FCM BACKEND] 🔴 REQUÊTE saveFcmToken REÇUE');
    
    // ──────────────────────────────────────────────────────────────────────
    // 1. AUTH UTILISATEUR STANDARD (pas asServiceRole!)
    // ──────────────────────────────────────────────────────────────────────
    const base44 = createClientFromRequest(req);
    let user;
    try {
      user = await base44.auth.me();
    } catch (authErr) {
      console.error('[FCM BACKEND] ❌ AUTH FAILED:', authErr.message);
      return Response.json({ error: 'Unauthorized', details: authErr.message }, { status: 401 });
    }

    console.log('[FCM BACKEND] 🟢 USER AUTHENTICATED');
    console.log('   - email:', user?.email);
    console.log('   - user_id:', user?.id);
    console.log('   - role:', user?.role);

    if (!user?.email) {
      console.error('[FCM BACKEND] ❌ USER EMAIL MISSING');
      return Response.json({ error: 'User email required' }, { status: 401 });
    }

    // ──────────────────────────────────────────────────────────────────────
    // 2. PARSER PAYLOAD
    // ──────────────────────────────────────────────────────────────────────
    let body = {};
    try {
      body = await req.json();
    } catch (parseErr) {
      console.error('[FCM BACKEND] ❌ JSON PARSE FAILED:', parseErr.message);
      return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { token, userId, userEmail, userRole } = body;
    
    console.log('[FCM BACKEND] 🟡 PAYLOAD PARSED');
    console.log('   - token_length:', token?.length || 0);
    console.log('   - token_start:', token?.substring(0, 25) + '...');
    console.log('   - userId_param:', userId);
    console.log('   - userEmail_param:', userEmail);
    console.log('   - userRole_param:', userRole);
    
    if (!token || token.trim().length === 0) {
      console.error('[FCM BACKEND] ❌ TOKEN EMPTY/MISSING');
      return Response.json({ error: 'Token is required and cannot be empty' }, { status: 400 });
    }

    // ──────────────────────────────────────────────────────────────────────
    // 3. SAUVEGARDER DANS FcmToken (auth utilisateur uniquement)
    // ──────────────────────────────────────────────────────────────────────
    console.log('[FCM BACKEND] 🟢 CREATING FcmToken RECORD');
    console.log('   - table: FcmToken');
    console.log('   - user_email:', user.email);
    console.log('   - device_type: android_native');

    let result;
    try {
      result = await base44.entities.FcmToken.create({
        user_email: user.email,
        token: token.trim(),
        device_type: 'android_native',
        registered_at: new Date().toISOString(),
        is_active: true,
      });
      console.log('[FCM BACKEND] ✅ RECORD CREATED');
      console.log('   - record_id:', result.id);
    } catch (createErr) {
      console.error('[FCM BACKEND] ❌ CREATE FAILED:', createErr.message);
      throw createErr;
    }

    // ──────────────────────────────────────────────────────────────────────
    // 4. SUCCESS RESPONSE
    // ──────────────────────────────────────────────────────────────────────
    console.log('[FCM BACKEND] ✅ ════════════════════════════════════');
    console.log('[FCM BACKEND] ✅ [CERTAIN] FCM TOKEN SAVED IN DATABASE');
    console.log('   - token_id:', result.id);
    console.log('   - user_email:', user.email);
    console.log('   - user_role:', user.role);
    console.log('   - device_type: android_native');
    console.log('   - registered_at:', result.registered_at);
    console.log('[FCM BACKEND] ✅ ════════════════════════════════════\n');
    
    return Response.json({
      success: true,
      token_id: result.id,
      user_email: user.email,
      message: `FCM token registered for ${user.email}`,
    }, { status: 200 });

  } catch (error) {
    console.error('[FCM BACKEND] ❌ ════════════════════════════════════');
    console.error('[FCM BACKEND] ❌ FATAL ERROR');
    console.error('   - error_type:', error?.constructor?.name);
    console.error('   - error_message:', error?.message);
    console.error('   - error_code:', error?.code);
    if (error?.stack) {
      console.error('   - stack:', error.stack.split('\n').slice(0, 3).join(' '));
    }
    console.error('[FCM BACKEND] ❌ ════════════════════════════════════\n');
    
    return Response.json({
      success: false,
      error: error?.message || 'Unknown error',
      error_type: error?.constructor?.name || 'Error',
      error_code: error?.code || 'UNKNOWN',
    }, { status: 500 });
  }
});