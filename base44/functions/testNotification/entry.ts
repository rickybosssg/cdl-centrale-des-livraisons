import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * testNotification — Envoyer une notification de test
 * Logs détaillés pour debug : token → enregistrement → envoi → réception
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const { recipient_email, recipient_role } = await req.json();

    if (!recipient_email || !recipient_role) {
      return Response.json({
        error: 'recipient_email et recipient_role requis',
      }, { status: 400 });
    }

    console.log(
      `[testNotification] Test initié par ${user.email}`,
      `→ vers ${recipient_email} (${recipient_role})`
    );

    // ── 1. Récupérer les tokens FCM du destinataire ──────────────────────
    const tokens = await base44.asServiceRole.entities.FcmToken.filter({
      user_email: recipient_email,
      is_active: true,
    });

    console.log(`[testNotification] Tokens trouvés pour ${recipient_email}:`, tokens.length);
    tokens.forEach((t, i) => {
      console.log(
        `  Token ${i + 1}:`,
        t.token.substring(0, 25) + '...',
        `| device: ${t.device_type}`,
        `| registered: ${t.registered_at}`
      );
    });

    if (tokens.length === 0) {
      console.warn(
        `[testNotification] ⚠️ Aucun token FCM pour ${recipient_email}`,
        `L'utilisateur doit se connecter + autoriser les notifications`
      );
      return Response.json({
        success: false,
        message: 'Aucun token FCM trouvé',
        details: `${recipient_email} doit se connecter sur l'APK et autoriser les notifications`,
        tokens_count: 0,
      });
    }

    // ── 2. Préparer le payload de notification ───────────────────────────
    const notifPayload = {
      title: '🧪 Test Notification CDL',
      body: `Notification de test reçue à ${new Date().toLocaleTimeString()}`,
      data: {
        test_mode: 'true',
        sender_email: user.email,
        timestamp: new Date().toISOString(),
        notif_route: '/mes-notifications',
        target_screen: '/mes-notifications',
      },
    };

    console.log(`[testNotification] Payload:`, notifPayload);

    // ── 3. Invoquer sendFcmNotification avec les tokens ──────────────────
    const sendResult = await base44.asServiceRole.functions.invoke(
      'sendFcmNotification',
      {
        title: notifPayload.title,
        body: notifPayload.body,
        data: notifPayload.data,
        tokens: tokens.map(t => t.token), // Passer les tokens directement
      }
    );

    console.log(`[testNotification] Résultat sendFcmNotification:`, sendResult.data);

    // ── 4. Enregistrer un log de test en BDD ──────────────────────────────
    try {
      await base44.asServiceRole.entities.NotificationTestLog.create({
        admin_email: user.email,
        recipient_email,
        recipient_role,
        tokens_count: tokens.length,
        sent_count: sendResult.data?.sent || 0,
        failed_count: sendResult.data?.failed || 0,
        timestamp: new Date().toISOString(),
        status: (sendResult.data?.sent || 0) > 0 ? 'sent' : 'failed',
        details: JSON.stringify({
          payload: notifPayload,
          sendResult: sendResult.data,
        }),
      });
      console.log(`[testNotification] ✅ Log de test créé`);
    } catch (logErr) {
      console.warn(`[testNotification] Erreur création log:`, logErr.message);
    }

    // ── 5. Créer une notification de feedback pour l'admin ────────────────
    try {
      const sent = sendResult.data?.sent || 0;
      await base44.asServiceRole.entities.Notification.create({
        destinataire_email: user.email,
        destinataire_role: 'admin',
        titre: `🧪 Test notification ${sent > 0 ? 'ENVOYÉ' : 'ÉCHOUÉ'}`,
        message: sent > 0
          ? `Notification envoyée à ${recipient_email} (${sent}/${tokens.length} tokens)`
          : `Échec envoi vers ${recipient_email}. ${sendResult.data?.message || ''}`,
        type: sent > 0 ? 'success' : 'danger',
        lue: false,
      });
    } catch (_) {}

    console.log(`[testNotification] ✅ Test terminé`);

    return Response.json({
      success: sendResult.data?.sent > 0,
      message: `Notification envoyée à ${sent}/${tokens.length} tokens`,
      details: {
        recipient_email,
        recipient_role,
        tokens_found: tokens.length,
        sent: sendResult.data?.sent || 0,
        failed: sendResult.data?.failed || 0,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[testNotification] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});