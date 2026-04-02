import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Convertit une entrée WhatsApp en vraie course CDL + lance le dispatch
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { inbox_id } = await req.json();

    if (!inbox_id) return Response.json({ error: 'inbox_id requis' }, { status: 400 });

    // Récupérer la demande WhatsApp
    const entries = await base44.asServiceRole.entities.WhatsAppOrderInbox.filter({ id: inbox_id });
    if (!entries.length) return Response.json({ error: 'Entrée introuvable' }, { status: 404 });
    const entry = entries[0];

    // Anti-doublon : déjà converti ?
    if (entry.linked_course_id || entry.status === 'converti_en_course') {
      return Response.json({ success: false, message: 'Déjà converti', course_id: entry.linked_course_id });
    }

    // Vérifier champs minimums
    if (!entry.extracted_depart || !entry.extracted_destination) {
      await base44.asServiceRole.entities.WhatsAppOrderInbox.update(inbox_id, { status: 'incomplet' });
      return Response.json({ success: false, message: 'Champs insuffisants' });
    }

    const phone = entry.extracted_phone || entry.phone_number || 'Non fourni';

    // Créer la course CDL
    const course = await base44.asServiceRole.entities.Course.create({
      quartier_depart: entry.extracted_depart,
      quartier_arrivee: entry.extracted_destination,
      telephone_expediteur: phone,
      telephone_destinataire: phone,
      type_colis: entry.extracted_package_details ? 'Autre' : 'Petit colis',
      description: entry.extracted_package_details || `Commande via WhatsApp — ${entry.phone_number}`,
      type_mission: entry.extracted_pickup_type === 'recuperer' ? 'recuperer' : 'envoyer',
      statut: 'en_attente',
      mode_paiement: 'Paiement à la livraison',
      statut_paiement: 'paiement_livraison',
      client_email: `wa_${entry.phone_number?.replace(/\D/g, '')}@whatsapp.cdl`,
      client_name: entry.client_name || entry.phone_number,
      source: 'whatsapp',
      nombre_tentatives: 0,
    });

    // Mettre à jour l'inbox
    await base44.asServiceRole.entities.WhatsAppOrderInbox.update(inbox_id, {
      status: 'converti_en_course',
      linked_course_id: course.id,
      auto_mode: true,
    });

    // Lancer le dispatch automatique
    await base44.asServiceRole.functions.invoke('autoDispatch', { course_id: course.id });

    console.log(`[WA→COURSE] Inbox ${inbox_id} → Course ${course.id} | dispatch lancé`);
    return Response.json({ success: true, course_id: course.id, inbox_id });

  } catch (error) {
    console.error('[WA→COURSE] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});