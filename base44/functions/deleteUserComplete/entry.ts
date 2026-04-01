import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Vérifier si admin
    if (user?.role !== 'admin' && user?.user_type !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { user_id, user_email, profile_type } = await req.json();

    if (!user_id && !user_email) {
      return Response.json({ error: 'user_id or user_email required' }, { status: 400 });
    }

    console.log(`[deleteUserComplete] Suppression par ${user.email} - userId: ${user_id}, email: ${user_email}, type: ${profile_type}`);

    let deletedCount = 0;
    const email = user_email;

    // 1. Supprimer les UserProfile liés
    const profiles = await base44.asServiceRole.entities.UserProfile.filter({ user_email: email });
    console.log(`[deleteUserComplete] ${profiles.length} profil(s) UserProfile trouvé(s)`);
    for (const profile of profiles) {
      try {
        await base44.asServiceRole.entities.UserProfile.delete(profile.id);
        deletedCount++;
      } catch (err) {
        console.error(`[deleteUserComplete] Erreur suppression profil ${profile.id}:`, err.message);
      }
    }

    // 2. Supprimer les données Partenaire si commercial
    if (profile_type === 'partenaire') {
      const partners = await base44.asServiceRole.entities.Partenaire.filter({ user_email: email });
      console.log(`[deleteUserComplete] ${partners.length} partenaire(s) trouvé(s)`);
      for (const partner of partners) {
        try {
          await base44.asServiceRole.entities.Partenaire.delete(partner.id);
          deletedCount++;
        } catch (err) {
          console.error(`[deleteUserComplete] Erreur suppression partenaire ${partner.id}:`, err.message);
        }
      }
    }

    // 3. Supprimer les transactions liées
    const transactions = await base44.asServiceRole.entities.Transaction.filter({ user_email: email });
    console.log(`[deleteUserComplete] ${transactions.length} transaction(s) trouvée(s)`);
    for (const tx of transactions) {
      try {
        await base44.asServiceRole.entities.Transaction.delete(tx.id);
        deletedCount++;
      } catch (err) {
        console.error(`[deleteUserComplete] Erreur suppression transaction ${tx.id}:`, err.message);
      }
    }

    // 4. Supprimer les Bedou
    const bedous = await base44.asServiceRole.entities.Bedou.filter({ user_email: email });
    console.log(`[deleteUserComplete] ${bedous.length} bedou trouvé(s)`);
    for (const bedou of bedous) {
      try {
        await base44.asServiceRole.entities.Bedou.delete(bedou.id);
        deletedCount++;
      } catch (err) {
        console.error(`[deleteUserComplete] Erreur suppression bedou ${bedou.id}:`, err.message);
      }
    }

    // 5. Supprimer les notifications
    const notifications = await base44.asServiceRole.entities.Notification.filter({ destinataire_email: email });
    console.log(`[deleteUserComplete] ${notifications.length} notification(s) trouvée(s)`);
    for (const notif of notifications) {
      try {
        await base44.asServiceRole.entities.Notification.delete(notif.id);
        deletedCount++;
      } catch (err) {
        console.error(`[deleteUserComplete] Erreur suppression notification ${notif.id}:`, err.message);
      }
    }

    // 6. Supprimer les demandes de recharge/retrait
    const recharges = await base44.asServiceRole.entities.DemandeRecharge.filter({ user_email: email });
    console.log(`[deleteUserComplete] ${recharges.length} recharge(s) trouvée(s)`);
    for (const r of recharges) {
      try {
        await base44.asServiceRole.entities.DemandeRecharge.delete(r.id);
        deletedCount++;
      } catch (err) {
        console.error(`[deleteUserComplete] Erreur suppression recharge ${r.id}:`, err.message);
      }
    }

    const retraits = await base44.asServiceRole.entities.DemandeRetrait.filter({ user_email: email });
    console.log(`[deleteUserComplete] ${retraits.length} retrait(s) trouvé(s)`);
    for (const r of retraits) {
      try {
        await base44.asServiceRole.entities.DemandeRetrait.delete(r.id);
        deletedCount++;
      } catch (err) {
        console.error(`[deleteUserComplete] Erreur suppression retrait ${r.id}:`, err.message);
      }
    }

    // 7. Supprimer les Admin Permissions liées
    const perms = await base44.asServiceRole.entities.AdminPermission.filter({ user_email: email });
    console.log(`[deleteUserComplete] ${perms.length} permission(s) admin trouvée(s)`);
    for (const perm of perms) {
      try {
        await base44.asServiceRole.entities.AdminPermission.delete(perm.id);
        deletedCount++;
      } catch (err) {
        console.error(`[deleteUserComplete] Erreur suppression permission ${perm.id}:`, err.message);
      }
    }

    // 8. Supprimer l'utilisateur User lui-même (en dernier)
    if (user_id) {
      try {
        await base44.asServiceRole.entities.User.delete(user_id);
        console.log(`[deleteUserComplete] ✅ User ${user_id} supprimé`);
        deletedCount++;
      } catch (err) {
        console.error(`[deleteUserComplete] Erreur suppression User ${user_id}:`, err.message);
      }
    }

    console.log(`[deleteUserComplete] ✅ Suppression complète - ${deletedCount} entité(s) supprimée(s)`);

    return Response.json({
      success: true,
      user_email: email,
      deleted_count: deletedCount,
      message: `Utilisateur ${email} et ses ${deletedCount} donnée(s) supprimé(s)`,
    });
  } catch (error) {
    console.error('[deleteUserComplete] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});