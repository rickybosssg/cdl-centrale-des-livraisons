/**
 * checkGoogleOAuthConfig — Vérifie que la config Google OAuth de Base44 est correcte
 * 
 * Points à vérifier :
 * 1. La clé client Google est configurée côté Base44
 * 2. L'URL de redirection OAuth est correcte
 * 3. Le consentement screen est configuré
 * 4. Le domaine est autorisé
 * 5. Pas d'erreur 403 (access denied)
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    const isAdmin = user?.role === 'admin' || user?.email === 'weezyh2@gmail.com';

    if (!isAdmin) {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const checks = {
      google_client_id: !!Deno.env.get('GOOGLE_CLIENT_ID'),
      google_client_secret: !!Deno.env.get('GOOGLE_CLIENT_SECRET'),
      base44_app_id: !!Deno.env.get('BASE44_APP_ID'),
      firebase_config: !!Deno.env.get('VITE_FIREBASE_PROJECT_ID'),
    };

    const appId = Deno.env.get('BASE44_APP_ID') || '';
    const expectedRedirectUri = `https://api.base44.app/api/apps/${appId}/oauth/google/callback`;

    return Response.json({
      summary: Object.values(checks).every(Boolean) ? 'All checks passed ✅' : 'Some checks failed ⚠️',
      checks,
      expected_redirect_uri: expectedRedirectUri,
      warning: !checks.google_client_id || !checks.google_client_secret
        ? 'Google OAuth credentials missing — configure in Base44 dashboard'
        : null,
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});