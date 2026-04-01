import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Clé de stockage de la dernière alerte dans les notifications
const ALERTE_TAG = '__alerte_livreurs_auto__';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Lire les paramètres passés (ou utiliser les défauts)
  let body = {};
  try { body = await req.json(); } catch (_) {}

  const {
    seuil_courses = 3,           // nb courses en attente pour déclencher
    ratio_seuil = 2,             // courses / livreurs ratio pour déclencher
    delai_min_minutes = 60,      // délai minimum entre deux alertes (minutes)
    actif = true,                // système activé ?
    dry_run = false,             // test sans envoi réel
  } = body;

  if (!actif) {
    return Response.json({ skip: true, reason: 'systeme_desactive' });
  }

  // 1. Vérifier la dernière alerte envoyée
  const dernieresAlertes = await base44.asServiceRole.entities.Notification.filter({
    destinataire_role: 'livreur',
    titre: '🚨 Courses disponibles sur CDL !',
  }, '-created_date', 1);

  if (dernieresAlertes.length > 0) {
    const derniere = dernieresAlertes[0];
    const minutesEcoulees = (Date.now() - new Date(derniere.created_date).getTime()) / 60000;
    if (minutesEcoulees < delai_min_minutes) {
      return Response.json({
        skip: true,
        reason: 'trop_recent',
        prochaine_alerte_dans: Math.ceil(delai_min_minutes - minutesEcoulees) + ' min',
      });
    }
  }

  // 2. Compter les courses en attente
  const coursesEnAttente = await base44.asServiceRole.entities.Course.filter({ statut: 'en_attente' });
  const coursesAucunLivreur = await base44.asServiceRole.entities.Course.filter({ statut: 'aucun_livreur' });
  const totalCoursesDisponibles = coursesEnAttente.length + coursesAucunLivreur.length;

  // 3. Compter les livreurs en ligne (disponibles)
  const livreursEnLigne = await base44.asServiceRole.entities.User.filter({
    user_type: 'livreur',
    disponible: true,
    statut_validation_livreur: 'valide',
  });
  const nbLivreursEnLigne = livreursEnLigne.length;

  // 4. Évaluer si l'alerte doit être déclenchée
  const ratioActuel = nbLivreursEnLigne === 0 ? totalCoursesDisponibles : totalCoursesDisponibles / nbLivreursEnLigne;
  const seuilAtteint = totalCoursesDisponibles >= seuil_courses || ratioActuel >= ratio_seuil;

  if (!seuilAtteint) {
    return Response.json({
      skip: true,
      reason: 'seuil_non_atteint',
      courses_disponibles: totalCoursesDisponibles,
      livreurs_en_ligne: nbLivreursEnLigne,
      ratio: ratioActuel.toFixed(2),
    });
  }

  if (dry_run) {
    return Response.json({
      dry_run: true,
      courses_disponibles: totalCoursesDisponibles,
      livreurs_en_ligne: nbLivreursEnLigne,
      ratio: ratioActuel.toFixed(2),
      message: 'Alerte AURAIT été envoyée',
    });
  }

  // 5. Récupérer TOUS les livreurs validés (en ligne ou hors ligne)
  const tousLivreurs = await base44.asServiceRole.entities.User.filter({
    statut_validation_livreur: 'valide',
  });

  // Exclure les livreurs déjà sur une course active
  const coursesActives = await base44.asServiceRole.entities.Course.filter({ statut: 'en_cours' });
  const livreursOccupes = new Set(coursesActives.map(c => c.livreur_email).filter(Boolean));

  const destinataires = tousLivreurs.filter(l => !livreursOccupes.has(l.email));

  // 6. Envoyer les notifications internes + push FCM
  let nbEnvoyes = 0;
  const message = `🛵 Gagnez de l'argent ! Mettez-vous en ligne, il y a ${totalCoursesDisponibles} course${totalCoursesDisponibles > 1 ? 's' : ''} disponible${totalCoursesDisponibles > 1 ? 's' : ''} en ce moment sur CDL !`;

  await Promise.all(destinataires.map(async (livreur) => {
    try {
      // Notification interne
      await base44.asServiceRole.entities.Notification.create({
        destinataire_email: livreur.email,
        destinataire_role: 'livreur',
        titre: '🚨 Courses disponibles sur CDL !',
        message,
        type: 'warning',
        lue: false,
      });
      // Push FCM
      try {
        await base44.asServiceRole.functions.invoke('sendFcmNotification', {
          user_email: livreur.email,
          title: '🚨 Courses disponibles sur CDL !',
          body: message,
          data: { type: 'alerte_courses', count: String(totalCoursesDisponibles) },
        });
      } catch (_) {}
      nbEnvoyes++;
    } catch (_) {}
  }));

  return Response.json({
    success: true,
    courses_disponibles: totalCoursesDisponibles,
    livreurs_en_ligne: nbLivreursEnLigne,
    ratio: ratioActuel.toFixed(2),
    nb_alertes_envoyees: nbEnvoyes,
    total_livreurs_valides: tousLivreurs.length,
    timestamp: new Date().toISOString(),
  });
});