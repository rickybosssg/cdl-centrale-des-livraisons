/**
 * CDL — Helper alertes WhatsApp (côté client)
 * Toutes les fonctions sont NON BLOQUANTES : jamais de throw, jamais d'attente.
 * Un échec WhatsApp ne doit jamais interrompre un flux métier.
 */
import { base44 } from '@/api/base44Client';

// Numéros admin CDL (lus depuis les settings ou valeurs par défaut)
export const ADMIN_WHATSAPP_NUMBERS = [
  // Ajouter les numéros admin ici ou les charger depuis la DB
];

/**
 * Fonction centrale — appeler partout sans await bloquant
 * Usage: triggerWhatsAppNotification({ eventType, recipientPhone, messageText, ... })
 */
export function triggerWhatsAppNotification({
  eventType,
  recipientRole = '',
  recipientName = '',
  recipientPhone,
  messageText,
  entityId = null,
  entityType = null,
  priority = 'normal',
}) {
  if (!recipientPhone) {
    console.warn('[WA] Numéro absent, skip:', eventType, recipientRole);
    return;
  }
  if (!messageText) {
    console.warn('[WA] Message absent, skip:', eventType);
    return;
  }

  // Fire & forget — non bloquant
  base44.functions.invoke('sendWhatsAppAlert', {
    eventType,
    recipientRole,
    recipientName,
    recipientPhone,
    messageText,
    entityId,
    entityType,
    priority,
  }).catch(err => {
    console.error('[WA] Erreur envoi (non bloquant):', eventType, err?.message);
  });
}

// ─── Templates de messages ──────────────────────────────────────────────────

export function waMsgDriverProfileSubmitted({ nom, telephone, zone }) {
  return `Bonjour Admin CDL,\nUne nouvelle demande de profil livreur vient d'être soumise.\nNom : ${nom}\nTéléphone : ${telephone}\nVille/Zone : ${zone || 'Non précisée'}\nOuvre CDL pour valider ou refuser la demande.`;
}

export function waMsgManualDispatchCourseCreated({ nomClient, depart, arrivee, prix }) {
  return `Nouvelle course en attente de dispatch manuel.\nClient : ${nomClient}\nDépart : ${depart}\nArrivée : ${arrivee}\nMontant : ${prix} F CFA\nMerci d'assigner un livreur rapidement.`;
}

export function waMsgDriverCourseAssigned({ nomLivreur, depart, arrivee, prix }) {
  return `Bonjour ${nomLivreur},\nUne nouvelle course vous a été attribuée.\nDépart : ${depart}\nArrivée : ${arrivee}\nMontant : ${prix} F CFA\nConnectez-vous à CDL pour accepter et commencer la course.`;
}

export function waMsgCourseAcceptedByDriver({ nomClient }) {
  return `Bonjour ${nomClient},\nVotre course a été acceptée par un livreur.\nLe trajet va commencer sous peu.\nOuvrez CDL pour suivre l'évolution de votre course.`;
}

export function waMsgBedouTopupRequested({ nom, role, montant }) {
  return `Nouvelle demande de recharge Bedou.\nUtilisateur : ${nom}\nRôle : ${role}\nMontant : ${montant} F CFA\nMerci de vérifier la preuve de paiement dans CDL.`;
}

export function waMsgBedouWithdrawRequested({ nom, role, montant }) {
  return `Nouvelle demande de retrait Bedou.\nUtilisateur : ${nom}\nRôle : ${role}\nMontant : ${montant} F CFA\nMerci de traiter la demande rapidement.`;
}

export function waMsgCourseCancelledAdmin({ nomClient, referenceCourse }) {
  return `Une course a été annulée par le client.\nClient : ${nomClient}\nCourse : ${referenceCourse}\nVérifiez les éventuels frais d'annulation.`;
}

export function waMsgCourseCancelledDriver({ referenceCourse }) {
  return `La course ${referenceCourse} a été annulée par le client.`;
}

export function waMsgCourseCompletedClient({ nomClient }) {
  return `Bonjour ${nomClient},\nVotre course a été marquée comme terminée.\nMerci d'avoir utilisé CDL.`;
}

export function waMsgCourseCompletedAdmin({ nomClient, nomLivreur, prix }) {
  return `Une course vient d'être terminée.\nClient : ${nomClient}\nLivreur : ${nomLivreur}\nMontant : ${prix} F CFA`;
}