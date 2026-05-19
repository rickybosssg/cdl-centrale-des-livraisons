/**
 * CDL — Helper alertes WhatsApp via Respond.io (Push to DB / Contact Sync)
 * Message universel unique — Respond.io envoie le même message pour tout événement.
 * Toutes les fonctions sont NON BLOQUANTES.
 */
import { base44 } from '@/api/base44Client';

const UNIVERSAL_WA_MESSAGE = `🚚 CDL - Centrale des Livraisons

Bonjour,
Une nouvelle activité nécessite votre attention sur votre compte CDL.

📲 Veuillez ouvrir votre application pour voir les détails.

Merci,
L'équipe CDL`;

/**
 * Fonction centrale — toujours non bloquante.
 * messageText est ignoré : on utilise toujours le message universel CDL.
 */
export function triggerWhatsAppNotification({
  eventType,
  recipientRole = '',
  recipientName = '',
  recipientPhone,
  entityId = null,
  entityType = null,
  priority = 'normal',
}) {
  base44.functions.invoke('sendWhatsAppAlert', {
    eventType,
    recipientRole,
    recipientName,
    recipientPhone: recipientPhone || null,
    messageText: UNIVERSAL_WA_MESSAGE,
    entityId,
    entityType,
    priority,
  }).catch(err => {
    console.error('[WA] Erreur (non bloquant):', eventType, err?.message);
  });
}

// Stubs supprimés — message universel unique géré par triggerWhatsAppNotification