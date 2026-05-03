import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await req.json();
    const { course_id, contenu, sender_role, recipient_email } = body;
    if (!course_id || !contenu) return Response.json({ error: 'Paramètres manquants' }, { status: 400 });

    // Service role = crée le message sans restriction RLS
    const message = await base44.asServiceRole.entities.Message.create({
      course_id,
      sender_email: user.email,
      sender_name: user.full_name,
      sender_role: sender_role || 'client',
      contenu: contenu.trim(),
    });

    // Notifier le destinataire si connu (non-bloquant)
    if (recipient_email && recipient_email !== user.email) {
      base44.asServiceRole.functions.invoke('sendCdlNotification', {
        user_email: recipient_email,
        title: '💬 Nouveau message CDL',
        body: `${user.full_name || user.email} : ${contenu.length > 80 ? contenu.slice(0, 80) + '...' : contenu}`,
        data: {
          type: 'new_message',
          entity_id: course_id,
          entity_type: 'Course',
          notif_route: `/course/${course_id}/track`,
        },
      }).catch(e => console.warn('[sendMessage] notify error:', e?.message));
    }

    return Response.json({ message });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});