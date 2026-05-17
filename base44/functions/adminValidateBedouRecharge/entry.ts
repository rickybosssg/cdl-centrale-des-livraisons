/**
 * CDL — adminValidateBedouRecharge v4 STUB
 *
 * ⚠️ DÉPRÉCIÉ — NE PAS MODIFIER
 * Redirige vers bedouEngine.valider_recharge (source unique Bedou).
 *
 * RISQUE ÉLIMINÉ : ce fichier dupliquait le crédit Bedou hors bedouEngine,
 * créant un risque de double-crédit si appelé en parallèle avec bedouEngine.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const { request_id, action, comment } = body;

  console.log('[adminValidateBedouRecharge] STUB → redirection vers bedouEngine');

  if (!request_id || !action) {
    return Response.json({ error: 'request_id et action requis' }, { status: 400, headers: CORS_HEADERS });
  }

  const bedouAction = action === 'refuse' ? 'refuser_recharge' : 'valider_recharge';

  const result = await base44.asServiceRole.functions.invoke('bedouEngine', {
    action: bedouAction,
    demande_id: request_id,
    ...(comment ? { motif: comment } : {}),
  });

  return Response.json(
    result?.data || { success: true, redirected: true },
    { headers: CORS_HEADERS }
  );
});