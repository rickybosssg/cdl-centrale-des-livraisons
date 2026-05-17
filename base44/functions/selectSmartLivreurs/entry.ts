/**
 * CDL — selectSmartLivreurs v3 STUB
 *
 * ⚠️ DÉPRÉCIÉ — NE PAS MODIFIER
 * La sélection livreur est intégrée dans cdlDispatch (moteur unifié).
 * Ce fichier était utilisé par dispatchProgressif (lui-même déprécié).
 * Retourne une liste vide pour compatibilité.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({}));
  console.log('[selectSmartLivreurs] STUB — sélection intégrée dans cdlDispatch');
  return Response.json({
    livreurs: [],
    total: 0,
    courseId: body.courseId || '',
    note: 'DEPRECATED — use cdlDispatch',
  });
});