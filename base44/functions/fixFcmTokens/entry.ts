/**
 * fixFcmTokens — Répare les tokens FCM inactifs (admin uniquement)
 *
 * Problème corrigé :
 * - Des tokens valides étaient désactivés par erreur (bug de la logique UPSERT précédente)
 * - Cette fonction réactive le token le plus récent par user/device et supprime les doublons
 *
 * Usage : appeler UNE SEULE FOIS après le déploiement du fix saveFcmToken/saveFcmTokenPublic
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Admin uniquement
    let user = null;
    try { user = await base44.auth.me(); } catch (_) {}
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin uniquement' }, { status: 403 });
    }

    console.log('[fixFcmTokens] Démarrage réparation tokens FCM...');

    // Récupérer TOUS les tokens (actifs ET inactifs)
    const allTokens = await base44.asServiceRole.entities.FcmToken.list('-registered_at', 500);

    // Filtrer les tokens de test
    const BLACKLISTED = ['test_diagnostic_token', 'test_public_endpoint'];
    const realTokens = allTokens.filter(t => {
      const tok = (t.token || '').toLowerCase();
      return t.token && !BLACKLISTED.some(b => tok.includes(b)) && !tok.includes('_test_');
    });

    console.log(`[fixFcmTokens] Tokens réels trouvés: ${realTokens.length} / ${allTokens.length}`);

    // Supprimer les tokens de test de la BDD
    const testTokens = allTokens.filter(t => !realTokens.includes(t));
    for (const t of testTokens) {
      await base44.asServiceRole.entities.FcmToken.delete(t.id).catch(() => {});
      console.log('[fixFcmTokens] Token test supprimé:', t.token?.substring(0, 30));
    }

    // Grouper par user_email + device_type
    const groups = {};
    for (const t of realTokens) {
      const key = `${t.user_email}__${t.device_type || 'android_native'}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    }

    let reactivated = 0;
    let deactivated = 0;

    for (const [key, tokens] of Object.entries(groups)) {
      if (tokens.length === 0) continue;

      // Trier par date d'enregistrement décroissante → le plus récent en premier
      tokens.sort((a, b) => {
        const da = new Date(b.registered_at || b.created_date || 0).getTime();
        const db = new Date(a.registered_at || a.created_date || 0).getTime();
        return da - db;
      });

      const [latest, ...older] = tokens;

      // Réactiver le plus récent
      if (!latest.is_active) {
        await base44.asServiceRole.entities.FcmToken.update(latest.id, {
          is_active: true,
          last_used: new Date().toISOString(),
        });
        reactivated++;
        console.log(`[fixFcmTokens] ✅ Réactivé: ${latest.user_email} | ${latest.token?.slice(0, 20)}...`);
      }

      // Désactiver tous les autres (doublons plus anciens)
      for (const old of older) {
        if (old.is_active) {
          await base44.asServiceRole.entities.FcmToken.update(old.id, { is_active: false });
          deactivated++;
          console.log(`[fixFcmTokens] Doublon désactivé: ${old.user_email} | ${old.token?.slice(0, 20)}...`);
        }
      }
    }

    console.log(`[fixFcmTokens] ✅ DONE — réactivés: ${reactivated} | doublons désactivés: ${deactivated} | tests supprimés: ${testTokens.length}`);
    return Response.json({
      success: true,
      reactivated,
      duplicates_deactivated: deactivated,
      test_tokens_deleted: testTokens.length,
      groups_processed: Object.keys(groups).length,
    });

  } catch (error) {
    console.error('[fixFcmTokens] ERROR:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});