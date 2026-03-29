import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { email } = await req.json();

    if (!email) {
      return Response.json({ error: 'Email requis' }, { status: 400 });
    }

    await base44.users.inviteUser(email, 'admin');
    return Response.json({ success: true, message: `Admin invité: ${email}` });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});