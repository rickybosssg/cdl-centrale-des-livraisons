/**
 * saveFcmTokenPublic — Endpoint PUBLIC pour enregistrer un token FCM
 *
 * POLITIQUE DE RÉTENTION V6 :
 * - On NE supprime JAMAIS les tokens actifs récents (< 30j)
 * - Si token exact déjà en BDD → réactiver + mettre à jour last_used SEULEMENT
 * - Si nouveau token → créer EN PLUS (sans supprimer les anciens actifs)
 *   puis désactiver les AUTRES anciens tokens (pas les actifs du même jour)
 * - 1 token actif max par user_email → garantit findabilité côté push
 *
 * OBJECTIF : éviter token_count=0 entre deux ouvertures de l'APK
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const BLACKLISTED_PREFIXES = ['test_', 'diag_', 'check_'];
function isTestToken(token) {
  if (!token || token.length < 20) return true;
  const t = String(token).toLowerCase();
  return BLACKLISTED_PREFIXES.some(p => t.startsWith(p)) || t.includes('_test_') || t.includes('test_token');
}

// Token considéré "récent" si utilisé dans les 30 derniers jours
const MAX_TOKEN_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function isTokenRecent(tokenRecord) {
  const ref = tokenRecord.last_used || tokenRecord.registered_at;
  if (!ref) return false;
  return Date.now() - new Date(ref).getTime() < MAX_TOKEN_AGE_MS;
}

Deno.serve(async (req) => {
  const t0 = Date.now();

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { user_email, token, device_type = 'android_native' } = body;

    console.log(`[FCM_SAVE_ATTEMPT] user=${user_email || 'VIDE'} | token_len=${token?.length || 0} | device=${device_type}`);

    if (!user_email || !token) {
      const missing = !user_email ? 'user_email' : 'token';
      console.error(`[FCM_SAVE_FAILED] MISSING_PARAM=${missing}`);
      return Response.json({ success: false, error: `Paramètre manquant: ${missing}`, step: 'validation' }, { status: 400, headers: corsHeaders });
    }

    const cleanToken = String(token).trim();
    const cleanEmail = String(user_email).toLowerCase().trim();

    if (cleanToken.length < 20) {
      console.error(`[FCM_SAVE_FAILED] TOKEN_TOO_SHORT len=${cleanToken.length}`);
      return Response.json({ success: false, error: 'Token trop court', step: 'validation' }, { status: 400, headers: corsHeaders });
    }

    if (isTestToken(cleanToken)) {
      console.warn(`[FCM_SAVE_ATTEMPT] token de test ignoré: ${cleanToken.slice(0, 30)}`);
      return Response.json({ success: true, action: 'ignored_test_token' }, { headers: corsHeaders });
    }

    let base44;
    try {
      base44 = createClientFromRequest(req);
      console.log(`[SDK_INIT_SUCCESS] createClientFromRequest OK | user=${cleanEmail}`);
    } catch (sdkErr) {
      console.error(`[FCM_SAVE_FAILED] SDK init error: ${sdkErr.message} | step=sdk_init`);
      return Response.json({ success: false, error: 'SDK init: ' + sdkErr.message, step: 'sdk_init' }, { status: 500, headers: corsHeaders });
    }

    // Charger TOUS les tokens existants de cet utilisateur
    let allUserTokens = [];
    try {
      allUserTokens = await base44.asServiceRole.entities.FcmToken.filter({ user_email: cleanEmail }, null, 100);
      console.log(`[FCM_SAVE_ATTEMPT] tokens_existants=${allUserTokens.length} | user=${cleanEmail}`);
    } catch (fetchErr) {
      console.error(`[FCM_SAVE_FAILED] Lecture BDD: ${fetchErr.message} | step=read_db`);
      return Response.json({ success: false, error: 'Lecture BDD: ' + fetchErr.message, step: 'read_db' }, { status: 500, headers: corsHeaders });
    }

    const tokensAvant = allUserTokens.length;
    const exactMatch = allUserTokens.find(t => t.token === cleanToken);

    // CAS 1 : token exact déjà en BDD → réactiver uniquement, supprimer les doublons du même token
    if (exactMatch) {
      // Trouver tous les enregistrements avec le même token (doublons)
      const sameTokenRecords = allUserTokens.filter(t => t.token === cleanToken);

      // Garder le plus récent (exactMatch), supprimer les autres doublons
      let suppriméDoublons = 0;
      for (const dup of sameTokenRecords) {
        if (dup.id === exactMatch.id) continue;
        try {
          await base44.asServiceRole.entities.FcmToken.delete(dup.id);
          suppriméDoublons++;
        } catch (_) {}
      }

      // Désactiver les tokens avec un AUTRE token (pas supprimer)
      let desactivés = 0;
      for (const old of allUserTokens) {
        if (old.token === cleanToken) continue; // même token → ne pas toucher
        if (old.is_active) {
          try {
            await base44.asServiceRole.entities.FcmToken.update(old.id, { is_active: false });
            desactivés++;
          } catch (_) {}
        }
      }

      // Réactiver en dernier pour éviter toute course condition
      await base44.asServiceRole.entities.FcmToken.update(exactMatch.id, {
        is_active: true,
        last_used: new Date().toISOString(),
        device_type,
      });

      console.log(`[FCM_SAVE_SUCCESS] action=reactivated | user=${cleanEmail} | token_id=${exactMatch.id} | doublons_supprimés=${suppriméDoublons} | desactivés=${desactivés} | delay=${Date.now() - t0}ms`);
      return Response.json({
        success: true, action: 'reactivated', token_id: exactMatch.id,
        user_email: cleanEmail, tokens_avant: tokensAvant, tokens_desactivés: desactivés,
        doublons_supprimés: suppriméDoublons,
      }, { headers: corsHeaders });
    }

    // CAS 2 : nouveau token → créer D'ABORD, puis désactiver les anciens
    // ORDRE CRITIQUE : créer avant désactiver pour éviter fenêtre sans token actif

    // Supprimer les tokens vraiment anciens (> 30j) pour éviter l'accumulation
    let supprimés = 0;
    for (const old of allUserTokens) {
      if (!isTokenRecent(old)) {
        try {
          await base44.asServiceRole.entities.FcmToken.delete(old.id);
          supprimés++;
        } catch (_) {}
      }
    }

    // Créer le nouveau token actif EN PREMIER
    let result;
    try {
      result = await base44.asServiceRole.entities.FcmToken.create({
        user_email: cleanEmail,
        token: cleanToken,
        device_type,
        registered_at: new Date().toISOString(),
        last_used: new Date().toISOString(),
        is_active: true,
      });
    } catch (createErr) {
      console.error(`[FCM_SAVE_FAILED] CREATE BDD: ${createErr.message} | step=create_db | user=${cleanEmail}`);
      return Response.json({ success: false, error: 'Création BDD: ' + createErr.message, step: 'create_db' }, { status: 500, headers: corsHeaders });
    }

    // Désactiver les anciens tokens SEULEMENT APRÈS que le nouveau est créé
    let desactivés = 0;
    for (const old of allUserTokens) {
      if (old.is_active && old.id !== result.id) {
        try {
          await base44.asServiceRole.entities.FcmToken.update(old.id, { is_active: false });
          desactivés++;
        } catch (_) {}
      }
    }

    console.log(`[FCM_SAVE_SUCCESS] action=created | user=${cleanEmail} | token_id=${result.id} | token_preview=${cleanToken.slice(0, 30)}... | desactivés=${desactivés} | supprimés_anciens=${supprimés} | delay=${Date.now() - t0}ms`);

    return Response.json({
      success: true, action: 'created', token_id: result.id,
      user_email: cleanEmail, tokens_avant: tokensAvant,
      tokens_desactivés: desactivés, tokens_supprimés_anciens: supprimés,
      token_preview: cleanToken.slice(0, 30) + '...',
    }, { headers: corsHeaders });

  } catch (err) {
    console.error(`[FCM_SAVE_FAILED] ERREUR GLOBALE: ${err.message} | delay=${Date.now() - t0}ms`);
    return Response.json({ success: false, error: err.message, step: 'global' }, { status: 500, headers: corsHeaders });
  }
});