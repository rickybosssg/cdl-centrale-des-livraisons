import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Suppression totale d'un utilisateur et de tous ses profils liés
 * Action irreversible - requiert confirmation admin
 */
Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Vérifier que c'est un admin
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { user_id, user_email } = await req.json();

    if (!user_id || !user_email) {
      return Response.json({ error: 'Missing user_id or user_email' }, { status: 400 });
    }

    // Étape 1: Récupérer l'utilisateur à supprimer
    const targetUser = await base44.entities.User.filter({ id: user_id });
    if (!targetUser || targetUser.length === 0) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const deletingUser = targetUser[0];

    // Étape 2: Récupérer tous les profils liés
    const profiles = await base44.entities.UserProfile.filter({ user_email: deletingUser.email });
    const profileIds = (profiles || []).map(p => p.id);

    // Étape 3: Supprimer les données associées aux profils
    // - Notifications
    // - Messages
    // - etc.
    try {
      const notifications = await base44.entities.Notification.filter({ destinataire_email: deletingUser.email });
      for (const notif of notifications || []) {
        await base44.entities.Notification.delete(notif.id);
      }
    } catch (_) {}

    try {
      const messages = await base44.entities.Message.filter({ livreur_email: deletingUser.email });
      for (const msg of messages || []) {
        await base44.entities.Message.delete(msg.id);
      }
    } catch (_) {}

    try {
      const messagesAdmin = await base44.entities.MessageAdmin.filter({ livreur_email: deletingUser.email });
      for (const msg of messagesAdmin || []) {
        await base44.entities.MessageAdmin.delete(msg.id);
      }
    } catch (_) {}

    // Supprimer les données Bedou/Transactions
    try {
      const bedou = await base44.entities.Bedou.filter({ user_email: deletingUser.email });
      for (const b of bedou || []) {
        await base44.entities.Bedou.delete(b.id);
      }
    } catch (_) {}

    try {
      const transactions = await base44.entities.Transaction.filter({ user_email: deletingUser.email });
      for (const tx of transactions || []) {
        await base44.entities.Transaction.delete(tx.id);
      }
    } catch (_) {}

    try {
      const demandes = await base44.entities.DemandeRecharge.filter({ user_email: deletingUser.email });
      for (const d of demandes || []) {
        await base44.entities.DemandeRecharge.delete(d.id);
      }
    } catch (_) {}

    try {
      const retraits = await base44.entities.DemandeRetrait.filter({ user_email: deletingUser.email });
      for (const r of retraits || []) {
        await base44.entities.DemandeRetrait.delete(r.id);
      }
    } catch (_) {}

    // Supprimer les courses liées
    try {
      const coursesClient = await base44.entities.Course.filter({ client_email: deletingUser.email });
      for (const c of coursesClient || []) {
        await base44.entities.Course.delete(c.id);
      }
    } catch (_) {}

    try {
      const coursesLivreur = await base44.entities.Course.filter({ livreur_email: deletingUser.email });
      for (const c of coursesLivreur || []) {
        await base44.entities.Course.delete(c.id);
      }
    } catch (_) {}

    // Supprimer les commandes partenaire
    try {
      const commandes = await base44.entities.CommandePartenaire.filter({ partenaire_email: deletingUser.email });
      for (const cmd of commandes || []) {
        await base44.entities.CommandePartenaire.delete(cmd.id);
      }
    } catch (_) {}

    // Supprimer les fiches partenaire
    try {
      const partenaires = await base44.entities.Partenaire.filter({ user_email: deletingUser.email });
      for (const p of partenaires || []) {
        await base44.entities.Partenaire.delete(p.id);
      }
    } catch (_) {}

    // Supprimer les codes promo commerciaux
    try {
      const codes = await base44.entities.CodePromo.filter({ commercial_email: deletingUser.email });
      for (const c of codes || []) {
        await base44.entities.CodePromo.delete(c.id);
      }
    } catch (_) {}

    // Supprimer les profils liés
    for (const profileId of profileIds) {
      try {
        await base44.entities.UserProfile.delete(profileId);
      } catch (_) {}
    }

    // Étape 4: Supprimer l'utilisateur
    await base44.entities.User.delete(user_id);

    // Étape 5: Logger l'action
    try {
      await base44.entities.AdminActionLog.create({
        admin_email: user.email,
        object_type: 'utilisateur',
        object_id: user_id,
        object_name: deletingUser.full_name || deletingUser.email,
        action: 'delete',
        reason: 'Suppression complète du compte utilisateur et de tous les profils',
        target_email: deletingUser.email,
        old_data: JSON.stringify({
          id: deletingUser.id,
          email: deletingUser.email,
          full_name: deletingUser.full_name,
          user_type: deletingUser.user_type,
          profiles_deleted: profileIds.length,
        }),
      });
    } catch (_) {}

    return Response.json({
      success: true,
      message: `Utilisateur ${deletingUser.full_name} et ${profileIds.length} profil(s) supprimés avec succès`,
      deleted: {
        user_id,
        user_email: deletingUser.email,
        profiles_count: profileIds.length,
      },
    });
  } catch (error) {
    console.error('[deleteUserComplete] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});