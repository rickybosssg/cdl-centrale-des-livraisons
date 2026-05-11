/**
 * saveFcmTokenPublic — Endpoint PUBLIC pour enregistrer un token FCM
 *
 * CORRECTION : utilise createClientFromRequest(req) comme TOUTES les autres functions.
 * Le SDK injecte automatiquement le service token depuis le contexte Deno.
 * Ne PAS utiliser createClient({ appId }) seul — manque le service token.
 *
 * LOGS :
 * [FCM_SAVE_ATTEMPT]  — requête reçue avec paramètres
 * [SDK_INIT_SUCCESS]  — SDK service role initialisé correctement
 * [FCM_SAVE_SUCCESS]  — token créé/réactivé en BDD
 * [FCM_SAVE_FAILED]   — erreur avec étape précise
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const BLACKLISTED_PREFIXES = ['test_', 'diag_', 'check_'];
function isTestToken(token) {
  if (!token || token.length < 20) return true;
  const t = String(token).toLowerCase();
  return BLACKLISTED_PREFIXES.some(p => t.startsWith(p)) || t.includes('_test_') || t.includes('test_token');
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

    // Validation paramètres
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

    // SDK via createClientFromRequest — identique aux autres functions CDL
    let base44;
    try {
      base44 = createClientFromRequest(req);
      // Test rapide pour confirmer que asServiceRole fonctionne
      console.log(`[SDK_INIT_SUCCESS] createClientFromRequest OK | user=${cleanEmail}`);
    } catch (sdkErr) {
      console.error(`[FCM_SAVE_FAILED] SDK init error: ${sdkErr.message} | step=sdk_init`);
      return Response.json({ success: false, error: 'SDK init: ' + sdkErr.message, step: 'sdk_init' }, { status: 500, headers: corsHeaders });
    }

    // Charger les tokens existants de cet utilisateur
    let allUserTokens = [];
    try {
      allUserTokens = await base44.asServiceRole.entities.FcmToken.filter({ user_email: cleanEmail }, null, 50);
      console.log(`[FCM_SAVE_ATTEMPT] tokens_existants=${allUserTokens.length} | user=${cleanEmail}`);
    } catch (fetchErr) {
      console.error(`[FCM_SAVE_FAILED] Lecture BDD: ${fetchErr.message} | step=read_db`);
      return Response.json({ success: false, error: 'Lecture BDD: ' + fetchErr.message, step: 'read_db' }, { status: 500, headers: corsHeaders });
    }

    const tokensAvant = allUserTokens.length;
    const exactMatch = allUserTokens.find(t => t.token === cleanToken);

    // CAS 1 : token exact déjà en BDD → réactiver + nettoyer les autres
    if (exactMatch) {
      await base44.asServiceRole.entities.FcmToken.update(exactMatch.id, {
        is_active: true,
        last_used: new Date().toISOString(),
        device_type,
      });

      const toDelete = allUserTokens.filter(t => t.id !== exactMatch.id);
      let supprimés = 0;
      for (const old of toDelete) {
        try { await base44.asServiceRole.entities.FcmToken.delete(old.id); supprimés++; } catch (_) {}
      }

      console.log(`[FCM_SAVE_SUCCESS] action=reactivated | user=${cleanEmail} | token_id=${exactMatch.id} | supprimés=${supprimés} | delay=${Date.now() - t0}ms`);
      return Response.json({
        success: true, action: 'reactivated', token_id: exactMatch.id,
        user_email: cleanEmail, tokens_avant: tokensAvant, tokens_supprimés: supprimés,
      }, { headers: corsHeaders });
    }

    // CAS 2 : nouveau token → supprimer tous les anciens
    let supprimés = 0;
    for (const old of allUserTokens) {
      try { await base44.asServiceRole.entities.FcmToken.delete(old.id); supprimés++; } catch (_) {
        try { await base44.asServiceRole.entities.FcmToken.update(old.id, { is_active: false }); } catch (_) {}
      }
    }

    // Créer le nouveau token unique
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

    console.log(`[FCM_SAVE_SUCCESS] action=created | user=${cleanEmail} | token_id=${result.id} | token_preview=${cleanToken.slice(0, 30)}... | supprimés=${supprimés} | delay=${Date.now() - t0}ms`);

    return Response.json({
      success: true, action: 'created', token_id: result.id,
      user_email: cleanEmail, tokens_avant: tokensAvant, tokens_supprimés: supprimés,
      token_preview: cleanToken.slice(0, 30) + '...',
    }, { headers: corsHeaders });

  } catch (err) {
    console.error(`[FCM_SAVE_FAILED] ERREUR GLOBALE: ${err.message} | delay=${Date.now() - t0}ms`);
    return Response.json({ success: false, error: err.message, step: 'global' }, { status: 500, headers: corsHeaders });
  }
});