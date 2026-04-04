import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Non authentifié' }, { status: 401 });

  const { new_full_name, new_telephone, old_full_name, old_telephone } = await req.json();

  if (!new_full_name?.trim() || !new_telephone?.trim()) {
    return Response.json({ error: 'Nom et téléphone obligatoires' }, { status: 400 });
  }

  // Mise à jour du profil utilisateur
  await base44.auth.updateMe({
    full_name: new_full_name.trim(),
    telephone: new_telephone.trim(),
  });

  const now = new Date().toISOString();

  // Journal des modifications (ProfileChangeLog)
  const changes = [];
  if (old_full_name !== new_full_name) {
    changes.push({ field: 'full_name', old: old_full_name, new: new_full_name });
  }
  if (old_telephone !== new_telephone) {
    changes.push({ field: 'telephone', old: old_telephone, new: new_telephone });
  }

  for (const change of changes) {
    await base44.asServiceRole.entities.ProfileChangeLog.create({
      user_id: user.id,
      user_email: user.email,
      field: change.field,
      old_value: change.old || '',
      new_value: change.new || '',
      source: 'user',
      user_roles: JSON.stringify([user.role, user.user_type, user.active_profile_type].filter(Boolean)),
    });
  }

  // Notification aux admins
  if (changes.length > 0) {
    const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
    const lines = changes.map(c => {
      const label = c.field === 'full_name' ? 'Nom complet' : 'Téléphone';
      return `• ${label} : "${c.old}" → "${c.new}"`;
    }).join('\n');

    const message = `👤 ${user.full_name || user.email} a modifié ses informations personnelles :\n${lines}\n\nDate : ${new Date(now).toLocaleString('fr-FR')}\nRôle(s) : ${[user.role, user.active_profile_type].filter(Boolean).join(', ')}`;

    await Promise.all(admins.map(admin =>
      base44.asServiceRole.entities.Notification.create({
        destinataire_email: admin.email,
        destinataire_role: 'admin',
        titre: '📝 Modification de profil utilisateur',
        message,
        type: 'info',
        lue: false,
        target_screen: `/admin/profil/${user.id}`,
        target_entity_id: user.id,
        target_entity_type: 'profil',
      })
    ));
  }

  return Response.json({ success: true });
});