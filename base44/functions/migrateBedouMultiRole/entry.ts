/**
 * migrateBedouMultiRole — Migration des wallets Bedou vers le modèle multi-rôles
 *
 * Convertit les anciens champs :
 *   - solde → solde_global
 *   - solde_disponible → solde_disponible_global
 *   - gains_totaux → répartis vers gains_totaux_livreur/partenaire/commercial selon le rôle
 *   - depenses_totales → depenses_totales_client
 *   - balance_blocked → balance_blocked_commercial
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  const user = await base44.auth.me();
  if (!user || user.role !== 'admin') {
    return Response.json({ error: 'Admin requis' }, { status: 403 });
  }

  console.log('[MIGRATE_BEDOU] Starting migration...');

  const allBedou = await base44.asServiceRole.entities.Bedou.list(null, 1000);
  
  if (!allBedou || allBedou.length === 0) {
    return Response.json({ success: true, migrated: 0 });
  }

  let migrated = 0;
  let errors = 0;

  for (const bedou of allBedou) {
    try {
      if (bedou.solde_global !== undefined) {
        continue;
      }

      const updates: Record<string, any> = {};

      if (bedou.solde !== undefined) updates.solde_global = bedou.solde;
      if (bedou.solde_disponible !== undefined) updates.solde_disponible_global = bedou.solde_disponible;
      if (bedou.solde_bloque !== undefined) updates.solde_global = (updates.solde_global || 0) + (bedou.solde_bloque || 0);
      
      if (bedou.gains_totaux !== undefined) {
        if (bedou.role === 'livreur') updates.gains_totaux_livreur = bedou.gains_totaux;
        else if (bedou.role === 'partenaire') updates.gains_totaux_partenaire = bedou.gains_totaux;
        else if (bedou.role === 'commercial') updates.gains_totaux_commercial = bedou.gains_totaux;
      }

      if (bedou.depenses_totales !== undefined) updates.depenses_totales_client = bedou.depenses_totales;
      if (bedou.balance_blocked !== undefined) updates.balance_blocked_commercial = bedou.balance_blocked;

      await base44.asServiceRole.entities.Bedou.update(bedou.id, updates);
      migrated++;
    } catch (err) {
      errors++;
    }
  }

  return Response.json({ success: true, migrated, errors, total: allBedou.length });
});