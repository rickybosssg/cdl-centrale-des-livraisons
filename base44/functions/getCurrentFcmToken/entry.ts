/**
 * getCurrentFcmToken — Récupérer le token FCM actuel pour un user
 * Utilisé pour le diagnostic et validation
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { device_type = 'android_native' } = body;

    // Chercher le token le plus récent
    const tokens = await base44.entities.FcmToken.filter({
      user_email: user.email,
      device_type: device_type,
      is_active: true,
    });

    if (tokens.length === 0) {
      return Response.json({
        success: true,
        token: null,
        message: 'No active token found',
      });
    }

    // Trier par last_used (le plus récent d'abord)
    const sorted = tokens.sort(
      (a, b) => new Date(b.last_used || b.created_date) - new Date(a.last_used || a.created_date)
    );

    const current = sorted[0];

    return Response.json({
      success: true,
      token: current.token,
      token_id: current.id,
      device_type: current.device_type,
      registered_at: current.registered_at,
      last_used: current.last_used,
      is_active: current.is_active,
      all_tokens_count: tokens.length,
    });
  } catch (error) {
    console.error('[getCurrentFcmToken] Error:', error?.message);
    return Response.json(
      { error: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
});