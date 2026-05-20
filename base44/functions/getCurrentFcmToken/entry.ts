/**
 * getCurrentFcmToken — Récupérer le(s) token(s) FCM actif(s) pour un user
 * ⚠️ Endpoint PUBLIC (pas d'auth requise) — utilise asServiceRole
 * Utilisé par FcmTokenEngine.verifyInBdd() et getActiveTokens()
 * pour éviter le 403 Base44 auth_required sur APK sans session active.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { user_email, include_all = false } = body;

    if (!user_email) {
      return Response.json({ error: 'user_email requis' }, { status: 400 });
    }

    // Utilise asServiceRole — fonctionne sans session utilisateur active
    const tokens = await base44.asServiceRole.entities.FcmToken.filter(
      { user_email: user_email.toLowerCase(), is_active: true },
      '-last_used',
      20
    );

    const valid = (tokens || []).filter(t => t.token && t.token.length > 50);
    const count = valid.length;

    if (count === 0) {
      return Response.json({ success: true, token: null, count: 0, tokens: [], message: 'No active token' });
    }

    // Token le plus récent
    const current = valid[0];

    return Response.json({
      success: true,
      token: current.token,
      token_id: current.id,
      device_type: current.device_type,
      registered_at: current.registered_at,
      last_used: current.last_used,
      is_active: current.is_active,
      count,
      // include_all=true → retourner tous les tokens (pour getDiagnostics)
      tokens: include_all ? valid.map(t => ({
        id: t.id,
        token: t.token,
        token_preview: t.token?.slice(0, 40) + '...',
        device_type: t.device_type,
        platform: t.platform,
        is_active: t.is_active,
        registered_at: t.registered_at,
        last_used: t.last_used,
        age_hours: t.last_used ? Math.round((Date.now() - new Date(t.last_used).getTime()) / 3600000) : null,
      })) : [],
    });
  } catch (error) {
    console.error('[getCurrentFcmToken] Error:', error?.message);
    return Response.json({ error: error?.message || 'Unknown error' }, { status: 500 });
  }
});