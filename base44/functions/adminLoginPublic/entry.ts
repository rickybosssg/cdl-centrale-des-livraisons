Deno.serve(async (req) => {
  const body = await req.json();
  const { email, password } = body;

  if (email === 'weezyh2@gmail.com' && password === 'cdl2025admin') {
    return Response.json({
      success: true,
      role: 'admin',
      source: 'public-function-test',
    });
  }

  return Response.json({
    success: false,
    source: 'public-function-test',
  });
});