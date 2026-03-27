import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await req.json();
    const { course_id, contenu, sender_role } = body;
    if (!course_id || !contenu) return Response.json({ error: 'Paramètres manquants' }, { status: 400 });

    // Service role = crée le message sans restriction RLS
    const message = await base44.asServiceRole.entities.Message.create({
      course_id,
      sender_email: user.email,
      sender_name: user.full_name,
      sender_role: sender_role || 'client',
      contenu: contenu.trim(),
    });

    return Response.json({ message });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});