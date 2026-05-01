/**
 * cleanupDuplicateFcmTokens — Admin function to remove all duplicate tokens
 * Keeps only the NEWEST token per token value
 * Marks older duplicates as inactive
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // ADMIN ONLY
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin only' }, { status: 403 });
    }

    console.log('[cleanupDuplicateFcmTokens] START — cleaning duplicates');

    // Get ALL tokens
    const allTokens = await base44.asServiceRole.entities.FcmToken.list('-registered_at', 10000);
    console.log(`[cleanupDuplicateFcmTokens] Total tokens: ${allTokens.length}`);

    // Group by token value
    const groupedByToken = {};
    for (const record of allTokens) {
      if (!groupedByToken[record.token]) {
        groupedByToken[record.token] = [];
      }
      groupedByToken[record.token].push(record);
    }

    let totalDuplicates = 0;
    let totalRemoved = 0;

    // For each token value, keep newest, mark others as inactive
    for (const tokenValue in groupedByToken) {
      const records = groupedByToken[tokenValue];
      if (records.length <= 1) continue;

      console.log(`[cleanupDuplicateFcmTokens] Token ${tokenValue.slice(0, 20)}... has ${records.length} duplicates`);
      totalDuplicates += records.length - 1;

      // Sort by registered_at DESC (newest first)
      records.sort((a, b) => new Date(b.registered_at) - new Date(a.registered_at));
      
      // Keep first (newest), mark rest as inactive
      const newest = records[0];
      for (let i = 1; i < records.length; i++) {
        const oldRecord = records[i];
        try {
          await base44.asServiceRole.entities.FcmToken.update(oldRecord.id, {
            is_active: false,
          });
          console.log(`[cleanupDuplicateFcmTokens] Marked inactive: ${oldRecord.id}`);
          totalRemoved++;
        } catch (e) {
          console.error(`[cleanupDuplicateFcmTokens] Error marking ${oldRecord.id}:`, e.message);
        }
      }
    }

    console.log(`[cleanupDuplicateFcmTokens] COMPLETE — ${totalRemoved} duplicates marked inactive (${totalDuplicates} total duplicates found)`);

    return Response.json({
      success: true,
      totalDuplicates,
      marked_inactive: totalRemoved,
      message: `Cleaned ${totalRemoved} duplicate tokens`
    });

  } catch (error) {
    console.error('[cleanupDuplicateFcmTokens] Error:', error?.message);
    return Response.json(
      { error: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
});