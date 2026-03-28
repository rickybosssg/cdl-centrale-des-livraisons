import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { livreur_email, livreur_name, new_rating, course_id } = await req.json();

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

    const updateData = { note_semaine: noteSemaine };

    // Si moyenne semaine < 3 → alerte
    if (noteSemaine !== null && noteSemaine < 3) {
      updateData.alerte_qualite_envoyee = now.toISOString();

      // Notification à l'admin par email
      const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
      for (const admin of admins) {
        if (admin.email) {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: admin.email,
            subject: `⚠️ Alerte qualité livreur : ${livreur_name}`,
            body: `
              <h2>Alerte qualité de service</h2>
              <p>Le livreur <strong>${livreur_name}</strong> (${livreur_email}) a une moyenne de <strong style="color:red">${noteSemaine.toFixed(1)}/5</strong> sur les 7 derniers jours.</p>
              <p>Nombre d'évaluations cette semaine : ${weeklyRatings.length}</p>
              <p>Dernière note reçue : ${new_rating}/5 (Course #${course_id?.slice(0, 8)})</p>
              <p>Une action est recommandée : contacter ce livreur ou envisager une suspension.</p>
            `
          });
        }
      }

      // Message d'alerte au livreur
      if (livreur.email) {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: livreur.email,
          subject: `⚠️ Alerte sur la qualité de votre service - CDL`,
          body: `
            <h2>Bonjour ${livreur_name},</h2>
            <p>Nous souhaitons vous informer que votre <strong>moyenne de satisfaction clients est de ${noteSemaine.toFixed(1)}/5</strong> sur les 7 derniers jours, ce qui est en dessous de notre seuil de qualité (3/5).</p>
            <p>Une telle performance risque de vous exposer à <strong>une suspension ou une éviction de l'application CDL</strong>.</p>
            <p>Nous vous encourageons à améliorer votre qualité de service : ponctualité, communication avec les clients, et soin des colis.</p>
            <p>Notre équipe reste disponible pour vous accompagner.</p>
            <p>— L'équipe CDL Ouagadougou</p>
          `
        });
      }
    }

    await base44.asServiceRole.entities.User.update(livreur.id, updateData);

    return Response.json({ ok: true, noteSemaine });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});