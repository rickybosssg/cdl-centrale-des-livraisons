/**
 * DispatchEngineV2 — Moteur de dispatch centralisé (V2)
 *
 * SOURCE UNIQUE DE VÉRITÉ : entité DispatchConfig, champ "mode"
 * Valeurs autorisées : "auto" | "manuel" — RIEN D'AUTRE
 *
 * Règles absolues :
 * - jamais de fallback local
 * - jamais d'écriture automatique (seul admin peut écrire)
 * - si aucune config BDD → créer une seule config "auto" (init unique)
 * - si config existe → ne JAMAIS l'écraser
 */

import { base44 } from '@/api/base44Client';

// ── Types autorisés ────────────────────────────────────────────────────────
const VALID_MODES = ['auto', 'manuel'];

// ── Normalisation stricte ─────────────────────────────────────────────────
export function normalizeModeV2(raw) {
  if (raw === 'manuel' || raw === 'manual') return 'manuel';
  if (raw === 'auto') return 'auto';
  console.error(`[DISPATCH_V2_INVALID_MODE] Valeur inconnue: "${raw}" — rejeté, pas de fallback`);
  return null; // null = valeur invalide, ne pas appliquer
}

// ── Lire le mode depuis la BDD ─────────────────────────────────────────────
export async function getMode() {
  const configs = await base44.entities.DispatchConfig.list('-updated_date', 1);

  if (configs.length === 0) {
    // Aucune config → créer la config initiale "auto" (une seule fois)
    console.log('[DISPATCH_V2_MODE_WRITE] source=init | aucune config BDD → création config auto');
    const created = await base44.entities.DispatchConfig.create({
      mode: 'auto',
      force_override: false,
      last_changed_by: 'system_init',
      last_changed_reason: 'Initialisation automatique V2',
      last_changed_at: new Date().toISOString(),
    });
    console.log(`[DISPATCH_V2_MODE_WRITE] oldMode=null | newMode=auto | adminEmail=system_init | source=init | id=${created.id}`);
    return { mode: 'auto', id: created.id, config: created };
  }

  const cfg = configs[0];
  const normalized = normalizeModeV2(cfg.mode);
  if (!normalized) {
    // Mode invalide en BDD — logguer et retourner sans écraser
    console.error(`[DISPATCH_V2_MODE_WRITE] ⚠️ Mode invalide en BDD: "${cfg.mode}" | id=${cfg.id} — non écrasé`);
    return { mode: cfg.mode, id: cfg.id, config: cfg, invalid: true };
  }

  console.log(`[DISPATCH_V2] getMode → ${normalized} | id=${cfg.id} | last_changed_by=${cfg.last_changed_by || 'unknown'}`);
  return { mode: normalized, id: cfg.id, config: cfg };
}

// ── Écrire le mode (admin uniquement) ────────────────────────────────────
export async function setMode(newMode, adminEmail, reason) {
  if (!VALID_MODES.includes(newMode)) {
    console.error(`[DISPATCH_V2_MODE_WRITE] ❌ Mode invalide demandé: "${newMode}" — rejeté`);
    throw new Error(`Mode invalide: "${newMode}". Valeurs: auto | manuel`);
  }

  const configs = await base44.entities.DispatchConfig.list('-updated_date', 1);
  const now = new Date().toISOString();

  if (configs.length === 0) {
    // Pas de config → créer
    const created = await base44.entities.DispatchConfig.create({
      mode: newMode,
      force_override: true,
      last_changed_by: adminEmail,
      last_changed_reason: reason || `Créé par admin ${adminEmail}`,
      last_changed_at: now,
    });
    console.log(`[DISPATCH_V2_MODE_WRITE] oldMode=null | newMode=${newMode} | adminEmail=${adminEmail} | source=admin_action | id=${created.id} | timestamp=${now}`);
    return { mode: newMode, id: created.id, config: created };
  }

  const existing = configs[0];
  const oldMode = existing.mode;

  const updated = await base44.entities.DispatchConfig.update(existing.id, {
    mode: newMode,
    force_override: true,
    last_changed_by: adminEmail,
    last_changed_reason: reason || `Changé par admin ${adminEmail}`,
    last_changed_at: now,
  });

  console.log(`[DISPATCH_V2_MODE_WRITE] oldMode=${oldMode} | newMode=${newMode} | adminEmail=${adminEmail} | source=admin_action | id=${existing.id} | timestamp=${now}`);
  return { mode: newMode, id: existing.id, config: updated, oldMode };
}

// ── Vérifier si autoDispatch est autorisé ─────────────────────────────────
export async function isAutoDispatchAllowed() {
  const { mode } = await getMode();
  const allowed = mode === 'auto';
  if (!allowed) {
    console.log(`[DISPATCH_V2_AUTO_BLOCKED_MANUAL_MODE] autoDispatch bloqué — mode=${mode}`);
  }
  return allowed;
}

const DispatchEngineV2 = { getMode, setMode, isAutoDispatchAllowed, normalizeModeV2, VALID_MODES };
export default DispatchEngineV2;