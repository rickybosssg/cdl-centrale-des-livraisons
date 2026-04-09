/**
 * CDL — Préparation alertes WhatsApp pour Respond.io
 *
 * Stratégie "Push to DB" (sans webhook entrant) :
 * - Chaque événement CDL crée un log dans WhatsAppNotificationLog
 * - whatsapp_ready = true  →  Respond.io surveille ce champ et déclenche son workflow
 * - whatsapp_sent = false  →  Respond.io met ce champ à true après envoi
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
  // numéro 8 chiffres burkinabè sans préfixe
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

  if (!formattedPhone) {
    console.warn('[WA] Numéro absent — skip:', eventType, recipientRole);
    try {
      await base44.asServiceRole.entities.WhatsAppNotificationLog.create({
        event_type: eventType,
        recipient_role: recipientRole,
        recipient_name: recipientName,
        recipient_phone: recipientPhone || '',
        message_text: messageText || '',
        entity_id: entityId,
        entity_type: entityType,
        priority,
        whatsapp_ready: false,
        whatsapp_sent: false,
        status: 'skipped',
        error_message: 'Numéro manquant',
        provider: 'respond_io',
      });
    } catch (_) {}
    return Response.json({ skipped: true, reason: 'no_phone' });
  }

  // Si c'est un renvoi → mettre à jour le log existant
  if (logId) {
    try {
      await base44.asServiceRole.entities.WhatsAppNotificationLog.update(logId, {
        whatsapp_ready: true,
        whatsapp_sent: false,
        status: 'pending',
        error_message: null,
        retry_count: 0,
      });
      console.log(`[WA] ✅ Log ${logId} réactivé pour Respond.io — event: ${eventType}`);
      return Response.json({ success: true, logId, phone: formattedPhone });
    } catch (err) {
      console.error('[WA] Erreur update log:', err.message);
      return Response.json({ error: err.message }, { status: 500 });
    }
  }

  // Nouveau log → whatsapp_ready = true pour que Respond.io le détecte
  try {
    const log = await base44.asServiceRole.entities.WhatsAppNotificationLog.create({
      event_type: eventType,
      recipient_role: recipientRole,
      recipient_name: recipientName,
      recipient_phone: formattedPhone,
      message_text: messageText,
      entity_id: entityId,
      entity_type: entityType,
      priority,
      whatsapp_ready: true,
      whatsapp_sent: false,
      status: 'pending',
      provider: 'respond_io',
    });
    console.log(`[WA] ✅ Log créé pour Respond.io — event: ${eventType}, phone: ${formattedPhone}, id: ${log.id}`);
    return Response.json({ success: true, logId: log.id, phone: formattedPhone });
  } catch (err) {
    console.error('[WA] Erreur création log:', err.message);
    // Non bloquant : retourner quand même 200
    return Response.json({ success: false, error: err.message });
  }
});