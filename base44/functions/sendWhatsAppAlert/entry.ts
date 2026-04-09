/**
 * CDL — Alertes WhatsApp via Respond.io (Push to DB / Contact Sync)
 *
 * Stratégie sans webhook entrant :
 * 1. Reset whatsapp_ready = false sur le User (reset Respond.io)
 * 2. Remplir whatsapp_message_text, whatsapp_recipient_role, whatsapp_trigger_event
 * 3. Mettre whatsapp_ready = true → Respond.io détecte le changement et envoie le message
 *
 * Aucun secret WHATSAPP_WEBHOOK_URL / WHATSAPP_API_TOKEN requis.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function formatPhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\s+/g, '').replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('00226')) return '+' + digits.slice(2);
  if (digits.startsWith('226')) return '+' + digits;
  if (digits.startsWith('0')) return '+226' + digits.slice(1);
  if (digits.length === 8) return '+226' + digits;
  return '+226' + digits;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const {
    eventType,
    recipientRole = '',
    recipientName = '',
    recipientPhone,
    messageText,
    entityId = null,
    entityType = null,
    priority = 'normal',
    logId = null,
  } = body;

  const formattedPhone = formatPhone(recipientPhone);

  // ── 1. Créer le log dans WhatsAppNotificationLog ──────────────────────────
  let createdLog = null;
  try {
    const logPayload = {
      event_type: eventType,
      recipient_role: recipientRole,
      recipient_name: recipientName,
      recipient_phone: formattedPhone || recipientPhone || '',
      message_text: messageText || '',
      entity_id: entityId,
      entity_type: entityType,
      priority,
      whatsapp_ready: !!formattedPhone,
      whatsapp_sent: false,
      status: formattedPhone ? 'pending' : 'skipped',
      error_message: formattedPhone ? null : 'Numéro manquant',
      provider: 'respond_io',
    };

    if (logId) {
      // Renvoi : réactiver un log existant
      await base44.asServiceRole.entities.WhatsAppNotificationLog.update(logId, {
        whatsapp_ready: true,
        whatsapp_sent: false,
        status: 'pending',
        error_message: null,
      });
      createdLog = { id: logId };
    } else {
      createdLog = await base44.asServiceRole.entities.WhatsAppNotificationLog.create(logPayload);
    }
  } catch (err) {
    console.error('[WA] Erreur log:', err.message);
  }

  if (!formattedPhone) {
    console.warn('[WA] Numéro absent — skip:', eventType, recipientRole);
    return Response.json({ skipped: true, reason: 'no_phone' });
  }

  // ── 2. Trouver le User par téléphone et synchroniser le contact Respond.io ──
  try {
    const users = await base44.asServiceRole.entities.User.filter({ telephone: formattedPhone });
    const user = users[0] || null;

    if (user) {
      // Étape A : Reset whatsapp_ready = false (force détection changement par Respond.io)
      await base44.asServiceRole.entities.User.update(user.id, {
        whatsapp_ready: false,
        whatsapp_sent: false,
      });

      // Étape B : Sync données contact + données message
      await base44.asServiceRole.entities.User.update(user.id, {
        // Sync contact Respond.io
        telephone: formattedPhone,
        // Données WA
        whatsapp_trigger_event: eventType,
        whatsapp_message_text: messageText,
        whatsapp_recipient_role: recipientRole,
        whatsapp_recipient_phone: formattedPhone,
      });

      // Étape C : Déclencher Respond.io
      await base44.asServiceRole.entities.User.update(user.id, {
        whatsapp_ready: true,
      });

      console.log(`[WA] ✅ Contact synced + Respond.io déclenché — event: ${eventType}, user: ${user.email}`);
    } else {
      // Contact inconnu — log uniquement, pas d'erreur
      console.warn(`[WA] Aucun user CDL trouvé pour ${formattedPhone} — log créé uniquement (event: ${eventType})`);
    }
  } catch (err) {
    console.error('[WA] Erreur sync contact:', err.message);
    // Non bloquant
  }

  return Response.json({
    success: true,
    logId: createdLog?.id || null,
    phone: formattedPhone,
  });
});