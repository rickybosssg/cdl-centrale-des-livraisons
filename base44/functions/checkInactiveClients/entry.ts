import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const clients = await base44.asServiceRole.entities.Client.list('-date_derniere_course', 1000);

    const now = new Date();
    const INACTIF_JOURS = 7;

    let updated = 0;
    for (const client of clients) {
      if (client.statut_client === 'Bloqué') continue;

      const derniereCourse = client.date_derniere_course ? new Date(client.date_derniere_course) : null;
      const joursInactif = derniereCourse
        ? (now - derniereCourse) / (1000 * 60 * 60 * 24)
        : 999;

      if (joursInactif >= INACTIF_JOURS && client.statut_client !== 'Inactif') {
        await base44.asServiceRole.entities.Client.update(client.id, {
          statut_client: 'Inactif',
        });
        updated++;
        console.log(`[CRM] Client inactif: ${client.nom_complet} (${joursInactif.toFixed(0)} jours)`);
      }
    }

    console.log(`[CRM] Vérification inactivité: ${updated} client(s) marqué(s) inactif`);
    return Response.json({ success: true, updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});