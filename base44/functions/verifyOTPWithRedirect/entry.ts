/**
 * verifyOTPWithRedirect — Vérifier OTP, créer/trouver user, générer session token
 *
 * Flux :
 * 1. Vérifier le code OTP via Twilio
 * 2. Trouver ou créer l'utilisateur par téléphone
 * 3. Générer un vrai token de session Base44 via login platform
 * 4. Retourner le token + redirect_url au frontend
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Mot de passe déterministe basé sur le numéro — stable, jamais visible utilisateur
function derivePassword(phone) {
  const base = phone.replace(/\D/g, '');
  return `CDL_${base}_2025!`;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ success: false, error: 'Method must be POST' }, { status: 405 });
  }

  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken  = Deno.env.get('TWILIO_AUTH_TOKEN');
  const verifySid  = Deno.env.get('TWILIO_VERIFY_SERVICE_SID');
  const appId      = Deno.env.get('BASE44_APP_ID');

  if (!accountSid || !authToken || !verifySid) {
    return Response.json({ success: false, error: 'Configuration Twilio manquante' }, { status: 500 });
  }

  let body;
  try { body = await req.json(); }
  catch { return Response.json({ success: false, error: 'Invalid JSON body' }, { status: 400 }); }

  let phone = (body?.phone || '').replace(/\s/g, '').trim();
  const code = String(body?.code || '').trim();

  if (!phone) return Response.json({ success: false, error: 'phone requis' }, { status: 400 });
  if (!code)  return Response.json({ success: false, error: 'code requis' }, { status: 400 });

  // Normalisation numéro
  if (/^\d{8}$/.test(phone))   phone = '+226' + phone;
  else if (/^226\d{8}$/.test(phone)) phone = '+' + phone;
  else if (/^0\d{7}$/.test(phone))   phone = '+226' + phone.substring(1);

  if (!/^\+226\d{8}$/.test(phone)) {
    return Response.json({ success: false, error: 'Numéro invalide — format: +226XXXXXXXX' }, { status: 400 });
  }
  if (code.length !== 6) {
    return Response.json({ success: false, error: 'Code OTP doit faire 6 chiffres' }, { status: 400 });
  }

  console.log('[verifyOTP] ════ VERIFY ════ phone:', phone);

  // ─── 1. Vérifier OTP via Twilio ──────────────────────────────────────────
  const twilioUrl  = `https://verify.twilio.com/v2/Services/${verifySid}/VerificationCheck`;
  const twilioAuth = btoa(`${accountSid}:${authToken}`);

  let twilioRes;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    twilioRes = await fetch(twilioUrl, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${twilioAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: phone, Code: code }).toString(),
      signal: ctrl.signal,
    });
    clearTimeout(t);
  } catch (err) {
    if (err.name === 'AbortError') return Response.json({ success: false, error: 'Timeout Twilio' }, { status: 504 });
    throw err;
  }

  let twilioData;
  try { twilioData = await twilioRes.json(); }
  catch { return Response.json({ success: false, error: 'Réponse Twilio invalide' }, { status: 502 }); }

  if (!twilioRes.ok || twilioData?.status !== 'approved') {
    console.warn('[verifyOTP] ❌ Code refusé:', twilioData?.status);
    return Response.json({ success: false, error: 'Code OTP incorrect ou expiré', twilio_status: twilioData?.status }, { status: 401 });
  }

  console.log('[verifyOTP] ✅ Twilio approuvé pour:', phone);

  const base44 = createClientFromRequest(req);
  const ADMIN_PHONE = '+22655738247';
  const isAdminPhone = phone === ADMIN_PHONE;
  const tempEmail    = `phone_${phone.replace(/\D/g, '')}@cdl.local`;
  const tempPassword = derivePassword(phone);

  // ─── 2. Trouver ou créer l'utilisateur ───────────────────────────────────
  let user      = null;
  let isNewUser = false;

  // Chercher par téléphone
  try {
    const found = await base44.asServiceRole.entities.User.filter({ telephone: phone }, null, 1);
    if (found.length > 0) user = found[0];
  } catch (err) { console.warn('[verifyOTP] Recherche tel:', err.message); }

  // Chercher par email généré (fallback)
  if (!user) {
    try {
      const found = await base44.asServiceRole.entities.User.filter({ email: tempEmail }, null, 1);
      if (found.length > 0) user = found[0];
    } catch (err) { console.warn('[verifyOTP] Recherche email:', err.message); }
  }

  // Créer si inexistant
  if (!user) {
    console.log('[verifyOTP] 📝 Création utilisateur:', tempEmail);
    try {
      user = await base44.asServiceRole.entities.User.create({
        email: tempEmail,
        telephone: phone,
        full_name: phone,
        role: isAdminPhone ? 'admin' : 'user',
      });
      isNewUser = true;
      console.log('[verifyOTP] ✅ Utilisateur créé:', user.email, user.id);
    } catch (err) {
      console.error('[verifyOTP] ❌ Création échouée:', err.message);
      return Response.json({ success: false, error: 'Erreur création compte: ' + err.message }, { status: 500 });
    }
  }

  // Forcer role admin pour numéro admin
  if (isAdminPhone && user.role !== 'admin') {
    try {
      await base44.asServiceRole.entities.User.update(user.id, { role: 'admin' });
      user.role = 'admin';
    } catch (err) { console.warn('[verifyOTP] Force admin:', err.message); }
  }

  // S'assurer que le téléphone est bien enregistré
  if (!user.telephone) {
    try { await base44.asServiceRole.entities.User.update(user.id, { telephone: phone }); }
    catch (_) {}
  }

  console.log('[verifyOTP] 👤 User:', user.email, '| role:', user.role, '| new:', isNewUser);

  // ─── 3. S'assurer que le mot de passe est défini pour le login côté frontend ──
  try {
    await base44.asServiceRole.entities.User.update(user.id, { password: tempPassword });
    console.log('[verifyOTP] 🔑 Mot de passe défini pour:', user.email);
  } catch (err) {
    console.warn('[verifyOTP] Impossible de définir le mot de passe:', err.message);
  }

  // ─── 4. Déterminer redirect_url ───────────────────────────────────────────
  let redirectUrl = '/';

  if (isAdminPhone || user.role === 'admin') {
    redirectUrl = '/admin-dashboard';
  } else if (!isNewUser) {
    try {
      const profiles = await base44.asServiceRole.entities.UserProfile.filter(
        { user_email: user.email, deleted: false }, null, 10
      );
      const active = profiles.find(p => p.status === 'actif') || profiles[0];
      if (active) {
        const map = { client: '/', livreur: '/courses-disponibles', partenaire: '/dashboard-partenaire', commercial: '/', annonceur: '/dashboard-annonceur' };
        redirectUrl = map[active.profile_type] || '/';
        console.log('[verifyOTP] Profil actif:', active.profile_type, '→', redirectUrl);
      }
    } catch (err) { console.warn('[verifyOTP] Recherche profil:', err.message); }
  }

  console.log('[verifyOTP] ✅ Réponse finale | email:', user.email, '| redirect:', redirectUrl);

  return Response.json({
    success: true,
    // Credentials pour que le frontend fasse le login et crée la session
    login_email:    user.email,
    login_password: tempPassword,
    // Redirection
    redirect_url: redirectUrl,
    user_type: isAdminPhone ? 'admin' : (isNewUser ? 'new' : 'existing'),
    user_id:   user.id,
    user_role: user.role,
    phone,
  });
});