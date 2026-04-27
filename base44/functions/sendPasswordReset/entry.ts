import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const APP_ID = Deno.env.get("BASE44_APP_ID") || "69c3c74fc4b62396dca61751";
const AUTH_BASE = `https://cdl.base44.app/api/apps/${APP_ID}/auth`;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { email } = await req.json();

    if (!email || !email.includes('@')) {
      return Response.json({ error: 'Email invalide' }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();

    // 1. Tenter l'endpoint natif Base44 reset-password
    let nativeOk = false;
    try {
      const res = await fetch(`${AUTH_BASE}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail }),
      });
      nativeOk = res.ok;
      console.log('[sendPasswordReset] native reset-password status:', res.status);
    } catch (e) {
      console.warn('[sendPasswordReset] native endpoint failed:', e.message);
    }

    if (nativeOk) {
      return Response.json({ success: true, method: 'native' });
    }

    // 2. Fallback: envoyer email via base44.integrations.Core.SendEmail
    // Générer un token simple basé sur l'email + timestamp
    const token = btoa(`${cleanEmail}:${Date.now()}`).replace(/[+/=]/g, '');
    const resetLink = `https://cdl.base44.app/?reset_token=${token}&email=${encodeURIComponent(cleanEmail)}`;

    // Stocker le token temporairement (24h) dans la BDD
    try {
      // Nettoyer les anciens tokens pour cet email
      const existing = await base44.asServiceRole.entities.PhoneOtpTemp.filter({ email: cleanEmail });
      for (const old of existing) {
        await base44.asServiceRole.entities.PhoneOtpTemp.delete(old.id);
      }
      // Créer le nouveau token
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await base44.asServiceRole.entities.PhoneOtpTemp.create({
        email: cleanEmail,
        otp_code: token,
        expires_at: expires,
        used: false,
      });
    } catch (e) {
      console.warn('[sendPasswordReset] token storage failed:', e.message);
    }

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
        Vous avez demandé la réinitialisation de votre mot de passe pour le compte associé à <strong>${cleanEmail}</strong>.
      </p>
      <p style="color: #64748b; font-size: 13px; margin: 0 0 8px;">
        Connectez-vous à l'application CDL et créez un nouveau mot de passe.<br>
        Si vous n'avez pas fait cette demande, ignorez cet email.
      </p>
      <div style="margin: 24px 0; background: #f1f5f9; border-radius: 10px; padding: 16px; text-align: center;">
        <p style="margin: 0; font-size: 12px; color: #94a3b8;">Ce lien expire dans 24 heures</p>
        <p style="margin: 8px 0 0; font-size: 11px; color: #cbd5e1;">Si vous avez des difficultés, contactez le support CDL.</p>
      </div>
    </div>
    <div style="padding: 16px 28px 24px; text-align: center; border-top: 1px solid #f1f5f9;">
      <p style="margin: 0; font-size: 11px; color: #94a3b8;">© 2024 CDL — Centrale des Livraisons, Ouagadougou</p>
    </div>
  </div>
</body>
</html>
      `.trim(),
    });

    console.log('[sendPasswordReset] fallback email sent to:', cleanEmail);
    return Response.json({ success: true, method: 'email_fallback' });

  } catch (error) {
    console.error('[sendPasswordReset] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});