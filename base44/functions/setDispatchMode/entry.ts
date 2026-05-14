/**
 * setDispatchMode — ÉCRITURE UNIQUE ET SÉCURISÉE
 * 
 * SEUL admin peut changer le mode.
 * AUCUNE autre fonction ne peut écrire dans DispatchModeState.
 * 
 * LOGS:
 *   [DISPATCH_MODE_WRITE_ALLOWED] — admin autorisé
 *   [DISPATCH_MODE_WRITE_BLOCKED] — non-admin ou source invalide
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // VERROU: admin-only
    if (!user) {
      console.error('[DISPATCH_MODE_WRITE_BLOCKED] Unauthorized');
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }

    if (user.role !== 'admin') {
      console.error(`[DISPATCH_MODE_WRITE_BLOCKED] user=${user.email} role=${user.role} n'est pas admin`);
      return Response.json({ error: 'Forbidden — admin only' }, { status: 403, headers: corsHeaders });
    }

    const body = await req.json();
    const rawMode = body.mode;
    
    // Validation stricte
    if (!['auto', 'manuel'].includes(rawMode)) {
      return Response.json({ 
        error: `Mode invalide: "${rawMode}". Valeurs acceptées: auto | manuel` 
      }, { status: 400, headers: corsHeaders });
    }

    const now = new Date().toISOString();

    // Vérifier s'il existe déjà un document
    const existing = await base44.asServiceRole.entities.DispatchModeState.list('-updated_at', 1);

    let modeState;
    if (existing.length > 0) {
      // UPDATE — un seul document doit exister
      const oldMode = existing[0].mode;
      modeState = await base44.asServiceRole.entities.DispatchModeState.update(existing[0].id, {
        mode: rawMode,
        updated_by: user.email,
        updated_at: now,
      });
      console.log(`[DISPATCH_MODE_WRITE_ALLOWED] UPDATE: ${oldMode} → ${rawMode} | admin=${user.email} | id=${existing[0].id}`);
    } else {
      // CREATE — premier document
      modeState = await base44.asServiceRole.entities.DispatchModeState.create({
        mode: rawMode,
        updated_by: user.email,
        updated_at: now,
      });
      console.log(`[DISPATCH_MODE_WRITE_ALLOWED] CREATE: mode=${rawMode} | admin=${user.email} | id=${modeState.id}`);
    }

    return Response.json({
      success: true,
      mode: modeState.mode,
      updated_by: modeState.updated_by,
      updated_at: modeState.updated_at,
      config_id: modeState.id,
    }, { 
      headers: {
        ...corsHeaders,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      }
    });

  } catch (error) {
    console.error('[DISPATCH_MODE_WRITE_BLOCKED] ERROR:', error.message);
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});