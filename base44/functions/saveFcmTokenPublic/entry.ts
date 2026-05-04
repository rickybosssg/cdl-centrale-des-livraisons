/**
 * saveFcmTokenPublic — 1 TOKEN UNIQUE PAR UTILISATEUR (endpoint PUBLIC, sans auth)
 *
 * RÈGLE ABSOLUE : 1 user_email = 1 seul token actif en base, jamais plus.
 *
 * LOGIQUE :
 * 1. Rejeter tokens vides/test
 * 2. Charger TOUS les tokens existants de cet user (actifs + inactifs)
 * 3. Si ce token exact existe déjà → réactiver + supprimer TOUS les autres → retourner
 * 4. Si token nouveau → supprimer PHYSIQUEMENT tous les anciens → créer l'unique nouveau
 * 5. Log [FCM_TOKEN_CLEAN] avec avant/après
 *
 * GARANTIE : après chaque appel, cet user n'a qu'UN SEUL token en base.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const BLACKLISTED_TOKENS = ['test_diagnostic_token', 'test_public_endpoint', 'test_check_only'];
function isTestToken(token) {
  if (!token) return true;
  const t = String(token).toLowerCase();
  return BLACKLISTED_TOKENS.some(b => t.includes(b)) || t.startsWith('test_') || t.includes('_test_');
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

    // ── GUARD : token invalide ────────────────────────────────────────────────
    if (!cleanToken || cleanToken.length < 10) {
      console.error(`[saveFcmTokenPublic] 🔴 GUARD — token vide/court (len=${cleanToken.length}) pour ${cleanEmail} — anciens tokens PRÉSERVÉS`);
      return Response.json({ success: false, error: 'token invalide — anciens tokens préservés', guard: 'TOKEN_EMPTY' }, { status: 400 });
    }

    if (isTestToken(cleanToken)) {
      console.warn(`[saveFcmTokenPublic] Token de test ignoré: ${cleanToken.substring(0, 30)}`);
      return Response.json({ success: true, action: 'ignored_test_token' });
    }

    console.log(`[saveFcmTokenPublic] START | user=${cleanEmail} | token=${cleanToken.substring(0, 25)}... | device=${device_type}`);

    const base44 = createClientFromRequest(req);

    // ── Charger TOUS les tokens de cet utilisateur (actifs + inactifs) ────────
    const allUserTokens = await base44.asServiceRole.entities.FcmToken.filter({ user_email: cleanEmail }, null, 200);
    const tokensAvant = allUserTokens.length;

    console.log(`[FCM_TOKEN_CLEAN] tokens_avant=${tokensAvant} | user=${cleanEmail}`);

    // ── CAS 1 : ce token exact existe déjà ───────────────────────────────────
    const exactMatch = allUserTokens.find(t => t.token === cleanToken);

    if (exactMatch) {
      // Réactiver ce token
      await base44.asServiceRole.entities.FcmToken.update(exactMatch.id, {
        is_active: true,
        last_used: new Date().toISOString(),
        device_type,
        user_email: cleanEmail,
      });

      // Supprimer PHYSIQUEMENT tous les autres tokens de cet user
      const toDelete = allUserTokens.filter(t => t.id !== exactMatch.id);
      let supprimés = 0;
      for (const old of toDelete) {
        try {
          await base44.asServiceRole.entities.FcmToken.delete(old.id);
          supprimés++;
        } catch (_) {
          // Fallback : désactiver si delete échoue
          await base44.asServiceRole.entities.FcmToken.update(old.id, { is_active: false }).catch(() => {});
        }
      }

      console.log(`[FCM_TOKEN_CLEAN] tokens_avant=${tokensAvant} | tokens_supprimés=${supprimés} | token_final=${cleanToken.substring(0, 25)}... | action=reactivated | user=${cleanEmail}`);
      console.log(`[saveFcmTokenPublic] ✅ Token existant réactivé, ${supprimés} ancien(s) supprimé(s) | user=${cleanEmail} | id=${exactMatch.id}`);

      return Response.json({
        success: true,
        action: 'reactivated',
        token_id: exactMatch.id,
        user_email: cleanEmail,
        tokens_avant: tokensAvant,
        tokens_supprimés: supprimés,
        token_final: cleanToken.substring(0, 25) + '...',
      });
    }

    // ── CAS 2 : token nouveau → supprimer TOUS les anciens, créer l'unique ──
    let supprimés = 0;
    for (const old of allUserTokens) {
      try {
        await base44.asServiceRole.entities.FcmToken.delete(old.id);
        supprimés++;
        console.log(`[FCM_TOKEN_CLEAN] Supprimé: id=${old.id} | token=${old.token?.substring(0, 20)}...`);
      } catch (_) {
        await base44.asServiceRole.entities.FcmToken.update(old.id, { is_active: false }).catch(() => {});
        supprimés++;
      }
    }

    // Créer l'unique nouveau token
    const result = await base44.asServiceRole.entities.FcmToken.create({
      user_email: cleanEmail,
      token: cleanToken,
      device_type,
      registered_at: new Date().toISOString(),
      last_used: new Date().toISOString(),
      is_active: true,
    });

    console.log(`[FCM_TOKEN_CLEAN] tokens_avant=${tokensAvant} | tokens_supprimés=${supprimés} | token_final=${cleanToken.substring(0, 25)}... | action=created | user=${cleanEmail}`);
    console.log(`[saveFcmTokenPublic] ✅ Nouveau token unique créé | id=${result.id} | user=${cleanEmail} | ${tokensAvant} anciens supprimés`);

    return Response.json({
      success: true,
      action: 'created',
      token_id: result.id,
      user_email: cleanEmail,
      tokens_avant: tokensAvant,
      tokens_supprimés: supprimés,
      token_final: cleanToken.substring(0, 25) + '...',
    });

  } catch (error) {
    console.error(`[saveFcmTokenPublic] ❌ ERROR: ${error?.message}`);
    return Response.json({ success: false, error: error?.message }, { status: 500 });
  }
});