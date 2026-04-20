/**
 * adminLogin — Endpoint custom authentification admin
 * Validation simple email + password (hardcoding)
 * 
 * Input: { email, password }
 * Output: { success: true, role: "admin" } ou { success: false }
 */

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ success: false }, { status: 405 });
  }

  try {
    const body = await req.json();
    const { email, password } = body;

    // Validation : email exact + password exact
    if (email === 'weezyh2@gmail.com' && password === 'cdl2025admin') {
      return Response.json({ success: true, role: 'admin' });
    }

    return Response.json({ success: false });
  } catch {
    return Response.json({ success: false });
  }
});