/**
 * saveFcmToken — UPSERT token FCM (endpoint authentifié)
 *
 * LOGIQUE DÉFINITIVE (NE PAS MODIFIER) :
 * 1. Ignorer les tokens de test
 * 2. Si le token existe déjà en BDD → UPDATE (is_active=true, last_used) — PAS de création
 * 3. Désactiver les AUTRES tokens android_native actifs du même user (1 seul actif max)
 * 4. Si token inconnu → CREATE avec is_active=true
 * 5. Jamais désactiver un token sans erreur Firebase UNREGISTERED/INVALID_ARGUMENT
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Tokens de test à ignorer — ne jamais enregistrer en BDD
const BLACKLISTED_TOKENS = ['test_diagnostic_token', 'test_public_endpoint'];
function isTestToken(token) {
  if (!token) return true;
  const t = String(token).toLowerCase();
  return BLACKLISTED_TOKENS.some(b => t.includes(b)) || t.includes('_test_');
}

Deno.serve(async (req) => {
  try {
    // ── Lire le body EN PREMIER (stream consommable une seule fois) ──────────
    let body = {};
    let rawBody = '';
    try {
      rawBody = await req.text();
      if (rawBody) body = JSON.parse(rawBody);
    } catch (_) {}

    const { token, deviceType, device_type, auth_token: bodyAuthToken, user_email: bodyUserEmail } = body;

    // ── Injecter auth_token depuis le body si absent du header ───────────────
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    let effectiveReq = req;
    if (!authHeader && bodyAuthToken) {
      const newHeaders = new Headers(req.headers);
      newHeaders.set('Authorization', `Bearer ${bodyAuthToken}`);
      effectiveReq = new Request(req.url, { method: req.method, headers: newHeaders });
      console.log('[saveFcmToken] auth_token injecté depuis le body');
    }

    // ── Authentification ─────────────────────────────────────────────────────
    const base44 = createClientFromRequest(effectiveReq);
    let user;
    try {
      user = await base44.auth.me();
    } catch (authErr) {
      console.error('[saveFcmToken] auth.me() failed:', authErr.message);
      return Response.json({ error: 'Unauthorized', details: authErr.message }, { status: 401 });
    }

    const resolvedEmail = (user?.email || bodyUserEmail || '').toLowerCase().trim();
    if (!resolvedEmail) {
      return Response.json({ error: 'User email required' }, { status: 401 });
    }

    if (!token || String(token).trim().length === 0) {
      return Response.json({ error: 'Token FCM requis' }, { status: 400 });
    }

    const cleanToken = String(token).trim();

    // ── Bloquer les tokens de test ───────────────────────────────────────────
    if (isTestToken(cleanToken)) {
      console.warn('[saveFcmToken] Token de test ignoré:', cleanToken.substring(0, 30));
      return Response.json({ success: true, action: 'ignored_test_token' });
    }

    const resolvedDeviceType = device_type || deviceType || 'android_native';
    console.log('[saveFcmToken] user:', resolvedEmail, '| deviceType:', resolvedDeviceType, '| token:', cleanToken.substring(0, 25) + '...');

    // ── UPSERT : vérifier si ce token exact existe déjà ─────────────────────
    const existing = await base44.asServiceRole.entities.FcmToken.filter({ token: cleanToken });

    if (existing.length > 0) {
      const record = existing[0];
      // Token connu → toujours réactiver + mettre à jour (jamais recréer)
      await base44.asServiceRole.entities.FcmToken.update(record.id, {
        user_email: resolvedEmail,
        is_active: true,
        last_used: new Date().toISOString(),
        device_type: resolvedDeviceType,
      });
      console.log('[saveFcmToken] ✅ UPSERT (update) token existant pour', resolvedEmail, '— id:', record.id);

      // Désactiver les AUTRES tokens du même user/device (garder uniquement celui-ci)
      try {
        const others = await base44.asServiceRole.entities.FcmToken.filter({
          user_email: resolvedEmail,
          device_type: resolvedDeviceType,
          is_active: true,
        });
        for (const old of others) {
          if (old.id !== record.id && old.token !== cleanToken) {
            await base44.asServiceRole.entities.FcmToken.update(old.id, { is_active: false });
            console.log('[saveFcmToken] Ancien token désactivé:', old.token.substring(0, 20) + '...');
          }
        }
      } catch (_) {}

      return Response.json({ success: true, token_id: record.id, action: 'updated', user_email: resolvedEmail });
    }

    // ── Token inconnu → désactiver les anciens, créer le nouveau ────────────
    try {
      const oldTokens = await base44.asServiceRole.entities.FcmToken.filter({
        user_email: resolvedEmail,
        device_type: resolvedDeviceType,
        is_active: true,
      });
      for (const old of oldTokens) {
        await base44.asServiceRole.entities.FcmToken.update(old.id, { is_active: false });
        console.log('[saveFcmToken] Ancien token désactivé avant création:', old.token.substring(0, 20) + '...');
      }
    } catch (_) {}

    const result = await base44.asServiceRole.entities.FcmToken.create({
      user_email: resolvedEmail,
      token: cleanToken,
      device_type: resolvedDeviceType,
      registered_at: new Date().toISOString(),
      last_used: new Date().toISOString(),
      is_active: true,
    });

    console.log('[saveFcmToken] ✅ Nouveau token créé — id:', result.id, '| user:', resolvedEmail);
    return Response.json({ success: true, token_id: result.id, user_email: resolvedEmail, action: 'created' });

  } catch (error) {
    console.error('[saveFcmToken] ❌ ERROR:', error?.message);
    return Response.json({ success: false, error: error?.message || 'Unknown error' }, { status: 500 });
  }
});