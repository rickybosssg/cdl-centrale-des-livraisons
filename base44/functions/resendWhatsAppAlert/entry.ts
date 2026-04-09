import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me();
  if (user?.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { logId } = await req.json();
  if (!logId) return Response.json({ error: 'logId manquant' }, { status: 400 });

  const logs = await base44.asServiceRole.entities.WhatsAppNotificationLog.filter({ id: logId });
  const log = logs[0];
  if (!log) return Response.json({ error: 'Log introuvable' }, { status: 404 });

  // Réinitialiser en pending
  await base44.asServiceRole.entities.WhatsAppNotificationLog.update(logId, {
    status: 'pending',
    error_message: null,
  });

  // Relancer via sendWhatsAppAlert
  const res = await base44.asServiceRole.functions.invoke('sendWhatsAppAlert', {
    logId,
    eventType: log.event_type,
    recipientRole: log.recipient_role,
    recipientName: log.recipient_name,
    recipientPhone: log.recipient_phone,
    messageText: log.message_text,
    entityId: log.entity_id,
    entityType: log.entity_type,
    priority: log.priority,
  });

  return Response.json({ success: true, result: res });
});