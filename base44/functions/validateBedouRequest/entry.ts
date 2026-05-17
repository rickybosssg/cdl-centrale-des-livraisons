/**
 * CDL — validateBedouRequest v4 STUB
 *
 * ⚠️ DÉPRÉCIÉ — NE PAS MODIFIER
 * Redirige vers bedouEngine (source unique Bedou).
 *
 * RISQUE ÉLIMINÉ : ce fichier dupliquait la logique de crédit Bedou
 * présente dans bedouEngine.valider_recharge et adminValidateBedouRecharge.
 * Toute validation passe maintenant exclusivement par bedouEngine.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Non authentifié' }, { status: 401 });
  if (user.role !== 'admin') return Response.json({ error: 'Admin requis' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { request_id, type, action, motif_refus } = body;

  console.log('[validateBedouRequest] STUB → redirection vers bedouEngine');

  if (!request_id || !type || !action) {
    return Response.json({ error: 'request_id, type et action requis' }, { status: 400 });
  }

  const bedouAction = action === 'refuser'
    ? (type === 'recharge' ? 'refuser_recharge' : 'refuser_retrait')
    : (type === 'recharge' ? 'valider_recharge' : 'valider_retrait');

  const result = await base44.asServiceRole.functions.invoke('bedouEngine', {
    action: bedouAction,
    demande_id: request_id,
    ...(motif_refus ? { motif: motif_refus } : {}),
  });

  return Response.json(result?.data || { success: true, redirected: true });
});