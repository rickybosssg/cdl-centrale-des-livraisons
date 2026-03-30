import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const payload = await req.json();
    const { partenaire_id, action, reason } = payload;

    const partner = await base44.entities.Partenaire.filter({ id: partenaire_id });
    if (partner.length === 0) {
      return Response.json({ error: 'Partner not found' }, { status: 404 });
    }

    const p = partner[0];
    const updates = {};
    let notificationMsg = '';

    if (action === 'suspend') {
      updates.suspended = true;
      updates.suspended_at = new Date().toISOString();
      updates.suspended_by_admin_email = user.email;
      updates.suspension_reason = reason;
      updates.ouvert = false;
      updates.statut = 'suspendu';
      notificationMsg = `Votre compte partenaire CDL a été suspendu. Raison: ${reason || 'Non spécifiée'}`;
    } else if (action === 'unsuspend') {
      updates.suspended = false;
      updates.suspended_at = null;
      updates.statut = 'actif';
      updates.ouvert = true;
      notificationMsg = 'Votre compte partenaire CDL a été réactivé.';
    } else if (action === 'delete') {
      updates.deleted = true;
      updates.deleted_at = new Date().toISOString();
      updates.deleted_by_admin_email = user.email;
      updates.delete_reason = reason;
      updates.ouvert = false;
      updates.suspended = true;
      notificationMsg = `Votre compte partenaire CDL a été supprimé. Raison: ${reason || 'Non spécifiée'}`;
    } else if (action === 'restore') {
      updates.deleted = false;
      updates.deleted_at = null;
      updates.deleted_by_admin_email = null;
      updates.suspended = false;
      updates.suspended_at = null;
      updates.statut = 'actif';
      updates.ouvert = true;
      notificationMsg = 'Votre compte partenaire CDL a été restauré.';
    }

    await base44.entities.Partenaire.update(partenaire_id, updates);

    // Log action
    await base44.entities.AdminActionLog.create({
      admin_email: user.email,
      object_type: 'partenaire',
      object_id: partenaire_id,
      object_name: p.nom_commerce,
      action,
      reason,
      target_email: p.user_email,
      old_data: JSON.stringify({ suspended: p.suspended, deleted: p.deleted, statut: p.statut }),
      new_data: JSON.stringify(updates),
    });

    // Notify partner
    await base44.entities.Notification.create({
      destinataire_email: p.user_email,
      destinataire_role: 'partenaire',
      titre: action === 'suspend' ? '🔒 Compte suspendu' : action === 'delete' ? '❌ Compte supprimé' : '✅ Compte réactivé',
      message: notificationMsg,
      type: action === 'suspend' || action === 'delete' ? 'warning' : 'success',
      lue: false,
    });

    return Response.json({ success: true, action, updates });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});