import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { publicite_id, interaction_type, user_id, user_email, user_role } = await req.json();

    if (!publicite_id || !interaction_type) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Récupérer la publicité
    const pubs = await base44.entities.Publicite.filter({ id: publicite_id });
    if (pubs.length === 0) {
      return Response.json({ error: 'Publicité introuvable' }, { status: 404 });
    }

    const pub = pubs[0];

    // Incrémenter selon le type d'interaction
    if (interaction_type === 'view') {
      const newImpressions = (pub.impressions || 0) + 1;
      await base44.entities.Publicite.update(publicite_id, {
        impressions: newImpressions,
      });
    } else if (interaction_type === 'click') {
      const newClicks = (pub.clics || 0) + 1;
      await base44.entities.Publicite.update(publicite_id, {
        clics: newClicks,
      });
    }

    // Logger l'interaction pour analytics
    await base44.entities.AdminActionLog.create({
      admin_email: user_email,
      object_type: 'publicite',
      object_id: publicite_id,
      object_name: pub.titre || 'Sans titre',
      action: interaction_type === 'view' ? 'view' : 'click',
      reason: `${user_role} - ${interaction_type}`,
      target_email: user_email,
    });

    return Response.json({ success: true, interaction: interaction_type });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});