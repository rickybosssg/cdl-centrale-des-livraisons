/**
 * Diagnostic Firebase complet — teste tous les éléments critiques
 * Retourne les erreurs détaillées pour chaque étape
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const diagnostics = {
      timestamp: new Date().toISOString(),
      user_email: user.email,
      tests: {},
    };

    // Test 1: Vérifier les secrets VITE_*
    console.log('[testFirebaseSetup] Test 1: Secrets VITE_*');
    const apiKey = Deno.env.get('VITE_FIREBASE_API_KEY');
    const messagingSenderId = Deno.env.get('VITE_FIREBASE_MESSAGING_SENDER_ID');
    const appId = Deno.env.get('VITE_FIREBASE_APP_ID');
    const vapidKey = Deno.env.get('VITE_FIREBASE_VAPID_KEY');
    
    diagnostics.tests.secrets_vite = {
      apiKey: apiKey ? `✅ ${apiKey.substring(0, 8)}...` : '❌ MISSING',
      messagingSenderId: messagingSenderId ? `✅ ${messagingSenderId.substring(0, 8)}...` : '❌ MISSING',
      appId: appId ? `✅ ${appId.substring(0, 8)}...` : '❌ MISSING',
      vapidKey: vapidKey ? `✅ ${vapidKey.substring(0, 8)}...` : '❌ MISSING',
      all_present: !!(apiKey && messagingSenderId && appId && vapidKey),
    };

    // Test 2: Vérifier FIREBASE_SERVICE_ACCOUNT_JSON
    console.log('[testFirebaseSetup] Test 2: FIREBASE_SERVICE_ACCOUNT_JSON');
    const serviceAccount = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');
    let sa_client_email = null;
    let sa_valid = false;
    
    if (serviceAccount) {
      try {
        const sa = JSON.parse(serviceAccount);
        sa_client_email = sa.client_email;
        sa_valid = !!(sa.client_email && sa.private_key && sa.project_id);
        console.log('[testFirebaseSetup] SA parsed:', { client_email: sa.client_email, project_id: sa.project_id });
      } catch (e) {
        console.error('[testFirebaseSetup] SA parse error:', e.message);
      }
    }
    
    diagnostics.tests.service_account = {
      present: !!serviceAccount,
      valid: sa_valid,
      client_email: sa_client_email || '❌ INVALID_JSON',
    };

    // Test 3: Config complète
    const complete = apiKey && messagingSenderId && appId && vapidKey;
    diagnostics.tests.firebase_config_complete = complete;

    // Test 4: Enregistrer un token test (si secrets OK)
    if (complete) {
      console.log('[testFirebaseSetup] Test 4: Config ready pour token generation');
      diagnostics.tests.token_generation_ready = {
        status: '✅ Ready',
        next_step: 'Frontend doit appeler getToken(messaging, { vapidKey })',
      };
    } else {
      const missing = [];
      if (!apiKey) missing.push('VITE_FIREBASE_API_KEY');
      if (!messagingSenderId) missing.push('VITE_FIREBASE_MESSAGING_SENDER_ID');
      if (!appId) missing.push('VITE_FIREBASE_APP_ID');
      if (!vapidKey) missing.push('VITE_FIREBASE_VAPID_KEY');
      diagnostics.tests.token_generation_ready = {
        status: '❌ MISSING_SECRETS',
        missing_secrets: missing,
      };
    }

    // Logs
    console.log('[testFirebaseSetup] Diagnostics:', JSON.stringify(diagnostics, null, 2));

    return Response.json({
      success: true,
      diagnostics,
      ready: complete,
    });
  } catch (error) {
    console.error('[testFirebaseSetup] Error:', error.message);
    return Response.json({ 
      error: error.message,
      success: false,
    }, { status: 500 });
  }
});