/**
 * notificationRouter.js — CDL v2
 * Deep-link centralisé pour toutes les notifications.
 *
 * Priorité de résolution :
 * 1. target_screen (champ explicite) → route directe
 * 2. data.type (event_type précis) → route exacte
 * 3. target_entity_type + target_entity_id → route entité
 * 4. Heuristique titre + rôle → fallback
 */

// ── Routes précises par event_type ────────────────────────────────────────────
const EVENT_TYPE_ROUTES = {
  // Bedou
  bedou_recharge_request:    '/gestion-bedou',
  bedou_recharge_approved:   '/mon-bedou',
  bedou_recharge_rejected:   '/mon-bedou',
  bedou_withdrawal_request:  '/gestion-bedou',
  bedou_withdrawal_approved: '/mon-bedou',
  bedou_withdrawal_rejected: '/mon-bedou',
  // Profils
  new_profile_request:       '/gestion-profils',
  profile_pending_review:    '/gestion-profils',
  profile_validated:         '/settings',
  profile_refused:           '/settings',
  profile_suspended:         '/settings',
  // Marketplace
  new_order:                 '/commandes-partenaire',
  new_marketplace_order:     '/gerer-courses',
  order_accepted:            null, // résolu dynamiquement avec entityId
  order_delivering:          null,
  order_delivered:           null,
  order_cancelled:           null,
  // Courses
  new_course:                '/gerer-courses',
  course_created:            null, // résolu dynamiquement
  course_assigned:           null,
  course_accepted:           null,
  course_in_progress:        null,
  course_delivered:          null,
  course_delivered_driver:   '/mes-livraisons',
  course_cancelled:          null,
  payment_validated:         '/mes-gains',
};

// ── Priorité type de priorité par event_type ──────────────────────────────────
export const NOTIF_PRIORITY = {
  // Critiques
  bedou_recharge_request:    'critical',
  bedou_withdrawal_request:  'critical',
  course_assigned:           'critical',
  new_course:                'critical',
  new_profile_request:       'critical',
  profile_pending_review:    'critical',
  new_order:                 'critical',
  // Normaux
  bedou_recharge_approved:   'normal',
  bedou_withdrawal_approved: 'normal',
  bedou_recharge_rejected:   'normal',
  bedou_withdrawal_rejected: 'normal',
  order_accepted:            'normal',
  order_delivering:          'normal',
  order_delivered:           'normal',
  order_cancelled:           'normal',
  course_created:            'normal',
  course_accepted:           'normal',
  course_in_progress:        'normal',
  course_delivered:          'normal',
  course_cancelled:          'normal',
  payment_validated:         'normal',
  // Info
  profile_validated:         'info',
  profile_refused:           'info',
  profile_suspended:         'info',
  course_delivered_driver:   'info',
  new_marketplace_order:     'info',
};

// ── Icônes enrichies par event_type ───────────────────────────────────────────
export const NOTIF_ICON = {
  bedou_recharge_request:    '💰',
  bedou_recharge_approved:   '✅',
  bedou_recharge_rejected:   '❌',
  bedou_withdrawal_request:  '💸',
  bedou_withdrawal_approved: '✅',
  bedou_withdrawal_rejected: '❌',
  new_profile_request:       '📋',
  profile_pending_review:    '📋',
  profile_validated:         '🎉',
  profile_refused:           '❌',
  profile_suspended:         '⚠️',
  new_order:                 '🛒',
  new_marketplace_order:     '🛒',
  order_accepted:            '✅',
  order_delivering:          '🛵',
  order_delivered:           '🎉',
  order_cancelled:           '❌',
  new_course:                '🛵',
  course_created:            '✅',
  course_assigned:           '🔥',
  course_accepted:           '✅',
  course_in_progress:        '🏃',
  course_delivered:          '🎉',
  course_delivered_driver:   '💰',
  course_cancelled:          '❌',
  payment_validated:         '💸',
};

export function resolveNotifRoute(notif) {
  if (!notif) return null;

  const role = notif.destinataire_role || '';
  const titre = (notif.titre || '').toLowerCase();
  const entityType = notif.target_entity_type || '';
  const entityId = notif.target_entity_id || '';
  const courseId = notif.course_id || (entityType === 'Course' ? entityId : '');

  // ── 1. Route explicite stockée → priorité absolue ─────────────────────────
  if (notif.target_screen) return notif.target_screen;

  // ── 2. Résolution par notification_key / entity_type + role ───────────────
  if (entityType === 'Course' && entityId) {
    if (role === 'livreur') {
      if (titre.includes('nouvelle') || titre.includes('assigné') || titre.includes('attente')) return '/courses-disponibles';
      return `/course-livreur/${entityId}`;
    }
    if (role === 'client') return `/course/${entityId}/track`;
    if (role === 'admin') return '/gerer-courses';
  }

  if (entityType === 'CommandePartenaire' && entityId) {
    if (role === 'partenaire') return '/commandes-partenaire';
    if (role === 'client') return `/commande-marketplace/${entityId}`;
    if (role === 'admin') return '/gerer-courses';
  }

  if (entityType === 'DemandeRecharge') return role === 'admin' ? '/gestion-bedou' : '/mon-bedou';
  if (entityType === 'DemandeRetrait') return role === 'admin' ? '/gestion-bedou' : '/mon-bedou';

  if (entityType === 'UserProfile') {
    if (role === 'admin') return entityId ? `/admin/profil/${entityId}` : '/gestion-profils';
    return '/settings';
  }

  if (entityType === 'Transaction') return '/mon-bedou';
  if (entityType === 'Publicite') return role === 'admin' ? '/gerer-publicites' : '/dashboard-annonceur';

  // ── 3. Heuristiques titre + rôle ──────────────────────────────────────────

  // LIVREUR
  if (role === 'livreur') {
    if (titre.includes('nouvelle course') || titre.includes('attribu') || titre.includes('assigné')) return '/courses-disponibles';
    if (courseId) return `/course-livreur/${courseId}`;
    if (titre.includes('livraison') || titre.includes('course')) return '/mes-livraisons';
    if (titre.includes('gain') || titre.includes('paiement') || titre.includes('bedou') || titre.includes('retrait')) return '/mes-gains';
    if (titre.includes('profil') || titre.includes('validé') || titre.includes('refusé') || titre.includes('document')) return '/settings';
    if (titre.includes('message')) return '/mes-discussions';
    return '/courses-disponibles';
  }

  // CLIENT
  if (role === 'client') {
    if (courseId) return `/course/${courseId}/track`;
    if (titre.includes('commande') || titre.includes('marketplace') || titre.includes('mall')) return '/mes-commandes-marketplace';
    if (titre.includes('course') || titre.includes('livraison')) return '/mes-courses';
    if (titre.includes('bedou') || titre.includes('recharge') || titre.includes('retrait') || titre.includes('solde')) return '/mon-bedou';
    if (titre.includes('message')) return '/mes-messages';
    return '/mes-courses';
  }

  // PARTENAIRE
  if (role === 'partenaire') {
    if (titre.includes('commande')) return '/commandes-partenaire';
    if (titre.includes('gain') || titre.includes('bedou') || titre.includes('retrait')) return '/mon-bedou';
    if (titre.includes('profil') || titre.includes('validé') || titre.includes('refusé') || titre.includes('suspendu')) return '/settings';
    if (titre.includes('message')) return '/mes-messages';
    return '/dashboard-partenaire';
  }

  // COMMERCIAL
  if (role === 'commercial') {
    if (titre.includes('gain') || titre.includes('bedou') || titre.includes('bonus') || titre.includes('retrait') || titre.includes('parrainage')) return '/mon-bedou';
    if (titre.includes('validé') || titre.includes('profil') || titre.includes('refusé')) return '/settings';
    return '/';
  }

  // ANNONCEUR
  if (role === 'annonceur') return '/dashboard-annonceur';

  // ADMIN
  if (role === 'admin') {
    if (titre.includes('recharge') || titre.includes('retrait') || titre.includes('bedou')) return '/gestion-bedou';
    if (titre.includes('course') || titre.includes('livraison') || titre.includes('dispatch')) return '/gerer-courses';
    if (titre.includes('profil') || titre.includes('inscrit') || titre.includes('document') || titre.includes('validation')) return '/gestion-profils';
    if (titre.includes('commande') || titre.includes('marketplace')) return '/gerer-courses';
    if (titre.includes('commercial') || titre.includes('code promo')) return '/gerer-commerciaux';
    if (titre.includes('partenaire')) return '/gerer-partenaires';
    if (titre.includes('client')) return '/gerer-clients';
    if (titre.includes('publicité') || titre.includes('pub') || titre.includes('annonceur')) return '/gerer-publicites';
    if (titre.includes('message')) return '/messages-admin';
    return '/admin-dashboard';
  }

  // Fallback
  if (courseId) return role === 'livreur' ? `/course-livreur/${courseId}` : `/course/${courseId}`;
  return null;
}

export function resolveActionLabel(route, role) {
  if (!route) return null;
  if (route.includes('/course-livreur/')) return '🛵 Voir la course →';
  if (route.includes('/course/') && route.includes('/track')) return '📍 Suivre la course →';
  if (route.includes('/course/')) return '📦 Détails de la course →';
  if (route === '/courses-disponibles') return '🛵 Courses disponibles →';
  if (route === '/mes-livraisons') return '📋 Mes livraisons →';
  if (route.includes('/commande-marketplace/')) return '🛒 Détails commande →';
  if (route === '/commandes-partenaire') return '🛒 Mes commandes →';
  if (route === '/mes-commandes-marketplace') return '🛒 Mes commandes →';
  if (route === '/mon-bedou') return '💰 Mon Bedou →';
  if (route === '/mes-gains') return '💸 Mes gains →';
  if (route === '/gestion-bedou') return '💰 Gérer Bedou →';
  if (route === '/settings') return '👤 Mon profil →';
  if (route === '/gestion-profils') return '📋 Gérer les profils →';
  if (route === '/gerer-courses') return '🛵 Gérer les courses →';
  if (route === '/gestion-transactions') return '💳 Transactions →';
  if (route === '/dashboard-annonceur') return '📊 Mon tableau de bord →';
  if (route === '/admin-dashboard') return '🏠 Tableau de bord →';
  if (route.includes('/admin/profil/')) return '👤 Voir le profil →';
  return '👁 Voir les détails →';
}

/**
 * Retourne l'icône appropriée pour une notification
 */
export function resolveNotifIcon(notif) {
  if (!notif) return '🔔';
  // Par entity_type stocké dans notification_key ou titre
  const key = notif.notification_key || '';
  for (const [type, icon] of Object.entries(NOTIF_ICON)) {
    if (key.includes(type)) return icon;
  }
  // Fallback par type CDL
  const TYPE_ICONS = { success: '✅', warning: '⚠️', danger: '🚨', info: 'ℹ️' };
  return TYPE_ICONS[notif.type] || '🔔';
}

/**
 * Retourne le niveau de priorité d'une notification pour l'affichage
 * critical | normal | info
 */
export function resolveNotifPriority(notif) {
  if (!notif) return 'normal';
  const key = notif.notification_key || '';
  for (const [type, priority] of Object.entries(NOTIF_PRIORITY)) {
    if (key.includes(type)) return priority;
  }
  if (notif.type === 'danger') return 'critical';
  if (notif.type === 'warning') return 'normal';
  return 'info';
}