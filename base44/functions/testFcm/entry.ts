Deno.serve(async (req) => {
  try {
    const bodyText = await req.text();
    console.log("Body reçu:", bodyText);

    const serviceAccountRaw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") || "";
    console.log("SA longueur:", serviceAccountRaw.length);
    console.log("SA début:", serviceAccountRaw.substring(0, 30));

    let sa;
    try {
      sa = JSON.parse(serviceAccountRaw);
    } catch(e) {
      return Response.json({ error: "SA JSON invalide: " + e.message, raw_start: serviceAccountRaw.substring(0, 50) });
    }

    return Response.json({
      ok: true,
      body: bodyText,
      sa_client_email: sa.client_email,
      sa_project_id: sa.project_id,
    });
  } catch(e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});