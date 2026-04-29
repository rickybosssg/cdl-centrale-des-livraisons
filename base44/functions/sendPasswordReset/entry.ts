import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Endpoint natif Base44 qui génère un vrai lien de réinitialisation
// avec token sécurisé envoyé par email (géré par Base44 platform)
Deno.serve(async (req) => {
  try {
    const { email } = await req.json();

    if (!email || !email.includes('@')) {
      return Response.json({ error: 'Email invalide' }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();
    const APP_ID = Deno.env.get("BASE44_APP_ID") || "69c3c74fc4b62396dca61751";
    const AUTH_BASE = `https://app.base44.com/api/apps/${APP_ID}/auth`;

    console.log('[sendPasswordReset] Sending reset for:', cleanEmail);

    // Appel à l'endpoint natif Base44 qui envoie le vrai lien de réinitialisation
    const res = await fetch(`${AUTH_BASE}/send-reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail }),
    });

    const responseText = await res.text();
    let responseData = {};
    try { responseData = JSON.parse(responseText); } catch (_) {}

    console.log('[sendPasswordReset] Base44 auth response:', res.status, responseText.slice(0, 200));

    // On retourne toujours success côté client pour ne pas révéler si l'email existe
    // (sécurité anti-énumération)
    return Response.json({ success: true, status: res.status });

  } catch (error) {
    console.error('[sendPasswordReset] error:', error.message);
    // On retourne success même en cas d'erreur pour ne pas bloquer l'UX
    return Response.json({ success: true });
  }
});