Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (email === 'weezyh2@gmail.com' && password === 'cdl2025admin') {
      return Response.json({
        success: true,
        role: 'admin',
        source: 'hardcoded-test',
      });
    }

    return Response.json({
      success: false,
      source: 'hardcoded-test',
    });
  } catch (err) {
    return Response.json({
      success: false,
      error: err.message,
    });
  }
});