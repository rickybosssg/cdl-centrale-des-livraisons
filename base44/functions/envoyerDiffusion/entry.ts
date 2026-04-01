import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });
    }

    const { titre, message, type, destinataires } = await req.json();

    if (!titre || !message || !type || !destinataires?.length) {
      return Response.json({ error: 'Champs manquants' }, { status: 400 });
    }

    // Récupérer tous les utilisateurs selon les cibles
    const cibles = destinataires.includes('tous')
      ? ['client', 'livreur', 'partenaire', 'commercial']
      : destinataires;

    // Récupérer les emails de chaque profil ciblé via UserProfile
    const profilesPromises = cibles.map(type_profil =>
      base44.asServiceRole.entities.UserProfile.filter({
        profile_type: type_profil,
        status: 'actif',
        deleted: false,
      })
    );
    const profilesArrays = await Promise.all(profilesPromises);

    // Dédupliquer les emails
    const emailSet = new Set();
    for (const arr of profilesArrays) {
      for (const p of arr) {
        if (p.user_email) emailSet.add({ email: p.user_email, role: p.profile_type });
      }
    }

    // Construire liste unique (un email = une notif)
    const emailMap = new Map();
    for (const arr of profilesArrays) {
      for (const p of arr) {
        if (p.user_email && !emailMap.has(p.user_email)) {
          emailMap.set(p.user_email, p.profile_type);
        }
      }
    }

    const targets = Array.from(emailMap.entries()).map(([email, role]) => ({ email, role }));
    const nbDestinataires = targets.length;

    // Créer les notifications en batch
    const TYPE_EMOJI = { info: 'ℹ️', alerte: '🚨', promo: '💰', systeme: '⚙️' };
    const notifType = type === 'alerte' ? 'warning' : type === 'promo' ? 'success' : 'info';

    await Promise.all(
      targets.map(({ email, role }) =>
        base44.asServiceRole.entities.Notification.create({
          destinataire_email: email,
          destinataire_role: role,
          titre: `${TYPE_EMOJI[type] || '📢'} ${titre}`,
          message,
          type: notifType,
          lue: false,
        })
      )
    );

    // Enregistrer la diffusion dans l'historique
    await base44.asServiceRole.entities.Diffusion.create({
      titre,
      message,
      type,
      destinataires: JSON.stringify(destinataires),
      nb_destinataires: nbDestinataires,
      statut: 'envoye',
      'envoyé_par': user.email,
      date_envoi: new Date().toISOString(),
    });

    return Response.json({ success: true, nb_destinataires: nbDestinataires });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});