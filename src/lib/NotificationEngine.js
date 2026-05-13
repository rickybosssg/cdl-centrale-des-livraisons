/**
 * NotificationEngine — SOURCE UNIQUE pour toutes les notifications
 *
 * Gère : notification interne BDD + push FCM + badge + lecture/non-lu + deep link
 *
 * RÈGLES :
 * 1. Tout push passe par sendCdlNotification (backend)
 * 2. Toute notification interne passe par cette API
 * 3. Les badges se mettent à jour via subscribeToUnread()
 */

import { base44 } from '@/api/base44Client';

const ENGINE_VERSION = '1.0.0';

const NotificationEngine = {
  version: ENGINE_VERSION,

  /**
   * Envoyer une notification + push FCM en même temps
   * params: { user_email?, role?, title, body, type?, target_screen?, data? }
   */
  async send({ user_email, role, title, body, type = 'info', target_screen, target_entity_id, target_entity_type, data = {} }) {
    return base44.functions.invoke('sendCdlNotification', {
      user_email, role, title, body,
      data: { type, target_screen, target_entity_id, target_entity_type, notif_route: target_screen, ...data },
    });
  },

  /**
   * Envoyer uniquement une notification interne BDD (sans push FCM)
   */
  async createInternal({ destinataire_email, destinataire_role, titre, message, type = 'info', target_screen, target_entity_id, target_entity_type, notification_key }) {
    return base44.entities.Notification.create({
      destinataire_email, destinataire_role,
      titre, message, type, lue: false,
      target_screen, target_entity_id, target_entity_type, notification_key,
    });
  },

  /**
   * Récupérer les notifications de l'utilisateur courant
   */
  async getMyNotifications(email, limit = 50) {
    return base44.entities.Notification.filter({ destinataire_email: email }, '-created_date', limit);
  },

  /**
   * Marquer une notification comme lue
   */
  async markAsRead(notificationId) {
    return base44.entities.Notification.update(notificationId, { lue: true });
  },

  /**
   * Marquer toutes les notifications d'un utilisateur comme lues
   */
  async markAllAsRead(email) {
    const notifs = await base44.entities.Notification.filter({ destinataire_email: email, lue: false });
    await Promise.all(notifs.map(n => base44.entities.Notification.update(n.id, { lue: true })));
    return { count: notifs.length };
  },

  /**
   * Compter les non-lues (pour badge)
   */
  async countUnread(email) {
    const notifs = await base44.entities.Notification.filter({ destinataire_email: email, lue: false }, null, 100);
    return notifs.length;
  },

  /**
   * S'abonner aux nouvelles notifications en temps réel (pour badge live)
   * Retourne la fonction unsubscribe
   */
  subscribeToUnread(email, onChange) {
    return base44.entities.Notification.subscribe((event) => {
      if (
        event.data?.destinataire_email === email &&
        (event.type === 'create' || event.type === 'update')
      ) {
        onChange(event);
      }
    });
  },
};

export default NotificationEngine;