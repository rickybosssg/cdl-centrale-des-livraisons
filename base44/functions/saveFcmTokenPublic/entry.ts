import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * saveFcmTokenPublic — Enregistre un token FCM sans aucune auth requise.
 *
 * Conçu pour APK Android Capacitor où la WebView ne transmet JAMAIS
 * le header Authorization dans les appels fetch vers les fonctions Base44.
 *
 * Sécurité : user_email + token FCM valide (longueur > 50 chars) requis.
 * Toutes les opérations BDD via asServiceRole.
 */
Deno.serve(async (req) => {
  // CORS pour APK
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  try {
    // ── Lire le body EN PREMIER ─────────────────────────────────────────────
    let body = {};
    try {
      const text = await req.text();
      if (text) body = JSON.parse(text);
    } catch (_) {}

    const { user_email, token, device_type = 'android_native' } = body;

    console.log('[saveFcmTokenPublic] START | user_email:', user_email, '| device_type:', device_type, '| token présent:', !!token, '| token length:', token?.length);

    // ── Validation ───────────────────────────────────────────────────────────
    if (!user_email || !token) {
      console.error('[saveFcmTokenPublic] Champs manquants');
      return Response.json({ error: 'user_email et token requis' }, { status: 400 });
    }

    const cleanToken = String(token).trim();
    const cleanEmail = String(user_email).trim().toLowerCase();

    if (cleanToken.length < 20) {
      return Response.json({ error: 'Token FCM invalide (trop court)' }, { status: 400 });
    }

    // ── Toutes les opérations via asServiceRole (pas d'auth user requise) ───
    // createClientFromRequest sans token — on utilise uniquement asServiceRole
    const base44 = createClientFromRequest(req);

    // Vérifier si ce token existe déjà
    const existing = await base44.asServiceRole.entities.FcmToken.filter({ token: cleanToken });
    console.log('[saveFcmTokenPublic] Tokens existants avec ce token:', existing.length);

    if (existing.length > 0) {
      const record = existing[0];
      await base44.asServiceRole.entities.FcmToken.update(record.id, {
        user_email: cleanEmail,
        is_active: true,
        last_used: new Date().toISOString(),
        device_type,
      });
      console.log('[saveFcmTokenPublic] ✅ Token existant mis à jour — id:', record.id, '| user:', cleanEmail);
      return Response.json({
        success: true,
        action: 'updated',
        token_id: record.id,
        user_email: cleanEmail,
      }, {
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    // Désactiver les anciens tokens du même user/device
    try {
      const userTokens = await base44.asServiceRole.entities.FcmToken.filter({
        user_email: cleanEmail,
        device_type,
        is_active: true,
      });
      console.log('[saveFcmTokenPublic] Anciens tokens actifs à désactiver:', userTokens.length);
      for (const old of userTokens) {
        if (old.token !== cleanToken) {
          await base44.asServiceRole.entities.FcmToken.update(old.id, { is_active: false });
          console.log('[saveFcmTokenPublic] Ancien token désactivé:', old.token?.substring(0, 20) + '...');
        }
      }
    } catch (cleanErr) {
      console.warn('[saveFcmTokenPublic] Cleanup non bloquant:', cleanErr.message);
    }

    // Créer le nouveau token
    const result = await base44.asServiceRole.entities.FcmToken.create({
      user_email: cleanEmail,
      token: cleanToken,
      device_type,
      registered_at: new Date().toISOString(),
      last_used: new Date().toISOString(),
      is_active: true,
    });

    console.log('[saveFcmTokenPublic] ✅ Nouveau token créé — id:', result.id, '| user:', cleanEmail);
    return Response.json({
      success: true,
      action: 'created',
      token_id: result.id,
      user_email: cleanEmail,
    }, {
      headers: { 'Access-Control-Allow-Origin': '*' },
    });

  } catch (error) {
    console.error('[saveFcmTokenPublic] ❌ ERREUR:', error?.message, '| status:', error?.status);
    return Response.json({
      success: false,
      error: error?.message || 'Unknown error',
    }, {
      status: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }
});