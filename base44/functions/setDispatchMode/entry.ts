/**
 * setDispatchMode — ADMIN UNIQUEMENT
 *
 * Document canonique FIXE : on cherche DispatchConfig avec mode_key="GLOBAL"
 * S'il n'existe pas, on le crée avec cet identifiant logique.
 * Tous les reads/writes pointent TOUJOURS vers le même doc.
 *
 * ⚠️ Aucun autre code n'est autorisé à écrire mode=auto automatiquement.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CANONICAL_KEY = 'GLOBAL'; // valeur unique pour identifier le doc canonique

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
      console.warn(`[DISPATCH_V2_MODE_WRITE] REFUSÉ: ${user.email} n'est pas admin`);
      return Response.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders });
    }

    const body = await req.json();
    const rawMode = body.mode;
    const mode = (rawMode === 'manual' || rawMode === 'manuel') ? 'manuel' : rawMode === 'auto' ? 'auto' : null;

    if (!mode) {
      return Response.json({ error: `Mode invalide: "${rawMode}". Valeurs: auto | manuel` }, { status: 400, headers: corsHeaders });
    }

    console.log(`[DISPATCH_V2_MODE_WRITE] DEMANDE: admin=${user.email} | mode=${mode}`);

    // ── Chercher le document canonique ────────────────────────────────────
    const all = await base44.asServiceRole.entities.DispatchConfig.list('-updated_date', 50);
    const canonical = all.find(c => c.mode_key === CANONICAL_KEY);

    const now = new Date().toISOString();
    let config;

    if (canonical) {
      const oldMode = canonical.mode;
      config = await base44.asServiceRole.entities.DispatchConfig.update(canonical.id, {
        mode,
        mode_key: CANONICAL_KEY,
        force_override: true,
        last_changed_by: user.email,
        last_changed_reason: body.reason || `Admin ${user.email} → ${mode}`,
        last_changed_at: now,
      });
      console.log(`[DISPATCH_V2_MODE_WRITE] SUCCÈS: ${oldMode} → ${mode} | id=${canonical.id} | admin=${user.email} | timestamp=${now}`);
    } else {
      // Créer le doc canonique (première fois seulement)
      config = await base44.asServiceRole.entities.DispatchConfig.create({
        mode,
        mode_key: CANONICAL_KEY,
        force_override: true,
        last_changed_by: user.email,
        last_changed_reason: `Initialisation canonique par ${user.email}`,
        last_changed_at: now,
      });
      console.log(`[DISPATCH_V2_MODE_WRITE] CRÉÉ (canonique): mode=${mode} | id=${config.id} | admin=${user.email} | timestamp=${now}`);
    }

    // ── Supprimer les docs non-canoniques parasites ───────────────────────
    const parasites = all.filter(c => c.mode_key !== CANONICAL_KEY);
    if (parasites.length > 0) {
      console.log(`[DISPATCH_V2_MODE_WRITE] Suppression de ${parasites.length} doc(s) parasite(s)`);
      for (const p of parasites) {
        await base44.asServiceRole.entities.DispatchConfig.delete(p.id).catch(() => {});
        console.log(`[DISPATCH_V2_MODE_WRITE] Parasite supprimé: id=${p.id} mode=${p.mode}`);
      }
    }

    return Response.json({ success: true, mode, config }, { headers: corsHeaders });
  } catch (error) {
    console.error('[DISPATCH_V2_MODE_WRITE] ERREUR:', error.message);
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});