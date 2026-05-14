/**
 * getDispatchMode — LECTURE SEULE
 * 
 * Retourne l'état actuel du mode de dispatch.
 * Aucune logique métier, aucune fallback.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Lecture simple — premier document trouvé (un seul devrait exister)
    const modes = await base44.asServiceRole.entities.DispatchModeState.list('-updated_at', 1);
    const modeState = modes[0];
    
    if (!modeState) {
      console.log('[getDispatchMode] NO DOCUMENT FOUND — returning default auto');
      return Response.json({
        mode: 'auto',
        updated_by: null,
        updated_at: null,
        config_id: null,
      });
    }
    
    console.log(`[getDispatchMode] mode=${modeState.mode} | id=${modeState.id} | updated_at=${modeState.updated_at}`);
    
    return Response.json({
      mode: modeState.mode,
      updated_by: modeState.updated_by || null,
      updated_at: modeState.updated_at || null,
      config_id: modeState.id,
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      }
    });
  } catch (error) {
    console.error('[getDispatchMode] ERROR:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});