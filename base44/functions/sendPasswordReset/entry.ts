import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { email } = await req.json();

    if (!email || !email.includes('@')) {
      return Response.json({ error: 'Email invalide' }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Vérifier que l'utilisateur existe dans l'app
    let userExists = false;
    try {
      const users = await base44.asServiceRole.entities.User.filter({ email: cleanEmail });
      userExists = users.length > 0;
    } catch (e) {
      console.warn('[sendPasswordReset] user check failed:', e.message);
    }

    if (!userExists) {
      // On retourne succès pour ne pas révéler si l'email existe
      console.log('[sendPasswordReset] user not found, returning fake success');
      return Response.json({ success: true });
    }

    // Envoyer l'email de reset via Base44 SendEmail (user inscrit dans l'app)
    try {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: cleanEmail,
        subject: 'CDL — Réinitialisation de votre mot de passe',
        body: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Inter, sans-serif; background: #f8fafc; margin: 0; padding: 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #1877f2, #0d47a1); padding: 32px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 900; letter-spacing: 2px;">CDL</h1>
      <p style="color: rgba(255,255,255,0.8); margin: 4px 0 0; font-size: 12px;">Centrale des Livraisons</p>
    </div>
    <div style="padding: 32px 28px;">
      <h2 style="margin: 0 0 12px; font-size: 18px; color: #111;">Réinitialisation de mot de passe</h2>
      <p style="color: #64748b; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
        Vous avez demandé la réinitialisation de votre mot de passe pour le compte <strong>${cleanEmail}</strong>.
      </p>
      <p style="color: #64748b; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
        Pour réinitialiser votre mot de passe, ouvrez l'application CDL et utilisez l'option <strong>"Mot de passe oublié"</strong> avec votre adresse email. Contactez le support si besoin.
      </p>
      <div style="margin: 24px 0; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 16px; text-align: center;">
        <p style="margin: 0; font-size: 13px; color: #1d4ed8; font-weight: 600;">📱 Application CDL</p>
        <p style="margin: 6px 0 0; font-size: 12px; color: #3b82f6;">Centrale des Livraisons — Ouagadougou</p>
      </div>
      <p style="color: #94a3b8; font-size: 12px; margin: 0;">Si vous n'avez pas fait cette demande, ignorez cet email.</p>
    </div>
    <div style="padding: 16px 28px 24px; text-align: center; border-top: 1px solid #f1f5f9;">
      <p style="margin: 0; font-size: 11px; color: #94a3b8;">© 2024 CDL — Centrale des Livraisons, Ouagadougou</p>
    </div>
  </div>
</body>
</html>
        `.trim(),
      });
      console.log('[sendPasswordReset] email sent to:', cleanEmail);
      return Response.json({ success: true, method: 'base44_email' });
    } catch (emailErr) {
      console.error('[sendPasswordReset] SendEmail failed:', emailErr.message);
      // Si l'email échoue (ex: utilisateur hors app), on tente l'endpoint auth natif
      const APP_ID = Deno.env.get("BASE44_APP_ID") || "69c3c74fc4b62396dca61751";
      const res = await fetch(`https://cdl.base44.app/api/apps/${APP_ID}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail }),
      });
      console.log('[sendPasswordReset] native fallback status:', res.status);
      if (res.ok) {
        return Response.json({ success: true, method: 'native' });
      }
      const errData = await res.json().catch(() => ({}));
      return Response.json({ error: errData?.error || 'Envoi impossible', method: 'failed' }, { status: 400 });
    }

  } catch (error) {
    console.error('[sendPasswordReset] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});