/**
 * testReadViaApiKey — Test: lire otp_code via l'api_key de l'utilisateur lui-même
 *
 * L'api_key d'un user devrait lui donner accès à ses propres données,
 * potentiellement incluant otp_code sur cdl.base44.app
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const BASE44_APP_ID = Deno.env.get('BASE44_APP_ID');
const CDL_BASE = `https://cdl.base44.app/api/apps/${BASE44_APP_ID}`;
const API_BASE = `https://api.base44.app/api/apps/${BASE44_APP_ID}`;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me().catch(() => null);
    if (caller?.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    // phone_22670998877@cdl.phone — api_key: fa6a0a70fa5d4e1e82ccc628fb9f52bb (vérifié maintenant)
    const targetEmail = body.email || 'phone_22670998877@cdl.phone';
    const targetApiKey = body.api_key || 'fa6a0a70fa5d4e1e82ccc628fb9f52bb';
    const targetId = body.id || '69ee9aed9f6aa7446c5189a2';

    const result = { steps: [] };

    // Tester si api_key permet de lire son propre profil avec otp_code
    const endpoints = [
      `${CDL_BASE}/entities/User/${targetId}`,
      `${CDL_BASE}/entities/User/${targetId}?include_system=true`,
      `${CDL_BASE}/auth/me`,
      `${API_BASE}/entities/User/${targetId}`,
    ];

    for (const url of endpoints) {
      for (const [hName, hVal] of [
        ['Authorization', `Bearer ${targetApiKey}`],
        ['X-API-Key', targetApiKey],
      ]) {
        const r = await fetch(url, { headers: { [hName]: hVal } });
        const d = await r.json().catch(() => null);
        const label = `${hName}_${url.replace(/.*\/apps\/[^/]+/, '').split('?')[0]}`;
        result.steps.push({
          step: label,
          status: r.status,
          ok: r.ok,
          otp_code: d?.otp_code || null,
          email: d?.email || null,
          fields: d ? Object.keys(d).slice(0, 12) : [],
        });
      }
    }

    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});