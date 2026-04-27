import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const APP_ID = "69c3c74fc4b62396dca61751";
const AUTH_BASE = `https://app.base44.com/api/apps/${APP_ID}/auth`;
const APP_URL = "https://cdl.base44.app";

Deno.serve(async (req) => {
  try {
    const { email } = await req.json();

    if (!email || !email.includes('@')) {
      return Response.json({ error: 'Email invalide' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 1. Demander le reset à Base44 (génère le token côté plateforme)
    const resetRes = await fetch(`${AUTH_BASE}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail }),
    });

    const resetData = await resetRes.json().catch(() => ({}));

    // Si Base44 retourne un token ou un lien, on l'utilise
    // Sinon on génère un lien générique vers la page de reset
    const resetToken = resetData?.reset_token || resetData?.token || null;
    const resetLink = resetToken
      ? `${APP_URL}/connexion?reset_token=${resetToken}`
      : `${APP_URL}/connexion?mode=reset&email=${encodeURIComponent(normalizedEmail)}`;

    // 2. Envoyer l'email via Base44 Core.SendEmail (intégration native)
    const base44 = createClientFromRequest(req);

    await base44.asServiceRole.integrations.Core.SendEmail({
      from_name: 'CDL — Centrale des Livraisons',
      to: normalizedEmail,
      subject: '🔑 Réinitialisation de votre mot de passe CDL',
      body: `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Réinitialisation de mot de passe</title>
</head>
<body style="margin:0;padding:0;font-family:Inter,Arial,sans-serif;background:#f1f5f9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:480px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.10);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1877f2 0%,#0d47a1 100%);padding:32px 32px 24px;text-align:center;">
              <div style="font-size:32px;font-weight:900;color:#ffffff;letter-spacing:4px;margin-bottom:4px;">CDL</div>
              <div style="font-size:13px;color:rgba(255,255,255,0.75);font-weight:500;">Centrale des Livraisons</div>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 32px 24px;">
              <h2 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a;">🔑 Réinitialisation de mot de passe</h2>
              <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6;">
                Vous avez demandé la réinitialisation de votre mot de passe CDL.<br/>
                Cliquez sur le bouton ci-dessous pour définir un nouveau mot de passe.
              </p>
              <div style="text-align:center;margin:28px 0;">
                <a href="${resetLink}"
                   style="display:inline-block;padding:15px 36px;background:linear-gradient(135deg,#1877f2 0%,#0d47a1 100%);color:#ffffff;font-size:15px;font-weight:700;border-radius:12px;text-decoration:none;box-shadow:0 4px 15px rgba(24,119,242,0.35);">
                  Réinitialiser mon mot de passe
                </a>
              </div>
              <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;line-height:1.5;">
                Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br/>
                <span style="color:#1877f2;word-break:break-all;">${resetLink}</span>
              </p>
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                ⚠️ Si vous n'avez pas demandé cette réinitialisation, ignorez cet email. Votre compte reste sécurisé.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:16px 32px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#94a3b8;">
                CDL — Centrale des Livraisons · Ouagadougou, Burkina Faso
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `.trim(),
    });

    return Response.json({ success: true, message: 'Email de réinitialisation envoyé' });

  } catch (error) {
    console.error('[sendPasswordResetEmail] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});