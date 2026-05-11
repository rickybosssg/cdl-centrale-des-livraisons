/**
 * FcmBootstrap — SOURCE UNIQUE d'enregistrement FCM
 *
 * LOGS D'AUDIT REQUIS :
 * [FCM_REGISTER_SUCCESS]  — register() a renvoyé un token Firebase
 * [FCM_TOKEN_RECEIVED]    — token reçu dans le callback onRegistration
 * [FCM_SAVE_ATTEMPT]      — appel vers saveFcmTokenPublic lancé
 * [FCM_SAVE_SUCCESS]      — token sauvegardé en BDD (action + token_id)
 * [FCM_SAVE_FAILED]       — échec sauvegarde avec détail
 *
 * RÈGLES :
 * 1. FcmBootstrap est LA SEULE source qui sauvegarde le token en BDD
 * 2. nativePush.js gère le plugin Capacitor et appelle onToken → FcmBootstrap sauve
 * 3. Verrou anti-doublon : 1 seul save par (email+token) dans une fenêtre de 10s
 * 4. Web FCM géré séparément (PWA)
 */

import { useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { initCapacitorPush, isNativeApp } from '@/lib/nativePush';

const APP_BASE_URL = 'https://cdl.base44.app';
const FCM_DELAY_MS = 2000;

// ── Verrou anti-doublon : clé = email__token, TTL 10s ────────────────────────
const _tokenSaveRecent = new Map();

function shouldSkipSave(user_email, token) {
  const key = `${user_email}__${token.slice(0, 20)}`;
  const lastSave = _tokenSaveRecent.get(key) || 0;
  const elapsed = Date.now() - lastSave;
  if (elapsed < 10000) {
    console.log(`[FCM_REGISTER_SUCCESS] ⏭️ SKIP SAVE — token déjà sauvé il y a ${elapsed}ms pour ${user_email}`);
    return true;
  }
  _tokenSaveRecent.set(key, Date.now());
  setTimeout(() => _tokenSaveRecent.delete(key), 30000);
  return false;
}

async function resolveEmail(propEmail) {
  if (propEmail) return propEmail;
  try {
    const me = await Promise.race([
      base44.auth.me(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
    ]);
    return me?.email || null;
  } catch (e) {
    console.warn('[FCM_SAVE_FAILED] Could not resolve email:', e?.message);
    return null;
  }
}

export async function saveFcmTokenRemote({ user_email, token, device_type = 'android_native' }) {
  if (!user_email || !token) {
    console.error(`[FCM_SAVE_FAILED] MISSING — user_email=${!!user_email} token=${!!token}`);
    return { success: false };
  }

  if (shouldSkipSave(user_email, token)) return { success: false, action: 'debounced_10s' };

  const url = `${APP_BASE_URL}/functions/saveFcmTokenPublic`;
  console.log(`[FCM_SAVE_ATTEMPT] url=${url} | user=${user_email} | token_preview=${token.slice(0, 30)}... | device=${device_type}`);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_email, token, device_type }),
    });

    const responseText = await res.text();
    console.log(`[FCM_SAVE_ATTEMPT] HTTP ${res.status} | response_len=${responseText.length} | body_preview=${responseText.slice(0, 150)}`);

    let data = {};
    try { data = JSON.parse(responseText); } catch (_) {
      console.error(`[FCM_SAVE_FAILED] JSON parse error | raw=${responseText.slice(0, 200)}`);
      return { success: false };
    }

    if (res.ok && data?.success) {
      console.log(`[FCM_SAVE_SUCCESS] action=${data.action} | token_id=${data.token_id} | tokens_avant=${data.tokens_avant} | supprimés=${data.tokens_supprimés} | user=${user_email}`);
      try {
        localStorage.setItem('cdl_fcm_token_saved', new Date().toISOString());
        localStorage.setItem('cdl_fcm_token_preview', token.slice(0, 30));
        localStorage.setItem('cdl_fcm_last_user', user_email);
      } catch (_) {}
      return data;
    }

    console.error(`[FCM_SAVE_FAILED] API error | status=${res.status} | step=${data.step || '?'} | error=${data.error || '?'} | user=${user_email}`);
    return { success: false, error: data.error };

  } catch (err) {
    console.error(`[FCM_SAVE_FAILED] fetch error | ${err.message} | url=${url} | user=${user_email}`);
    return { success: false };
  }
}

export default function FcmBootstrap({ userEmail }) {
  const registeredEmail = useRef(null);

  useEffect(() => {
    if (!userEmail) return;
    if (registeredEmail.current === userEmail) return;
    registeredEmail.current = userEmail;

    const native = isNativeApp();
    console.log(`[FCM_REGISTER_SUCCESS] Bootstrap START | native=${native} | email=${userEmail}`);

    const timer = setTimeout(async () => {
      try {
        if (native) {
          await runNativeFcm(userEmail);
        } else {
          await runWebFcm(userEmail);
        }
      } catch (err) {
        console.error(`[FCM_SAVE_FAILED] Bootstrap error: ${err?.message}`);
      }
    }, FCM_DELAY_MS);

    return () => clearTimeout(timer);
  }, [userEmail]);

  return null;
}

// ─── NATIVE FCM ────────────────────────────────────────────────────────────────
async function runNativeFcm(propEmail) {
  console.log(`[FCM_REGISTER_SUCCESS] runNativeFcm START | email=${propEmail}`);

  await initCapacitorPush({
    onToken: async (token) => {
      try {
        console.log(`[FCM_TOKEN_RECEIVED] token reçu dans FcmBootstrap.onToken | preview=${token.slice(0, 30)}... | len=${token.length}`);

        const email = await resolveEmail(propEmail);

        if (!email) {
          console.error(`[FCM_SAVE_FAILED] email résolution impossible | propEmail=${propEmail}`);
          return;
        }

        console.log(`[FCM_TOKEN_RECEIVED] email résolu = ${email} | prêt pour save`);
        const result = await saveFcmTokenRemote({ user_email: email, token, device_type: 'android_native' });

        if (result?.success) {
          console.log(`[FCM_SAVE_SUCCESS] ✅ Token FCM en BDD | action=${result.action} | id=${result.token_id}`);
        } else {
          console.error(`[FCM_SAVE_FAILED] ❌ Échec save | error=${result?.error || 'inconnu'}`);
        }
      } catch (e) {
        console.error(`[FCM_SAVE_FAILED] onToken exception: ${e?.message}`);
      }
    },

    onForegroundNotif: (notif) => {
      try {
        const receivedAt = new Date().toISOString();
        const title = notif?.title || notif?.data?.title || 'CDL';
        const body = notif?.body || notif?.data?.body || '';
        const route = notif?.data?.notif_route || notif?.data?.route || null;
        const sentAt = notif?.data?.notification_sent_at || null;
        const delayMs = sentAt ? Date.now() - new Date(sentAt).getTime() : null;
        const notifType = notif?.data?.type || '';

        console.log(`[FCM_TOKEN_RECEIVED] 📬 Foreground | title="${title}" | type=${notifType} | delay=${delayMs != null ? delayMs + 'ms' : 'N/A'} | received_at=${receivedAt}`);
        try { localStorage.setItem('cdl_last_push_received', receivedAt); } catch (_) {}
        try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (_) {}

        if (notifType === 'bedou_recharge_approved') {
          try { window.dispatchEvent(new CustomEvent('bedou_recharge_approved')); } catch (_) {}
        }

        import('sonner').then(({ toast }) => {
          toast(title, {
            description: body,
            duration: 8000,
            action: route ? {
              label: 'Voir',
              onClick: () => {
                try { sessionStorage.setItem('cdl_notif_route', route); } catch (_) {}
                window.dispatchEvent(new CustomEvent('cdl_navigate', { detail: { route } }));
              },
            } : undefined,
          });
        }).catch(() => {});
      } catch (_) {}
    },

    onNotificationTap: ({ route, data }) => {
      try {
        const notifType = data?.type || '';
        console.log(`[FCM_TOKEN_RECEIVED] 👆 Tap → route=${route} | type=${notifType}`);
        if (notifType === 'bedou_recharge_approved') {
          try { window.dispatchEvent(new CustomEvent('bedou_recharge_approved')); } catch (_) {}
        }
        if (route?.startsWith('/')) {
          try { sessionStorage.setItem('cdl_notif_route', route); } catch (_) {}
          window.dispatchEvent(new CustomEvent('cdl_navigate', { detail: { route } }));
        }
      } catch (_) {}
    },

    onPermissionDenied: () => {
      console.error(`[FCM_SAVE_FAILED] ⚠️ Permission Android REFUSÉE — push impossible | user=${propEmail}`);
    },
  });
}

// ─── WEB FCM (PWA) ─────────────────────────────────────────────────────────────
async function runWebFcm(propEmail) {
  try {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') {
      console.log(`[FCM_REGISTER_SUCCESS] Web: permission non accordée: ${Notification.permission}`);
      return;
    }
    const { registerSW } = await import('@/lib/swRegister');
    await registerSW();
    const { requestWebPushToken, onForegroundMessage } = await import('@/lib/webPush');
    const { token } = await requestWebPushToken();

    if (!token) {
      console.error('[FCM_SAVE_FAILED] Web: pas de token obtenu depuis Firebase');
      return;
    }

    console.log(`[FCM_TOKEN_RECEIVED] Web token obtenu | preview=${token.slice(0, 30)}...`);
    const email = await resolveEmail(propEmail);
    if (!email) return;

    const result = await saveFcmTokenRemote({ user_email: email, token, device_type: 'web' });
    if (result?.success) {
      console.log(`[FCM_SAVE_SUCCESS] Web token sauvé | action=${result.action}`);
    } else {
      console.error(`[FCM_SAVE_FAILED] Web save échoué | error=${result?.error}`);
    }

    onForegroundMessage((payload) => {
      import('sonner').then(({ toast }) => {
        const n = payload?.notification || {};
        toast(n.title || 'CDL', { description: n.body || '', duration: 8000 });
      }).catch(() => {});
    });
  } catch (err) {
    console.error(`[FCM_SAVE_FAILED] Web error: ${err?.message}`);
  }
}