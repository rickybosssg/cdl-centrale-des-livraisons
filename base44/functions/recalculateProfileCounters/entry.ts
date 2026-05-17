/**
 * CDL — recalculateProfileCounters v3 STUB
 *
 * ⚠️ DÉPRÉCIÉ — NE PAS MODIFIER
 * Redirige vers getAdminCounts (source unique des compteurs profils).
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  console.log('[recalculateProfileCounters] STUB → redirection vers getAdminCounts');
  const base44 = createClientFromRequest(req);

  const profiles = await base44.asServiceRole.entities.UserProfile.filter({ deleted: false });
  const counts = {};
  for (const p of profiles) {
    const key = `${p.profile_type}s_total`;
    counts[key] = (counts[key] || 0) + 1;
    if (p.status === 'actif') counts[`${p.profile_type}s_actifs`] = (counts[`${p.profile_type}s_actifs`] || 0) + 1;
    if (p.status === 'en_attente') counts[`${p.profile_type}s_en_attente`] = (counts[`${p.profile_type}s_en_attente`] || 0) + 1;
  }

  return Response.json({ success: true, counts, timestamp: new Date().toISOString(), note: 'use getAdminCounts for full details' });
});