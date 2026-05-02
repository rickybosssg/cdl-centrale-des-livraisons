/**
 * notificationRouter.js — CDL v3 ULTRA PREMIUM
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
  order_accepted:            null,
  order_delivering:          null,
  order_delivered:           null,
  order_cancelled:           null,
  // Courses
  new_course:                '/gerer-courses',
  course_created:            null,
  course_assigned:           null,
  course_accepted:           null,
  course_in_progress:        null,
  course_delivered:          null,
  course_delivered_driver:   '/mes-livraisons',
  course_cancelled:          null,
  payment_validated:         '/mes-gains',
};

// ── Priorité par event_type ────────────────────────────────────────────────────
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
  new_course:                '🚀',
  course_created:            '✅',
  course_assigned:           '🔥',
  course_accepted:           '✅',
  course_in_progress:        '🏃',
  course_delivered:          '🎉',
  course_delivered_driver:   '💰',
  course_cancelled:          '❌',
  payment_validated:         '💸',
};

/**
 * Détecte l'event_type depuis les champs disponibles de la notification
 * (notification_key, target_entity_type, titre, type CDL)
 */
export function detectEventType(notif) {
  if (!notif) return null;

  // 1. Via notification_key — format: email__eventType__entityId__titre
  const key = notif.notification_key || '';
  if (key) {
    const parts = key.split('__');
    if (parts.length >= 2) {
      const candidate = parts[1];
      if (EVENT_TYPE_ROUTES[candidate] !== undefined || NOTIF_PRIORITY[candidate]) return candidate;
    }
    // Scan complet de la clé
    for (const type of Object.keys(NOTIF_ICON)) {
      if (key.includes(type)) return type;
    }
  }

  // 2. Via target_entity_type + titre + role
  const entityType = notif.target_entity_type || '';
  const titre = (notif.titre || '').toLowerCase();
  const role = notif.destinataire_role || '';

  if (entityType === 'DemandeRecharge') {
    if (titre.includes('valid') || titre.includes('crédit')) return 'bedou_recharge_approved';
    if (titre.includes('refus')) return 'bedou_recharge_rejected';
    return 'bedou_recharge_request';
  }
  if (entityType === 'DemandeRetrait') {
    if (titre.includes('valid') || titre.includes('approuv') || titre.includes('paiement')) return 'bedou_withdrawal_approved';
    if (titre.includes('refus')) return 'bedou_withdrawal_rejected';
    return 'bedou_withdrawal_request';
  }
  if (entityType === 'Course') {
    if (titre.includes('nouvelle course') || titre.includes('disponible')) return 'new_course';
    if (titre.includes('assigné') || titre.includes('attente') || titre.includes('livreur')) return 'course_assigned';
    if (titre.includes('accepté') || titre.includes('chemin')) return 'course_accepted';
    if (titre.includes('route') || titre.includes('en cours')) return 'course_in_progress';
    if (titre.includes('livré') || titre.includes('livraison confirm')) return role === 'livreur' ? 'course_delivered_driver' : 'course_delivered';
    if (titre.includes('annul')) return 'course_cancelled';
    if (titre.includes('créé') || titre.includes('enregistré')) return 'course_created';
    if (titre.includes('paiement')) return 'payment_validated';
    return 'new_course';
  }
  if (entityType === 'CommandePartenaire') {
    if (titre.includes('nouvelle commande')) return role === 'admin' ? 'new_marketplace_order' : 'new_order';
    if (titre.includes('acceptée')) return 'order_accepted';
    if (titre.includes('route') || titre.includes('livraison')) return 'order_delivering';
    if (titre.includes('livrée')) return 'order_delivered';
    if (titre.includes('annul')) return 'order_cancelled';
    return 'new_order';
  }
  if (entityType === 'UserProfile') {
    if (titre.includes('valid') || titre.includes('actif')) return 'profile_validated';
    if (titre.includes('refus')) return 'profile_refused';
    if (titre.includes('suspendu')) return 'profile_suspended';
    if (titre.includes('soumis') || titre.includes('document')) return 'profile_pending_review';
    return 'new_profile_request';
  }

  // 3. Via type CDL brut
  if (notif.type === 'danger') return 'course_cancelled';
  if (notif.type === 'warning') return 'bedou_recharge_request';

  return null;
}

/**
 * Actions rapides contextuelles par event_type
 * Retourne un tableau de { label, route, variant } ou []
 */
export function resolveQuickActions(notif) {
  const eventType = detectEventType(notif);
  const entityId = notif.target_entity_id || '';
  const role = notif.destinataire_role || '';

  if (!eventType) return [];

  // Admins — actions sur Bedou
  if (eventType === 'bedou_recharge_request' && role === 'admin') {
    return [
      { label: '💰 Gérer', route: '/gestion-bedou', variant: 'primary' },
    ];
  }
  if (eventType === 'bedou_withdrawal_request' && role === 'admin') {
    return [
      { label: '💸 Gérer', route: '/gestion-bedou', variant: 'primary' },
    ];
  }

  // Livreur — nouvelle course assignée
  if (eventType === 'course_assigned' && entityId) {
    return [
      { label: '🛵 Voir la course', route: `/course-livreur/${entityId}`, variant: 'primary' },
    ];
  }

  // Admin — nouvelle course
  if (eventType === 'new_course') {
    return [
      { label: '🛵 Dispatcher', route: '/gerer-courses', variant: 'primary' },
    ];
  }

  // Profil à valider (admin)
  if ((eventType === 'new_profile_request' || eventType === 'profile_pending_review') && role === 'admin') {
    return [
      { label: '📋 Voir profils', route: entityId ? `/admin/profil/${entityId}` : '/gestion-profils', variant: 'primary' },
    ];
  }

  // Commande partenaire
  if (eventType === 'new_order') {
    return [
      { label: '🛒 Voir commandes', route: '/commandes-partenaire', variant: 'primary' },
    ];
  }

  return [];
}

export function resolveNotifRoute(notif) {
  if (!notif) return null;

  const role = notif.destinataire_role || '';
  const titre = (notif.titre || '').toLowerCase();
  const entityType = notif.target_entity_type || '';
  const entityId = notif.target_entity_id || '';
  const courseId = notif.course_id || (entityType === 'Course' ? entityId : '');

  // ── 1. Route explicite stockée → priorité absolue ─────────────────────────
  if (notif.target_screen) return notif.target_screen;

  // ── 2. Via event_type détecté ─────────────────────────────────────────────
  const eventType = detectEventType(notif);
  if (eventType && EVENT_TYPE_ROUTES[eventType] !== undefined) {
    const staticRoute = EVENT_TYPE_ROUTES[eventType];
    if (staticRoute) return staticRoute;
  }

  // ── 3. Résolution par entity_type + role + entityId ───────────────────────
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

  // ── 4. Heuristiques titre + rôle ──────────────────────────────────────────

  if (role === 'livreur') {
    if (titre.includes('nouvelle course') || titre.includes('attribu') || titre.includes('assigné')) return '/courses-disponibles';
    if (courseId) return `/course-livreur/${courseId}`;
    if (titre.includes('livraison') || titre.includes('course')) return '/mes-livraisons';
    if (titre.includes('gain') || titre.includes('paiement') || titre.includes('bedou') || titre.includes('retrait')) return '/mes-gains';
    if (titre.includes('profil') || titre.includes('validé') || titre.includes('refusé') || titre.includes('document')) return '/settings';
    if (titre.includes('message')) return '/mes-discussions';
    return '/courses-disponibles';
  }

  if (role === 'client') {
    if (courseId) return `/course/${courseId}/track`;
    if (titre.includes('commande') || titre.includes('marketplace') || titre.includes('mall')) return '/mes-commandes-marketplace';
    if (titre.includes('course') || titre.includes('livraison')) return '/mes-courses';
    if (titre.includes('bedou') || titre.includes('recharge') || titre.includes('retrait') || titre.includes('solde')) return '/mon-bedou';
    if (titre.includes('message')) return '/mes-messages';
    return '/mes-courses';
  }

  if (role === 'partenaire') {
    if (titre.includes('commande')) return '/commandes-partenaire';
    if (titre.includes('gain') || titre.includes('bedou') || titre.includes('retrait')) return '/mon-bedou';
    if (titre.includes('profil') || titre.includes('validé') || titre.includes('refusé') || titre.includes('suspendu')) return '/settings';
    if (titre.includes('message')) return '/mes-messages';
    return '/dashboard-partenaire';
  }

  if (role === 'commercial') {
    if (titre.includes('gain') || titre.includes('bedou') || titre.includes('bonus') || titre.includes('retrait') || titre.includes('parrainage')) return '/mon-bedou';
    if (titre.includes('validé') || titre.includes('profil') || titre.includes('refusé')) return '/settings';
    return '/';
  }

  if (role === 'annonceur') return '/dashboard-annonceur';

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
  const eventType = detectEventType(notif);
  if (eventType && NOTIF_ICON[eventType]) return NOTIF_ICON[eventType];
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
  const eventType = detectEventType(notif);
  if (eventType && NOTIF_PRIORITY[eventType]) return NOTIF_PRIORITY[eventType];
  if (notif.type === 'danger') return 'critical';
  if (notif.type === 'warning') return 'normal';
  return 'info';
}