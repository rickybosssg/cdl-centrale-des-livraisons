/**
 * setDispatchMode — COMPATIBILITÉ DESCENDANTE
 *
 * Cette fonction délègue désormais vers setDispatchModeCanonical.
 * Elle est conservée pour les anciens appels mais force source="admin_click".
 *
 * ⚠️ Tout appel non-admin est loggé et refusé.
 * ⚠️ Tout appel depuis un contexte non-admin est bloqué.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CANONICAL_KEY = 'GLOBAL';

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
      console.error(`[DISPATCH_CANONICAL_WRITE_BLOCKED] setDispatchMode REFUSÉ: user=${user.email} role=${user.role} n'est pas admin`);
      return Response.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders });
    }

    const body = await req.json();
    const rawMode = body.mode;
    const mode = (rawMode === 'manual' || rawMode === 'manuel') ? 'manuel' : rawMode === 'auto' ? 'auto' : null;

    if (!mode) {
      return Response.json({ error: `Mode invalide: "${rawMode}". Valeurs: auto | manuel` }, { status: 400, headers: corsHeaders });
    }

    console.log(`[DISPATCH_CANONICAL_WRITE_ALLOWED] setDispatchMode (compat) | admin=${user.email} | mode=${mode} | delegating to canonical...`);

    // Déléguer vers la logique canonique directement (pas via invoke pour éviter double auth)
    const all = await base44.asServiceRole.entities.DispatchConfig.list('-updated_date', 50);
    const canonical = all.find(c => c.mode_key === CANONICAL_KEY);
    const parasites = all.filter(c => c.mode_key !== CANONICAL_KEY);

    const now = new Date().toISOString();
    let config;

    if (canonical) {
      const oldMode = canonical.mode;
      config = await base44.asServiceRole.entities.DispatchConfig.update(canonical.id, {
        mode,
        mode_key: CANONICAL_KEY,
        force_override: true,
        last_changed_by: user.email,
        last_changed_reason: body.reason || `setDispatchMode (compat): ${user.email} → ${mode}`,
        last_changed_at: now,
      });
      console.log(`[DISPATCH_CANONICAL_WRITE_ALLOWED] UPDATE: ${oldMode} → ${mode} | id=${canonical.id} | admin=${user.email} | timestamp=${now}`);
    } else {
      config = await base44.asServiceRole.entities.DispatchConfig.create({
        mode,
        mode_key: CANONICAL_KEY,
        force_override: true,
        last_changed_by: user.email,
        last_changed_reason: `Création canonique (compat): ${user.email}`,
        last_changed_at: now,
      });
      console.log(`[DISPATCH_CANONICAL_WRITE_ALLOWED] CREATE: mode=${mode} | id=${config.id} | admin=${user.email} | timestamp=${now}`);
    }

    // Supprimer les docs parasites
    if (parasites.length > 0) {
      console.warn(`[DISPATCH_CANONICAL_WRITE_ALLOWED] Suppression ${parasites.length} doc(s) parasite(s)`);
      for (const p of parasites) {
        await base44.asServiceRole.entities.DispatchConfig.delete(p.id).catch(() => {});
      }
    }

    return Response.json({ success: true, mode, config }, { headers: corsHeaders });
  } catch (error) {
    console.error('[DISPATCH_CANONICAL_WRITE_BLOCKED] setDispatchMode ERROR:', error.message);
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});