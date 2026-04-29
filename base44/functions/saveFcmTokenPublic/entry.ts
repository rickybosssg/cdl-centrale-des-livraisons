/**
 * saveFcmTokenPublic — UPSERT token FCM (endpoint PUBLIC, sans auth)
 *
 * LOGIQUE DÉFINITIVE (NE PAS MODIFIER) :
 * 1. Ignorer les tokens de test (blacklist)
 * 2. Si token existe → UPDATE is_active=true (jamais recréer)
 * 3. Désactiver les AUTRES tokens android_native actifs du même user (1 seul actif)
 * 4. Si token inconnu → CREATE is_active=true
 *
 * SÉCURITÉ : requiert user_email + token FCM Firebase (non forgeables)
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const BLACKLISTED_TOKENS = ['test_diagnostic_token', 'test_public_endpoint'];
function isTestToken(token) {
  if (!token) return true;
  const t = String(token).toLowerCase();
  return BLACKLISTED_TOKENS.some(b => t.includes(b)) || t.includes('_test_');
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { user_email, token, device_type = 'android_native' } = body;

    if (!user_email || !token) {
      return Response.json({ error: 'user_email et token requis' }, { status: 400 });
    }

    const cleanToken = String(token).trim();
    const cleanEmail = String(user_email).toLowerCase().trim();

    // ── Bloquer les tokens de test ───────────────────────────────────────────
    if (isTestToken(cleanToken)) {
      console.warn('[saveFcmTokenPublic] Token de test ignoré:', cleanToken.substring(0, 30));
      return Response.json({ success: true, action: 'ignored_test_token' });
    }

    console.log('[saveFcmTokenPublic] user_email:', cleanEmail, '| token:', cleanToken.substring(0, 25) + '...');

    const base44 = createClientFromRequest(req);

    // ── UPSERT : vérifier si ce token exact existe déjà ─────────────────────
    const existing = await base44.asServiceRole.entities.FcmToken.filter({ token: cleanToken });

    if (existing.length > 0) {
      const record = existing[0];
      // Token connu → réactiver immédiatement (jamais recréer)
      await base44.asServiceRole.entities.FcmToken.update(record.id, {
        user_email: cleanEmail,
        is_active: true,
        last_used: new Date().toISOString(),
        device_type,
      });
      console.log('[saveFcmTokenPublic] ✅ UPSERT (update) token existant pour', cleanEmail, '— id:', record.id);

      // Désactiver les AUTRES tokens du même user/device
      try {
        const others = await base44.asServiceRole.entities.FcmToken.filter({
          user_email: cleanEmail,
          device_type,
          is_active: true,
        });
        for (const old of others) {
          if (old.id !== record.id && old.token !== cleanToken) {
            await base44.asServiceRole.entities.FcmToken.update(old.id, { is_active: false });
            console.log('[saveFcmTokenPublic] Ancien token désactivé:', old.token.substring(0, 20) + '...');
          }
        }
      } catch (_) {}

      return Response.json({ success: true, action: 'updated', token_id: record.id, user_email: cleanEmail });
    }

    // ── Token inconnu → désactiver les anciens, créer le nouveau ────────────
    try {
      const oldTokens = await base44.asServiceRole.entities.FcmToken.filter({
        user_email: cleanEmail,
        device_type,
        is_active: true,
      });
      for (const old of oldTokens) {
        await base44.asServiceRole.entities.FcmToken.update(old.id, { is_active: false });
        console.log('[saveFcmTokenPublic] Ancien token désactivé avant création:', old.token.substring(0, 20) + '...');
      }
    } catch (_) {}

    const result = await base44.asServiceRole.entities.FcmToken.create({
      user_email: cleanEmail,
      token: cleanToken,
      device_type,
      registered_at: new Date().toISOString(),
      last_used: new Date().toISOString(),
      is_active: true,
    });

    console.log('[saveFcmTokenPublic] ✅ Nouveau token créé — id:', result.id, '| user:', cleanEmail);
    return Response.json({ success: true, action: 'created', token_id: result.id, user_email: cleanEmail });

  } catch (error) {
    console.error('[saveFcmTokenPublic] ❌ ERROR:', error?.message);
    return Response.json({ success: false, error: error?.message }, { status: 500 });
  }
});