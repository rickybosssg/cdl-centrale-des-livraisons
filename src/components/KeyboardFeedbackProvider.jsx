/**
 * KeyboardFeedbackProvider — Couche UX globale, non intrusive
 *
 * Écoute les événements 'input' en phase de capture sur document.
 * S'applique à tous les <input> et <textarea> sauf :
 *   - type="hidden", "file", "checkbox", "radio", "range", "color", "submit", "reset"
 *   - attribut data-no-fx
 * Ne modifie jamais les valeurs, ne bloque jamais les événements.
 */

import { useEffect } from 'react';
import { triggerKeyFeedback } from '@/lib/keyboardFeedback';

const SKIP_TYPES = new Set(['hidden', 'file', 'checkbox', 'radio', 'range', 'color', 'submit', 'reset', 'button']);

export default function KeyboardFeedbackProvider() {
  useEffect(() => {
    const handler = (e) => {
      try {
        const el = e.target;
        if (!el) return;
        const tag = el.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') return;
        if (SKIP_TYPES.has(el.type)) return;
        if (el.dataset?.noFx !== undefined) return;
        // Ne pas déclencher si la valeur n'a pas changé (ex: paste sans modif)
        triggerKeyFeedback(el);
      } catch (_) {}
    };

    document.addEventListener('input', handler, { capture: true, passive: true });
    return () => document.removeEventListener('input', handler, { capture: true });
  }, []);

  return null;
}