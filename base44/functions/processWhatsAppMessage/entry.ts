import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Webhook handler pour messages WhatsApp entrants
// Compatible Meta WhatsApp Business API (webhook verification + message processing)

function extractFields(text) {
  const t = text.toLowerCase();
  const result = { depart: null, destination: null, phone: null, details: null, type: 'inconnu' };

  // Extraction départ
  const departPatterns = [/départ\s*[:：]\s*([^\n📍📞📝]+)/i, /d[eé]part\s*[:：]\s*([^\n]+)/i, /quartier d[eé]part\s*[:：]\s*([^\n]+)/i, /lieu de d[eé]part\s*[:：]\s*([^\n]+)/i, /je suis [àa]\s*[:：]?\s*([^\n]+)/i, /📍\s*d[eé]part\s*[:：]\s*([^\n]+)/i];
  for (const p of departPatterns) { const m = text.match(p); if (m) { result.depart = m[1].trim(); break; } }

  // Extraction destination
  const destPatterns = [/destination\s*[:：]\s*([^\n📍📞📝]+)/i, /arriv[eé]e\s*[:：]\s*([^\n]+)/i, /quartier arriv[eé]e\s*[:：]\s*([^\n]+)/i, /livrer [àa]\s*[:：]?\s*([^\n]+)/i, /📍\s*destination\s*[:：]\s*([^\n]+)/i];
  for (const p of destPatterns) { const m = text.match(p); if (m) { result.destination = m[1].trim(); break; } }

  // Extraction téléphone
  const phonePatterns = [/t[eé]l[eé]phone\s*[:：]\s*([^\n📍📞📝]+)/i, /📞\s*([^\n]+)/i, /mon num[eé]ro\s*[:：]\s*([^\n]+)/i, /contact\s*[:：]\s*([^\n]+)/i, /(\+?226[\s\-]?\d{2}[\s\-]?\d{2}[\s\-]?\d{2}[\s\-]?\d{2})/];
  for (const p of phonePatterns) { const m = text.match(p); if (m) { result.phone = m[1].trim().replace(/\s/g, ''); break; } }

  // Extraction détails
  const detailPatterns = [/d[eé]tails?\s*[:：]\s*([^\n]+)/i, /📝\s*([^\n]+)/i, /colis\s*[:：]\s*([^\n]+)/i, /description\s*[:：]\s*([^\n]+)/i];
  for (const p of detailPatterns) { const m = text.match(p); if (m) { result.details = m[1].trim(); break; } }

  // Type de demande
  if (t.includes('récupér') || t.includes('recuper') || t.includes('aller chercher')) result.type = 'recuperer';
  else if (t.includes('déplacement') || t.includes('deplacement') || t.includes('transport') || t.includes('amener')) result.type = 'deplacement';
  else if (t.includes('envoyer') || t.includes('livrer') || t.includes('colis') || t.includes('expédi')) result.type = 'envoyer';

  return result;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Vérification webhook Meta (GET)
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    const verifyToken = Deno.env.get('WHATSAPP_VERIFY_TOKEN') || 'cdl_verify_2024';
    if (mode === 'subscribe' && token === verifyToken) {
      return new Response(challenge, { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const body = await req.json();

    // Cas appel direct (admin manuel ou test)
    if (body.manual_message) {
      return await handleMessage(base44, body.manual_message, body.phone_number || 'inconnu', body.message_id || `manual_${Date.now()}`);
    }

    // Format Meta WhatsApp Business API
    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (!messages || messages.length === 0) {
      return Response.json({ status: 'no_messages' });
    }

    const results = [];
    for (const msg of messages) {
      if (msg.type !== 'text') continue;
      const phoneNumber = msg.from;
      const messageId = msg.id;
      const text = msg.text?.body || '';
      const result = await handleMessage(base44, text, phoneNumber, messageId);
      const data = await result.json();
      results.push(data);
    }

    return Response.json({ processed: results.length, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function handleMessage(base44, rawMessage, phoneNumber, messageId) {
  // Anti-doublon : vérifier si message déjà traité
  const existing = await base44.asServiceRole.entities.WhatsAppOrderInbox.filter({ whatsapp_message_id: messageId });
  if (existing.length > 0) {
    return Response.json({ status: 'duplicate', id: existing[0].id });
  }

  const extracted = extractFields(rawMessage);
  const missingFields = [];
  if (!extracted.depart) missingFields.push('départ');
  if (!extracted.destination) missingFields.push('destination');
  if (!extracted.phone && phoneNumber === 'inconnu') missingFields.push('téléphone');

  const status = missingFields.length === 0 ? 'pret_a_convertir' : 'incomplet';

  // Créer l'entrée dans l'inbox
  const inbox = await base44.asServiceRole.entities.WhatsAppOrderInbox.create({
    whatsapp_message_id: messageId,
    phone_number: phoneNumber,
    raw_message: rawMessage,
    extracted_depart: extracted.depart || '',
    extracted_destination: extracted.destination || '',
    extracted_phone: extracted.phone || phoneNumber,
    extracted_package_details: extracted.details || '',
    extracted_pickup_type: extracted.type,
    status,
    missing_fields: missingFields.length > 0 ? JSON.stringify(missingFields) : null,
  });

  // Mode auto : convertir immédiatement si prêt
  const params = await base44.asServiceRole.entities.Parametres?.filter({}).catch(() => []);
  const autoMode = params?.[0]?.whatsapp_auto_mode !== false; // true par défaut

  if (status === 'pret_a_convertir' && autoMode) {
    await base44.asServiceRole.functions.invoke('convertWhatsAppToOrder', { inbox_id: inbox.id });
  }

  return Response.json({ success: true, inbox_id: inbox.id, status, missing: missingFields });
}