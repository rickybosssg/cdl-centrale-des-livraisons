/**
 * setDispatchModeCanonical — ÉCRITURE OFFICIELLE ET UNIQUE DU MODE DISPATCH
 *
 * RÈGLE ABSOLUE :
 *   - source autorisée : "admin_click" ou "dispatch_v2_debug" UNIQUEMENT
 *   - toute autre source → BLOQUÉE + loggée avec stack complète
 *   - aucune écriture automatique de mode="auto" n'est possible via cette fonction
 *
 * Paramètres :
 *   mode   : "auto" | "manuel"
 *   source : "admin_click" | "dispatch_v2_debug"
 *   reason : string (optionnel)
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CANONICAL_KEY = 'GLOBAL';
const ALLOWED_SOURCES = ['admin_click', 'dispatch_v2_debug'];

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
      console.error(`[DISPATCH_CANONICAL_WRITE_BLOCKED] REFUSÉ: user=${user.email} role=${user.role} n'est pas admin`);
      return Response.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders });
    }

    const body = await req.json().catch(() => ({}));
    const rawMode = body.mode;
    const source = body.source || 'unknown';
    const reason = body.reason || '';

    // ── VALIDATION SOURCE ─────────────────────────────────────────────────────
    if (!ALLOWED_SOURCES.includes(source)) {
      const blocked = {
        blocked: true,
        reason: 'source_non_autorisee',
        source,
        allowed_sources: ALLOWED_SOURCES,
        attempted_by: user.email,
        timestamp: new Date().toISOString(),
        attempted_mode: rawMode,
      };
      console.error(`[DISPATCH_CANONICAL_WRITE_BLOCKED] FUNCTION_TRIED_TO_FORCE_AUTO | source=${source} | user=${user.email} | mode=${rawMode} | timestamp=${blocked.timestamp}`);
      console.error(`[MANUAL_MODE_PROTECTED] source non autorisée bloquée: ${source}`);
      return Response.json(blocked, { status: 403, headers: corsHeaders });
    }

    // ── VALIDATION MODE ───────────────────────────────────────────────────────
    const mode = rawMode === 'manuel' || rawMode === 'manual' ? 'manuel' : rawMode === 'auto' ? 'auto' : null;
    if (!mode) {
      return Response.json({ error: `Mode invalide: "${rawMode}". Valeurs: auto | manuel` }, { status: 400, headers: corsHeaders });
    }

    console.log(`[DISPATCH_CANONICAL_WRITE_ALLOWED] DEMANDE | admin=${user.email} | mode=${mode} | source=${source}`);

    // ── CHERCHER DOC CANONIQUE ────────────────────────────────────────────────
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
        last_changed_reason: reason || `${source}: ${user.email} → ${mode}`,
        last_changed_at: now,
      });
      console.log(`[DISPATCH_CANONICAL_WRITE_ALLOWED] SUCCÈS UPDATE | ${oldMode} → ${mode} | id=${canonical.id} | admin=${user.email} | source=${source} | timestamp=${now}`);
    } else {
      config = await base44.asServiceRole.entities.DispatchConfig.create({
        mode,
        mode_key: CANONICAL_KEY,
        force_override: true,
        last_changed_by: user.email,
        last_changed_reason: `Création canonique: ${source} par ${user.email}`,
        last_changed_at: now,
      });
      console.log(`[DISPATCH_CANONICAL_WRITE_ALLOWED] SUCCÈS CREATE | mode=${mode} | id=${config.id} | admin=${user.email} | source=${source} | timestamp=${now}`);
    }

    // ── SUPPRIMER LES PARASITES ───────────────────────────────────────────────
    if (parasites.length > 0) {
      console.warn(`[DISPATCH_CANONICAL_WRITE_ALLOWED] Suppression ${parasites.length} doc(s) parasite(s)`);
      for (const p of parasites) {
        await base44.asServiceRole.entities.DispatchConfig.delete(p.id).catch(() => {});
        console.warn(`[DISPATCH_CANONICAL_WRITE_ALLOWED] Parasite supprimé: id=${p.id} mode=${p.mode} mode_key=${p.mode_key || 'NONE'}`);
      }
    }

    return Response.json({ success: true, mode, config }, { headers: corsHeaders });
  } catch (error) {
    console.error('[DISPATCH_CANONICAL_WRITE_BLOCKED] ERROR:', error.message);
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});