import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { livreur_email, livreur_name, client_name, new_rating, course_id } = await req.json();

    if (!livreur_email || !new_rating) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 1. Récupérer le livreur
    const livreurs = await base44.asServiceRole.entities.User.filter({ email: livreur_email });
    if (livreurs.length === 0) return Response.json({ ok: true, reason: 'livreur_not_found' });
    const livreur = livreurs[0];

    // 2. Mettre à jour la moyenne globale du livreur
    const totalNotes = (livreur.total_notes || 0) + 1;
    const sommeNotes = (livreur.somme_notes || 0) + new_rating;
    const noteMoyenne = sommeNotes / totalNotes;

    // 3. Calcul moyenne 7 derniers jours (depuis LivreurRating)
    const allRatings = await base44.asServiceRole.entities.LivreurRating.filter({ livreur_email });
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const weeklyRatings = allRatings.filter(r => new Date(r.created_date) >= oneWeekAgo);
    const noteSemaine = weeklyRatings.length > 0
      ? weeklyRatings.reduce((acc, r) => acc + (r.rating || 0), 0) / weeklyRatings.length
      : null;

    // 4. Mettre à jour le profil livreur
    await base44.asServiceRole.entities.User.update(livreur.id, {
      total_notes: totalNotes,
      somme_notes: sommeNotes,
      note_moyenne: noteMoyenne,
      livreur_note_moyenne: noteMoyenne,
      livreur_note_semaine: noteSemaine,
    });

    // 5. Notification push FCM + DB au livreur
    const stars = '⭐'.repeat(new_rating);
    const notifMsg = `${client_name || 'Un client'} vous a attribué ${new_rating}/5 ${stars} pour la course #${course_id?.slice(0, 8)}.`;
    
    await base44.asServiceRole.entities.Notification.create({
      destinataire_email: livreur_email,
      destinataire_role: 'livreur',
      titre: `Nouvelle évaluation reçue`,
      message: notifMsg,
      type: new_rating >= 4 ? 'success' : new_rating >= 3 ? 'info' : 'warning',
      lue: false,
      course_id,
      target_screen: `/course-livreur/${course_id}`,
    });

    // Tenter FCM push au livreur
    try {
      const tokens = await base44.asServiceRole.entities.FcmToken.filter({ user_email: livreur_email });
      if (tokens.length > 0) {
        await base44.asServiceRole.functions.invoke('sendFcmNotification', {
          tokens: tokens.map(t => t.token),
          title: 'Nouvelle évaluation reçue',
          body: notifMsg,
          data: {
            type: 'rating_received',
            route: `/course-livreur/${course_id}`,
            notif_route: `/course-livreur/${course_id}`,
            courseId: course_id,
          },
        });
      }
    } catch (_) { /* FCM optionnel */ }

    // 6. Alerte qualité si moyenne semaine < 3
    if (noteSemaine !== null && noteSemaine < 3) {
      await base44.asServiceRole.entities.Notification.create({
        destinataire_email: livreur_email,
        titre: `⚠️ Alerte qualité de service`,
        message: `Votre moyenne sur les 7 derniers jours est de ${noteSemaine.toFixed(1)}/5. Ce niveau risque d'entraîner votre éviction de l'application CDL.`,
        type: 'danger',
        lue: false,
        course_id,
      });

      const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
      for (const admin of admins) {
        if (admin.email) {
          await base44.asServiceRole.entities.Notification.create({
            destinataire_email: admin.email,
            titre: `⚠️ Alerte qualité : ${livreur_name}`,
            message: `Le livreur ${livreur_name} (${livreur_email}) a une moyenne de ${noteSemaine.toFixed(1)}/5 sur les 7 derniers jours (${weeklyRatings.length} évaluation${weeklyRatings.length > 1 ? 's' : ''}).`,
            type: 'danger',
            lue: false,
            course_id,
          });
        }
      }
    }

    return Response.json({ ok: true, noteMoyenne, noteSemaine });
  } catch (error) {
    console.error('[ratingNotify] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});