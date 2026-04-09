/**
 * CDL — Helper alertes WhatsApp via Respond.io (Push to DB / Contact Sync)
 * Toutes les fonctions sont NON BLOQUANTES — jamais d'await obligatoire.
 */
import { base44 } from '@/api/base44Client';

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
  if (!messageText) return;
  base44.functions.invoke('sendWhatsAppAlert', {
    eventType,
    recipientRole,
    recipientName,
    recipientPhone: recipientPhone || null,
    messageText,
    entityId,
    entityType,
    priority,
  }).catch(err => {
    console.error('[WA] Erreur (non bloquant):', eventType, err?.message);
  });
}

// ─── Templates Phase 1 ──────────────────────────────────────────────────────

// 1. Création course (client)
export function waMsgCourseCreatedClient() {
  return `📦 CDL - Centrale des Livraisons\n\nNouvelle activité détectée !\n\nVotre demande est en cours de traitement.\n\n🔍 Recherche d'un livreur en cours...\n⏱ Temps estimé : quelques instants\n\n📲 Vous serez notifié dès qu'un livreur accepte.\n\nMerci pour votre confiance 🙏`;
}

// 2. Course assignée — livreur
export function waMsgDriverCourseAssigned() {
  return `🚨 Nouvelle course disponible !\n\n📍 Une course vient de vous être attribuée.\n\n👉 Ouvrez l'application CDL pour accepter ou refuser.\n\n💰 Gagnez de l'argent maintenant !`;
}

// 3. Course acceptée — client
export function waMsgCourseAcceptedByDriver() {
  return `✅ Un livreur a accepté votre course !\n\n🛵 Il est en route vers vous.\n\n📍 Suivez votre livraison en direct dans l'application.\n\nMerci de votre confiance 🙏`;
}

// 3. Course acceptée — livreur
export function waMsgCourseAcceptedDriver() {
  return `📦 Course confirmée !\n\n👉 Dirigez-vous vers le point de départ.\n\n📍 Respectez les instructions client.\n\nBonne mission 💪`;
}

// 4. Course annulée — client
export function waMsgCourseCancelledClient() {
  return `❌ Votre course a été annulée.\n\n📞 Contactez le support si nécessaire.`;
}

// 4. Course annulée — livreur
export function waMsgCourseCancelledDriver() {
  return `❌ La course a été annulée.\n\n👉 Retour à l'accueil.`;
}

// 5. Course terminée — client
export function waMsgCourseCompletedClient() {
  return `🏁 Livraison terminée !\n\n🙏 Merci d'avoir utilisé CDL.\n\n⭐ N'hésitez pas à nous recommander.`;
}

// 5. Course terminée — livreur
export function waMsgCourseCompletedDriver() {
  return `💰 Course terminée !\n\nVotre gain a été ajouté.\n\n🚀 Continuez pour gagner plus.`;
}

// 6. Recharge Bedou — client/livreur
export function waMsgBedouTopupRequested() {
  return `💰 Recharge en cours...\n\nVotre demande de recharge Bedou est en traitement.\n\n⏳ Veuillez patienter.`;
}

// 7. Retrait Bedou — driver/client
export function waMsgBedouWithdrawRequested() {
  return `💸 Demande de retrait reçue !\n\nVotre retrait est en cours de traitement.\n\n⏳ Patientez quelques instants.`;
}

// 8. Nouveau profil livreur — admin
export function waMsgDriverProfileSubmitted() {
  return `🛠 Nouvelle demande livreur !\n\nUn utilisateur a soumis un profil livreur.\n\n👉 Vérifiez et validez dans l'admin CDL.`;
}