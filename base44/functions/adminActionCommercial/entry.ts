import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const payload = await req.json();
    const { code_promo_id, commercial_email, action, reason } = payload;

    const code = await base44.entities.CodePromo.filter({ id: code_promo_id });
    if (code.length === 0) {
      return Response.json({ error: 'Code not found' }, { status: 404 });
    }

    const c = code[0];
    const updates = {};
    let notificationMsg = '';

    if (action === 'suspend') {
      updates.suspended = true;
      updates.suspended_at = new Date().toISOString();
      updates.actif = false;
      notificationMsg = `Votre code promo CDL a été suspendu. Raison: ${reason || 'Non spécifiée'}`;
    } else if (action === 'unsuspend') {
      updates.suspended = false;
      updates.suspended_at = null;
      updates.actif = true;
      notificationMsg = 'Votre code promo CDL a été réactivé.';
    } else if (action === 'delete') {
      updates.deleted = true;
      updates.deleted_at = new Date().toISOString();
      updates.actif = false;
      notificationMsg = `Votre code promo CDL a été supprimé. Raison: ${reason || 'Non spécifiée'}`;
    } else if (action === 'restore') {
      updates.deleted = false;
      updates.deleted_at = null;
      updates.actif = true;
      notificationMsg = 'Votre code promo CDL a été restauré.';
    }

    await base44.entities.CodePromo.update(code_promo_id, updates);

    // Log action
    await base44.entities.AdminActionLog.create({
      admin_email: user.email,
      object_type: 'commercial',
      object_id: code_promo_id,
      object_name: c.code,
      action,
      reason,
      target_email: commercial_email,
      old_data: JSON.stringify({ suspended: c.suspended, deleted: c.deleted, actif: c.actif }),
      new_data: JSON.stringify(updates),
    });

    // Notify commercial
    await base44.entities.Notification.create({
      destinataire_email: commercial_email,
      destinataire_role: 'commercial',
      titre: action === 'suspend' ? '🔒 Code suspendu' : action === 'delete' ? '❌ Code supprimé' : '✅ Code réactivé',
      message: notificationMsg,
      type: action === 'suspend' || action === 'delete' ? 'warning' : 'success',
      lue: false,
    });

    return Response.json({ success: true, action, updates });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});