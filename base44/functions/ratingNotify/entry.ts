import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { livreur_email, livreur_name, client_name, new_rating, course_id } = await req.json();

    // Calcul moyenne sur les 7 derniers jours
    const allRatings = await base44.asServiceRole.entities.LivreurRating.filter({ livreur_email });
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weeklyRatings = allRatings.filter(r => new Date(r.created_date) >= oneWeekAgo);

    let noteSemaine = null;
    if (weeklyRatings.length > 0) {
      const sum = weeklyRatings.reduce((acc, r) => acc + (r.rating || 0), 0);
      noteSemaine = sum / weeklyRatings.length;
    }

    // Mettre à jour la note semaine du livreur
    const livreurs = await base44.asServiceRole.entities.User.filter({ email: livreur_email });
    if (livreurs.length === 0) return Response.json({ ok: true });
    const livreur = livreurs[0];

    await base44.asServiceRole.entities.User.update(livreur.id, { note_semaine: noteSemaine });

    // Notification au livreur : le client l'a noté
    const stars = '⭐'.repeat(new_rating);
    await base44.asServiceRole.entities.Notification.create({
      destinataire_email: livreur_email,
      titre: `Vous avez reçu une note`,
      message: `${client_name || 'Un client'} vous a attribué ${new_rating}/5 ${stars} pour la course #${course_id?.slice(0, 8)}.`,
      type: new_rating >= 4 ? 'success' : new_rating >= 3 ? 'info' : 'warning',
      lue: false,
      course_id,
    });

    // Si moyenne semaine < 3 → alerte
    if (noteSemaine !== null && noteSemaine < 3) {
      // Notification d'alerte au livreur
      await base44.asServiceRole.entities.Notification.create({
        destinataire_email: livreur_email,
        titre: `⚠️ Alerte qualité de service`,
        message: `Votre moyenne sur les 7 derniers jours est de ${noteSemaine.toFixed(1)}/5. Ce niveau de satisfaction est insuffisant et risque d'entraîner votre éviction de l'application CDL. Merci d'améliorer votre qualité de service.`,
        type: 'danger',
        lue: false,
        course_id,
      });

      // Notification à tous les admins
      const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
      for (const admin of admins) {
        if (admin.email) {
          await base44.asServiceRole.entities.Notification.create({
            destinataire_email: admin.email,
            titre: `⚠️ Alerte qualité : ${livreur_name}`,
            message: `Le livreur ${livreur_name} (${livreur_email}) a une moyenne de ${noteSemaine.toFixed(1)}/5 sur les 7 derniers jours (${weeklyRatings.length} évaluation${weeklyRatings.length > 1 ? 's' : ''}). Une action est recommandée.`,
            type: 'danger',
            lue: false,
            course_id,
          });
        }
      }
    }

    return Response.json({ ok: true, noteSemaine });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});