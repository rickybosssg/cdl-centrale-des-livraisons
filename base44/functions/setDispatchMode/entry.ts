import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * CDL — Modification du mode dispatch (ADMIN UNIQUEMENT)
 * Source de vérité unique : entité DispatchConfig en BDD.
 * Ne jamais mettre de valeur par défaut locale.
 */
Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    if (user.role !== 'admin') {
      console.warn(`[DISPATCH_MODE_WRITE] Refusé : ${user.email} n'est pas admin`);
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403, headers: corsHeaders });
    }

    const body = await req.json();
    const rawMode = body.mode;

    // Normaliser : accepter "manual" (spec) et "manuel" (legacy) → stocké en "manuel"
    const mode = rawMode === 'manual' ? 'manuel' : rawMode;

    console.log(`[DISPATCH_MODE_UPDATE_START] admin=${user.email} | raw_mode=${rawMode} | normalized_mode=${mode}`);

    if (!['auto', 'manuel'].includes(mode)) {
      return Response.json({ error: 'Mode invalide. Valeurs: auto | manual | manuel' }, { status: 400, headers: corsHeaders });
    }

    // Lire la config existante (service role pour garantir la lecture)
    const configs = await base44.asServiceRole.entities.DispatchConfig.list('-updated_date', 1);

    let config;
    if (configs.length > 0) {
      const oldMode = configs[0].mode;
      config = await base44.asServiceRole.entities.DispatchConfig.update(configs[0].id, {
        mode,
        force_override: true,
        last_changed_by: user.email,
        last_changed_reason: `Changé manuellement par admin ${user.email}`,
        last_changed_at: new Date().toISOString(),
      });
      console.log(`[DISPATCH_MODE_UPDATE_SUCCESS] BDD mise à jour : ${oldMode} → ${mode} | id=${configs[0].id} | admin=${user.email}`);
    } else {
      config = await base44.asServiceRole.entities.DispatchConfig.create({
        mode,
        force_override: true,
        last_changed_by: user.email,
        last_changed_reason: `Initialisation par ${user.email}`,
        last_changed_at: new Date().toISOString(),
      });
      console.log(`[DISPATCH_MODE_UPDATE_SUCCESS] Config initialisée : ${mode} | id=${config?.id} | admin=${user.email}`);
    }

    return Response.json({ success: true, mode, config }, { headers: corsHeaders });
  } catch (error) {
    console.error('[DISPATCH_MODE_WRITE] ❌ Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});