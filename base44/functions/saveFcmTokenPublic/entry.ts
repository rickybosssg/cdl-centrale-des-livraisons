/**
 * saveFcmTokenPublic — Endpoint PUBLIC (sans auth) pour enregistrer un token FCM
 *
 * PIPELINE AUDIT LOGS :
 * [FCM_SAVE_ATTEMPT]  — requête reçue
 * [FCM_SAVE_SUCCESS]  — token créé/mis à jour en BDD
 * [FCM_SAVE_FAILED]   — erreur BDD ou paramètre manquant
 *
 * RÈGLE : 1 user_email = 1 seul token actif en base.
 */

const APP_BASE_URL = 'https://cdl.base44.app';
const APP_ID = Deno.env.get('BASE44_APP_ID') || '';

// Tokens de test à ignorer
const BLACKLISTED_PREFIXES = ['test_', 'diag_', 'check_'];
function isTestToken(token) {
  if (!token || token.length < 20) return true;
  const t = String(token).toLowerCase();
  return BLACKLISTED_PREFIXES.some(p => t.startsWith(p)) || t.includes('_test_') || t.includes('test_token');
}

async function callBase44Api(path, body) {
  const url = `${APP_BASE_URL}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-app-id': APP_ID,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${path} → HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

Deno.serve(async (req) => {
  const t0 = Date.now();

  // CORS
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { user_email, token, device_type = 'android_native' } = body;

    console.log(`[FCM_SAVE_ATTEMPT] user=${user_email || 'VIDE'} | token_len=${token?.length || 0} | device=${device_type} | app_id=${APP_ID ? APP_ID.slice(0, 8) + '...' : 'VIDE'}`);

    // Validation
    if (!user_email || !token) {
      const missing = !user_email ? 'user_email' : 'token';
      console.error(`[FCM_SAVE_FAILED] MISSING_PARAM: ${missing} | user=${user_email || 'VIDE'}`);
      return Response.json({ success: false, error: `Paramètre manquant: ${missing}`, step: 'validation' }, { status: 400, headers: corsHeaders });
    }

    const cleanToken = String(token).trim();
    const cleanEmail = String(user_email).toLowerCase().trim();

    if (isTestToken(cleanToken)) {
      console.warn(`[FCM_SAVE_ATTEMPT] token de test ignoré: ${cleanToken.slice(0, 30)}`);
      return Response.json({ success: true, action: 'ignored_test_token' }, { headers: corsHeaders });
    }

    if (!APP_ID) {
      console.error('[FCM_SAVE_FAILED] BASE44_APP_ID non défini — impossible d\'accéder à la BDD');
      return Response.json({ success: false, error: 'BASE44_APP_ID manquant', step: 'config' }, { status: 500, headers: corsHeaders });
    }

    // Import SDK service role
    let base44ServiceRole;
    try {
      const { createClient } = await import('npm:@base44/sdk@0.8.25');
      const client = createClient({ appId: APP_ID, requiresAuth: false });
      base44ServiceRole = client.asServiceRole;
      console.log(`[FCM_SAVE_ATTEMPT] SDK service role initialisé | app_id=${APP_ID.slice(0, 8)}...`);
    } catch (sdkErr) {
      console.error(`[FCM_SAVE_FAILED] SDK init error: ${sdkErr.message}`);
      return Response.json({ success: false, error: 'SDK init: ' + sdkErr.message, step: 'sdk_init' }, { status: 500, headers: corsHeaders });
    }

    // Charger les tokens existants
    let allUserTokens = [];
    try {
      allUserTokens = await base44ServiceRole.entities.FcmToken.filter({ user_email: cleanEmail }, null, 50);
      console.log(`[FCM_SAVE_ATTEMPT] tokens_existants=${allUserTokens.length} | user=${cleanEmail}`);
    } catch (fetchErr) {
      console.error(`[FCM_SAVE_FAILED] Lecture BDD échouée: ${fetchErr.message} | user=${cleanEmail}`);
      return Response.json({ success: false, error: 'Lecture BDD: ' + fetchErr.message, step: 'read_db' }, { status: 500, headers: corsHeaders });
    }

    const tokensAvant = allUserTokens.length;
    const exactMatch = allUserTokens.find(t => t.token === cleanToken);

    if (exactMatch) {
      // Réactiver token existant
      await base44ServiceRole.entities.FcmToken.update(exactMatch.id, {
        is_active: true,
        last_used: new Date().toISOString(),
        device_type,
      });

      // Supprimer les autres
      const toDelete = allUserTokens.filter(t => t.id !== exactMatch.id);
      let supprimés = 0;
      for (const old of toDelete) {
        try { await base44ServiceRole.entities.FcmToken.delete(old.id); supprimés++; } catch (_) {}
      }

      console.log(`[FCM_SAVE_SUCCESS] action=reactivated | user=${cleanEmail} | token_id=${exactMatch.id} | supprimés=${supprimés} | delay=${Date.now() - t0}ms`);
      return Response.json({
        success: true, action: 'reactivated', token_id: exactMatch.id,
        user_email: cleanEmail, tokens_avant: tokensAvant, tokens_supprimés: supprimés,
      }, { headers: corsHeaders });
    }

    // Nouveau token → supprimer tous les anciens
    let supprimés = 0;
    for (const old of allUserTokens) {
      try { await base44ServiceRole.entities.FcmToken.delete(old.id); supprimés++; } catch (_) {
        try { await base44ServiceRole.entities.FcmToken.update(old.id, { is_active: false }); } catch (_) {}
      }
    }

    // Créer le nouveau token
    let result;
    try {
      result = await base44ServiceRole.entities.FcmToken.create({
        user_email: cleanEmail,
        token: cleanToken,
        device_type,
        registered_at: new Date().toISOString(),
        last_used: new Date().toISOString(),
        is_active: true,
      });
    } catch (createErr) {
      console.error(`[FCM_SAVE_FAILED] CREATE BDD échoué: ${createErr.message} | user=${cleanEmail}`);
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