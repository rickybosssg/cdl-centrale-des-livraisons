import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await req.json();
    const { course_id } = body;
    if (!course_id) return Response.json({ error: 'course_id manquant' }, { status: 400 });

    // Service role = lit TOUS les messages de la course, sans restriction RLS
    const messages = await base44.asServiceRole.entities.Message.filter(
      { course_id },
      'created_date',
      200
    );

    return Response.json({ messages });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});