import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * CDL — Modification du mode dispatch (ADMIN UNIQUEMENT)
 * Source de vérité unique : entité DispatchConfig en BDD.
 * Ne jamais mettre de valeur par défaut locale.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') {
      console.warn(`[DispatchMode] Tentative refusée : ${user.email} n'est pas admin`);
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { mode } = await req.json();
    if (!['auto', 'manuel'].includes(mode)) {
      return Response.json({ error: 'Mode invalide. Valeurs: auto | manuel' }, { status: 400 });
    }

    // Lire la config existante
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
      console.log(`[DispatchMode] Mode changé par admin ${user.email} : ${oldMode} → ${mode}`);
    } else {
      // Première initialisation uniquement
      config = await base44.asServiceRole.entities.DispatchConfig.create({
        mode,
        force_override: true,
        last_changed_by: user.email,
        last_changed_reason: `Initialisation par ${user.email}`,
        last_changed_at: new Date().toISOString(),
      });
      console.log(`[DispatchMode] Config initialisée par ${user.email} : ${mode}`);
    }

    return Response.json({ success: true, mode, config });
  } catch (error) {
    console.error('[DispatchMode] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});