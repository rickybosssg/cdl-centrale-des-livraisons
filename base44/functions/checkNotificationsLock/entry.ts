/**
 * checkNotificationsLock — Statut MODE PRODUCTION notifications CDL
 *
 * Retourne l'état du verrou, les métriques de santé et les règles de déploiement.
 * Accessible uniquement aux admins.
 *
 * RÈGLES MODE PRODUCTION (NOTIFICATIONS_LOCK=true) :
 *   - Aucune modification directe autorisée sur sendCdlNotification
 *   - Aucune modification sur FcmBootstrap, FcmStatusPanel, FcmPushHistory
 *   - Uniquement extensions via nouvelles fonctions
 *   - Tout déploiement nécessite : sent > 0, failed = 0, channel = cdl_critical_alerts_v2
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CDL_CHANNEL = 'cdl_critical_alerts_v2';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non authentifié' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin requis' }, { status: 403 });

    const NOTIFICATIONS_LOCK    = Deno.env.get('NOTIFICATIONS_LOCK') === 'true';
    const SYSTEM_LOCKED         = Deno.env.get('NOTIFICATIONS_SYSTEM_LOCKED') !== 'false';
    const HAS_FIREBASE_SA       = !!Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');

    // Compter tokens actifs
    let activeTokensCount = 0;
    let lastTokenDate = null;
    try {
      const tokens = await base44.asServiceRole.entities.FcmToken.filter({ is_active: true }, '-registered_at', 100);
      activeTokensCount = tokens.length;
      lastTokenDate = tokens[0]?.registered_at || null;
    } catch (_) {}

    // Dernières notifications (5 min)
    let recentSent = 0;
    let recentFailed = 0;
    try {
      const since5m = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const recent = await base44.asServiceRole.entities.Notification.list('-created_date', 20);
      recentSent = recent.filter(n => n.created_date > since5m).length;
    } catch (_) {}

    const status = {
      // ── Flags de verrouillage ────────────────────────────────────────────
      NOTIFICATIONS_LOCK,
      SYSTEM_LOCKED,
      mode: NOTIFICATIONS_LOCK ? 'PRODUCTION 🔴' : 'DÉVELOPPEMENT 🟡',

      // ── Canal verrouillé ─────────────────────────────────────────────────
      channel_locked: CDL_CHANNEL,
      firebase_configured: HAS_FIREBASE_SA,

      // ── Métriques tokens ─────────────────────────────────────────────────
      active_tokens: activeTokensCount,
      last_token_registered: lastTokenDate,

      // ── Métriques activité récente (5 min) ───────────────────────────────
      recent_notifications_5min: recentSent,

      // ── Fichiers verrouillés ─────────────────────────────────────────────
      locked_files: [
        'functions/sendCdlNotification',
        'components/FcmBootstrap',
        'components/FcmStatusPanel',
        'components/FcmPushHistory',
        'pages/FcmDiagnostic',
        'functions/validateBedouRequest',
        'functions/saveFcmTokenPublic',
      ],

      // ── Règles déploiement ───────────────────────────────────────────────
      deploy_rules: {
        required_channel: CDL_CHANNEL,
        required_sent: 'sent > 0',
        required_failed: 'failed = 0',
        required_test: '/fcm-diagnostic obligatoire',
        required_validation: 'validation manuelle admin',
        allowed_changes: 'extensions uniquement — jamais remplacer',
      },

      // ── Checklist déploiement ────────────────────────────────────────────
      pre_deploy_checklist: [
        '✅ Test push sur APK physique Android',
        '✅ App ouverte → notification visible',
        '✅ App arrière-plan → notification système',
        '✅ App fermée → notification système',
        '✅ sent > 0 dans logs sendCdlNotification',
        '✅ failed = 0 dans logs sendCdlNotification',
        `✅ channel_id = ${CDL_CHANNEL}`,
        '✅ notification_client_sent = true',
        '✅ BDD fallback créé',
        '✅ delay_ms < 3000',
      ],

      checked_at: new Date().toISOString(),
    };

    console.log(`[checkNotificationsLock] LOCK=${NOTIFICATIONS_LOCK} | SYSTEM_LOCKED=${SYSTEM_LOCKED} | tokens=${activeTokensCount} | admin=${user.email}`);

    return Response.json(status);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});