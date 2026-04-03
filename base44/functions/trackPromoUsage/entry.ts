import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { action, code, commercial_email } = await req.json();

    if (!code || !commercial_email) {
      return Response.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // Get the CodePromo record
    const codeRecords = await base44.entities.CodePromo.filter({ code, commercial_email });
    if (codeRecords.length === 0) {
      return Response.json({ error: 'Code not found' }, { status: 404 });
    }

    const codeRecord = codeRecords[0];

    // Track action
    if (action === 'share') {
      // Just count share events (not essential, but nice to have)
      // Could store in a separate PromoStats entity if needed
      console.log(`[trackPromoUsage] Share event: ${code}`);
    } else if (action === 'signup') {
      // Increment usage count
      await base44.entities.CodePromo.update(codeRecord.id, {
        nombre_utilisations: (codeRecord.nombre_utilisations || 0) + 1,
      });
      console.log(`[trackPromoUsage] Signup with code: ${code}`);
    } else if (action === 'first_course_completed') {
      // User completed first course - add 50F commission
      const newDue = (codeRecord.commission_due || 0) + 50;
      await base44.entities.CodePromo.update(codeRecord.id, {
        commission_due: newDue,
      });
      console.log(`[trackPromoUsage] First course completed: ${code} (+50F)`);
    }

    return Response.json({ success: true, message: `Action '${action}' tracked for code '${code}'` });
  } catch (error) {
    console.error('[trackPromoUsage] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});