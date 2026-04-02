import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Extrait les champs d'un message WhatsApp brut
function extractFields(msg) {
  const lower = msg.toLowerCase();
  const get = (patterns) => {
    for (const p of patterns) {
      const rx = new RegExp(p + '[:\\s]+([^\\n\\r📍📞📝]+)', 'i');
      const m = msg.match(rx);
      if (m) return m[1].trim();
    }
    return null;
  };

  const depart = get(['départ', 'depart', 'quartier départ', 'lieu de départ', 'je suis à', 'je suis a', '📍 départ', 'depuis']);
  const destination = get(['destination', 'arrivée', 'arrivee', 'quartier arrivée', 'livrer à', 'livrer a', '📍 destination', 'vers']);
  const telephone = get(['téléphone', 'telephone', 'tel', 'numéro', 'numero', 'mon numéro', '📞']);
  const details = get(['détails', 'details', 'colis', '📝', 'type de colis', 'description']);

  let type = 'inconnu';
  if (lower.includes('récupér') || lower.includes('recuper') || lower.includes('aller chercher')) type = 'recuperer';
  else if (lower.includes('déplacement') || lower.includes('deplacement') || lower.includes('transport')) type = 'deplacement';
  else if (lower.includes('envoyer') || lower.includes('livrer') || lower.includes('colis') || lower.includes('envoyer')) type = 'envoyer';

  const hasMinFields = !!(depart && destination && (telephone || true));
  const status = (depart && destination) ? 'pret_a_convertir' : 'incomplet';

  return { depart, destination, telephone, details, type, status };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin requis' }, { status: 403 });
    }

    const body = await req.json();
    const { inbox_id } = body;

    // Récupérer la demande WhatsApp
    const inboxItems = await base44.asServiceRole.entities.WhatsappInbox.filter({ id: inbox_id });
    if (!inboxItems.length) return Response.json({ error: 'Demande introuvable' }, { status: 404 });
    const inbox = inboxItems[0];

    if (inbox.linked_course_id) {
      return Response.json({ error: 'Déjà convertie en course', course_id: inbox.linked_course_id });
    }
    if (!inbox.extracted_depart || !inbox.extracted_destination) {
      return Response.json({ error: 'Champs départ/destination manquants', status: 'incomplet' });
    }

    // Chercher ou créer le client CDL par numéro
    let clientEmail = `wa_${inbox.phone_number.replace(/\D/g, '')}@whatsapp.cdl`;

    // Créer la course CDL
    const course = await base44.asServiceRole.entities.Course.create({
      type_mission: inbox.extracted_type === 'recuperer' ? 'recuperer' : 'envoyer',
      quartier_depart: inbox.extracted_depart,
      quartier_arrivee: inbox.extracted_destination,
      telephone_expediteur: inbox.extracted_phone || inbox.phone_number,
      telephone_destinataire: inbox.extracted_phone || inbox.phone_number,
      type_colis: inbox.extracted_details ? 'Autre' : 'Petit colis',
      description: inbox.extracted_details || `Commande WhatsApp — ${inbox.phone_number}`,
      statut: 'en_attente',
      client_email: clientEmail,
      client_name: inbox.client_name || `Client WA ${inbox.phone_number}`,
      mode_paiement: 'Paiement à la livraison',
      statut_paiement: 'paiement_livraison',
      prix: 1500, // Prix par défaut — admin peut modifier
      source: 'whatsapp',
    });

    // Lier la course à la demande WhatsApp
    await base44.asServiceRole.entities.WhatsappInbox.update(inbox_id, {
      status: 'converti',
      linked_course_id: course.id,
      saisi_par: user.email,
    });

    // Lancer le dispatch automatiquement
    await base44.asServiceRole.functions.invoke('autoDispatch', { course_id: course.id });

    console.log(`[WA→COURSE] Cours ${course.id} créée depuis WA ${inbox.phone_number}`);
    return Response.json({ success: true, course_id: course.id });

  } catch (error) {
    console.error('[WA→COURSE]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});