/**
 * DispatchEngineV2 — SOURCE UNIQUE DE VÉRITÉ
 *
 * Règle absolue : un seul document DispatchConfig identifié par mode_key="GLOBAL"
 * Tous les reads/writes pointent vers CE document uniquement.
 * Aucune écriture automatique n'est autorisée ici.
 */

import { base44 } from '@/api/base44Client';

export const CANONICAL_KEY = 'GLOBAL';

export function normalizeModeV2(raw) {
  if (raw === 'manuel' || raw === 'manual') return 'manuel';
  if (raw === 'auto') return 'auto';
  return null; // invalide
}

/**
 * Lire le document canonique.
 * NE CRÉE JAMAIS de document — c'est le rôle de setDispatchMode (backend).
 */
export async function getCanonicalConfig() {
  const all = await base44.entities.DispatchConfig.list('-updated_date', 50);
  const canonical = all.find(c => c.mode_key === CANONICAL_KEY);
  
  if (!canonical) {
    // Pas de doc canonique — on prend le plus récent comme fallback lecture seule
    const fallback = all[0] || null;
    console.warn(`[DISPATCH_V2] Aucun doc canonique (mode_key=GLOBAL). Docs totaux: ${all.length}. Fallback: ${fallback?.id || 'aucun'}`);
    return { config: fallback, isCanonical: false, allDocs: all };
  }

  return { config: canonical, isCanonical: true, allDocs: all };
}

const DispatchEngineV2 = { normalizeModeV2, getCanonicalConfig, CANONICAL_KEY };
export default DispatchEngineV2;