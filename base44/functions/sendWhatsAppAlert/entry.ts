import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function formatPhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\s+/g, '').replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('00226')) return '+' + digits.slice(2);
  if (digits.startsWith('226')) return '+' + digits;
  if (digits.startsWith('0')) return '+226' + digits.slice(1);
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
    recipientRole,
    recipientName,
    recipientPhone,
    messageText,
    entityId = null,
    entityType = null,
    priority = 'normal',
    logId = null,
  } = body;

  const formattedPhone = formatPhone(recipientPhone);

  // Créer ou récupérer le log
  let log = null;
  try {
    if (logId) {
      const logs = await base44.asServiceRole.entities.WhatsAppNotificationLog.filter({ id: logId });
      log = logs[0] || null;
    }
    if (!log) {
      log = await base44.asServiceRole.entities.WhatsAppNotificationLog.create({
        event_type: eventType,
        recipient_role: recipientRole || '',
        recipient_name: recipientName || '',
        recipient_phone: formattedPhone || recipientPhone || '',
        message_text: messageText,
        entity_id: entityId,
        entity_type: entityType,
        status: 'pending',
        priority,
        retry_count: 0,
      });
    }
  } catch (err) {
    console.error('[WhatsApp] Erreur création log:', err.message);
  }

  const updateLog = async (data) => {
    if (!log?.id) return;
    try {
      await base44.asServiceRole.entities.WhatsAppNotificationLog.update(log.id, data);
    } catch (e) {
      console.error('[WhatsApp] Erreur update log:', e.message);
    }
  };

  // Si pas de numéro valide → skip
  if (!formattedPhone) {
    console.warn('[WhatsApp] Numéro manquant, skip:', recipientName);
    await updateLog({ status: 'skipped', error_message: 'Numéro manquant' });
    return Response.json({ skipped: true, reason: 'no_phone' });
  }

  const webhookUrl = Deno.env.get('WHATSAPP_WEBHOOK_URL');
  const apiToken = Deno.env.get('WHATSAPP_API_TOKEN');

  if (!webhookUrl) {
    console.warn('[WhatsApp] WHATSAPP_WEBHOOK_URL non configuré');
    await updateLog({ status: 'skipped', error_message: 'WHATSAPP_WEBHOOK_URL manquant' });
    return Response.json({ skipped: true, reason: 'no_webhook_url' });
  }

  const payload = {
    eventType,
    recipientRole,
    recipientName,
    recipientPhone: formattedPhone,
    messageText,
    entityId,
    entityType,
    priority,
    metadata: {
      app: 'CDL',
      source: 'base44',
      timestamp: new Date().toISOString(),
    },
  };

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (apiToken) headers['Authorization'] = `Bearer ${apiToken}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const responseText = await res.text().catch(() => '');

    if (res.ok) {
      console.log(`[WhatsApp] ✅ Envoyé à ${formattedPhone} — event: ${eventType}`);
      await updateLog({
        status: 'sent',
        sent_at: new Date().toISOString(),
        provider_response: responseText.slice(0, 500),
        provider: 'respond_io',
      });
      return Response.json({ success: true, phone: formattedPhone });
    } else {
      const errMsg = `HTTP ${res.status}: ${responseText.slice(0, 200)}`;
      console.error('[WhatsApp] Echec envoi:', errMsg);
      await updateLog({
        status: 'failed',
        error_message: errMsg,
        retry_count: (log?.retry_count || 0) + 1,
      });
      return Response.json({ success: false, error: errMsg });
    }
  } catch (err) {
    const errMsg = err.name === 'AbortError' ? 'Timeout (10s)' : err.message;
    console.error('[WhatsApp] Exception:', errMsg);
    await updateLog({
      status: 'failed',
      error_message: errMsg,
      retry_count: (log?.retry_count || 0) + 1,
    });
    return Response.json({ success: false, error: errMsg });
  }
});