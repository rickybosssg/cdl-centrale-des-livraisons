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

// Exports conservés pour compatibilité avec les appels existants (valeur ignorée)
export const waMsgCourseCreatedClient = () => UNIVERSAL_WA_MESSAGE;
export const waMsgDriverCourseAssigned = () => UNIVERSAL_WA_MESSAGE;
export const waMsgCourseAcceptedByDriver = () => UNIVERSAL_WA_MESSAGE;
export const waMsgCourseAcceptedDriver = () => UNIVERSAL_WA_MESSAGE;
export const waMsgCourseCancelledClient = () => UNIVERSAL_WA_MESSAGE;
export const waMsgCourseCancelledDriver = () => UNIVERSAL_WA_MESSAGE;
export const waMsgCourseCompletedClient = () => UNIVERSAL_WA_MESSAGE;
export const waMsgCourseCompletedDriver = () => UNIVERSAL_WA_MESSAGE;
export const waMsgBedouTopupRequested = () => UNIVERSAL_WA_MESSAGE;
export const waMsgBedouWithdrawRequested = () => UNIVERSAL_WA_MESSAGE;
export const waMsgDriverProfileSubmitted = () => UNIVERSAL_WA_MESSAGE;