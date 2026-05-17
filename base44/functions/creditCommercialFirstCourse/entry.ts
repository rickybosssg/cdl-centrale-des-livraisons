/**
 * CDL — creditCommercialFirstCourse v3 STUB
 *
 * ⚠️ DÉPRÉCIÉ — NE PAS MODIFIER
 * DOUBLON CRITIQUE avec bedouEngine.bonus_commercial et processFirstCourse.
 * Les trois fonctions modifiaient directement Bedou.balance_blocked hors bedouEngine.
 * Seul bedouEngine.bonus_commercial est la source officielle.
 *
 * Ce fichier ne fait rien pour éviter le double-crédit Bedou.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({}));
  console.log('[creditCommercialFirstCourse] STUB (DÉPRÉCIÉ) — doublon supprimé | bonus_commercial géré par bedouEngine');
  return Response.json({
    success: false,
    skipped: true,
    reason: 'DEPRECATED — use bedouEngine.action=bonus_commercial via processFirstCourse',
    note: 'This function is deprecated to avoid double-credit on Bedou balance_blocked',
  });
});