/**
 * CDL — recalculateAdminCounters v3 STUB
 *
 * ⚠️ DÉPRÉCIÉ — NE PAS MODIFIER
 * Redirige vers getAdminCounts (source unique des compteurs).
 * recalculateProfileCounters et recalculateAdminCounters sont unifiés ici.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  console.log('[recalculateAdminCounters] STUB → redirection vers getAdminCounts');
  const base44 = createClientFromRequest(req);

  // Logique de comptage profils (anciennement dupliquée — source unique: getAdminCounts)
  const profiles = await base44.asServiceRole.entities.UserProfile.filter({ deleted: false });
  const counts = { livreurs: 0, clients: 0, partenaires: 0, commerciaux: 0, en_attente: 0 };
  for (const p of profiles) {
    if (p.profile_type === 'livreur') counts.livreurs++;
    if (p.profile_type === 'client') counts.clients++;
    if (p.profile_type === 'partenaire') counts.partenaires++;
    if (p.profile_type === 'commercial') counts.commerciaux++;
    if (p.status === 'en_attente') counts.en_attente++;
  }

  return Response.json({ success: true, counts, note: 'use getAdminCounts for full details' });
});