/**
 * getDispatchModeCanonical — LECTURE OFFICIELLE DU MODE DISPATCH
 *
 * Source unique de vérité. Toutes les fonctions backend doivent utiliser ce helper.
 * Ne crée JAMAIS de document. Ne fait JAMAIS de fallback vers 'auto'.
 *
 * Retourne : { mode: 'auto'|'manuel'|null, config: {...}|null, isCanonical: boolean, totalDocs: number }
 *
 * Si mode=null → aucun doc GLOBAL trouvé → toute écriture auto doit être BLOQUÉE.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CANONICAL_KEY = 'GLOBAL';

export async function getDispatchModeCanonical(base44) {
  const allConfigs = await base44.asServiceRole.entities.DispatchConfig.list('-updated_date', 50).catch(() => []);
  const canonical = allConfigs.find(c => c.mode_key === CANONICAL_KEY);

  if (!canonical) {
    console.warn(`[DISPATCH_CANONICAL_READ] ⚠️ Aucun doc mode_key=GLOBAL trouvé | totalDocs=${allConfigs.length} | ids=${allConfigs.map(c=>c.id).join(',')}`);
    return { mode: null, config: null, isCanonical: false, totalDocs: allConfigs.length };
  }

  const mode = canonical.mode === 'manuel' ? 'manuel' : canonical.mode === 'auto' ? 'auto' : null;
  console.log(`[DISPATCH_CANONICAL_READ] mode=${mode} | id=${canonical.id} | last_changed_by=${canonical.last_changed_by || '?'} | last_changed_at=${canonical.last_changed_at || '?'}`);
  return { mode, config: canonical, isCanonical: true, totalDocs: allConfigs.length };
}

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  try {
    const base44 = createClientFromRequest(req);
    const result = await getDispatchModeCanonical(base44);
    return Response.json(result, { headers: corsHeaders });
  } catch (error) {
    console.error('[DISPATCH_CANONICAL_READ] ERROR:', error.message);
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});