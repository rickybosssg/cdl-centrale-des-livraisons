/**
 * DispatchEngineV2 — UTILITAIRES LECTURE SEULE
 *
 * RÈGLE ABSOLUE : aucune écriture ici. Aucun fallback vers 'auto'.
 * Les écritures passent UNIQUEMENT par setDispatchModeCanonical (backend).
 */

import { base44 } from '@/api/base44Client';

export const CANONICAL_KEY = 'GLOBAL';

export function normalizeModeV2(raw) {
  if (raw === 'manuel' || raw === 'manual') return 'manuel';
  if (raw === 'auto') return 'auto';
  return null; // invalide — jamais de fallback auto
}

/**
 * Lire le document canonique. LECTURE SEULE.
 * Ne crée JAMAIS de document. Ne fait JAMAIS de fallback vers 'auto'.
 * Retourne { config: null, isCanonical: false } si aucun doc GLOBAL.
 */
export async function getCanonicalConfig() {
  const all = await base44.entities.DispatchConfig.list('-updated_date', 50);
  const canonical = all.find(c => c.mode_key === CANONICAL_KEY);

  if (!canonical) {
    console.warn(`[DISPATCH_CANONICAL_READ] getCanonicalConfig — Aucun doc GLOBAL. Docs: ${all.length}. IDs: ${all.map(c => c.id).join(',')}`);
    // ⚠️ JAMAIS de fallback sur all[0] — on retourne null
    return { config: null, isCanonical: false, allDocs: all };
  }

  console.log(`[DISPATCH_CANONICAL_READ] getCanonicalConfig — mode=${canonical.mode} | id=${canonical.id}`);
  return { config: canonical, isCanonical: true, allDocs: all };
}

const DispatchEngineV2 = { normalizeModeV2, getCanonicalConfig, CANONICAL_KEY };
export default DispatchEngineV2;