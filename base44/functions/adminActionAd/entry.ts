import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const payload = await req.json();
    const { pub_id, action, reason } = payload;

    const pub = await base44.entities.Publicite.filter({ id: pub_id });
    if (pub.length === 0) {
      return Response.json({ error: 'Ad not found' }, { status: 404 });
    }

    const p = pub[0];
    const updates = {};

    if (action === 'suspend') {
      updates.suspended = true;
      updates.suspended_at = new Date().toISOString();
      updates.active = false;
    } else if (action === 'unsuspend') {
      updates.suspended = false;
      updates.suspended_at = null;
      updates.active = true;
    } else if (action === 'delete') {
      updates.deleted = true;
      updates.deleted_at = new Date().toISOString();
      updates.active = false;
    } else if (action === 'restore') {
      updates.deleted = false;
      updates.deleted_at = null;
      updates.active = true;
    }

    await base44.entities.Publicite.update(pub_id, updates);

    // Log action
    await base44.entities.AdminActionLog.create({
      admin_email: user.email,
      object_type: 'publicite',
      object_id: pub_id,
      object_name: p.titre,
      action,
      reason,
      old_data: JSON.stringify({ suspended: p.suspended, deleted: p.deleted, active: p.active }),
      new_data: JSON.stringify(updates),
    });

    return Response.json({ success: true, action, updates });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});