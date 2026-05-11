/**
 * FcmBootstrap — SOURCE UNIQUE d'enregistrement FCM
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
// Empêche la race condition si Firebase déclenche le callback 2x quasi-simultanément
const _tokenSaveRecent = new Map(); // key → timestamp last save

function shouldSkipSave(user_email, token) {
  const key = `${user_email}__${token.slice(0, 20)}`;
  const lastSave = _tokenSaveRecent.get(key) || 0;
  const elapsed = Date.now() - lastSave;
  if (elapsed < 10000) {
    console.log(`[FCM] ⏭️ SKIP SAVE — token déjà sauvé il y a ${elapsed}ms (< 10s) pour ${user_email}`);
    return true;
  }
  _tokenSaveRecent.set(key, Date.now());
  // Nettoyer après 30s
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
    console.warn('[FCM] Could not resolve email:', e?.message);
    return null;
  }
}

async function saveFcmTokenRemote({ user_email, token, device_type = 'android_native' }) {
  if (!user_email || !token) return { success: false };
  // ── Verrou anti-doublon 10s ───────────────────────────────────────────────
  if (shouldSkipSave(user_email, token)) return { success: false, action: 'debounced_10s' };
  try {
    const res = await fetch(`${APP_BASE_URL}/functions/saveFcmTokenPublic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_email, token, device_type }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.success) {
      console.log(`[FCM_CLIENT_REGISTER] ✅ Token saved | action=${data.action} | id=${data.token_id} | tokens_avant=${data.tokens_avant} | supprimés=${data.tokens_supprimés}`);
      try {
        localStorage.setItem('cdl_fcm_token_saved', new Date().toISOString());
        localStorage.setItem('cdl_fcm_token_preview', token.slice(0, 30));
      } catch (_) {}
      return data;
    }
    console.error('[FCM_CLIENT_REGISTER] ❌ Token save failed:', data?.error);
    return { success: false };
  } catch (err) {
    console.error('[FCM_CLIENT_REGISTER] ❌ Token save error:', err?.message);
    return { success: false };
  }
}

export default function FcmBootstrap({ userEmail }) {
  const registeredEmail = useRef(null);

  useEffect(() => {
    if (!userEmail) return;
    // Ne relancer que si l'email a changé
    if (registeredEmail.current === userEmail) return;
    registeredEmail.current = userEmail;

    const native = isNativeApp();
    console.log('[FCM] Bootstrap | native:', native, '| email:', userEmail);

    const timer = setTimeout(async () => {
      try {
        if (native) {
          await runNativeFcm(userEmail);
        } else {
          await runWebFcm(userEmail);
        }
      } catch (err) {
        console.error('[FCM] Bootstrap error (non-fatal):', err?.message);
      }
    }, FCM_DELAY_MS);

    return () => clearTimeout(timer);
  }, [userEmail]);

  return null;
}

// ─── NATIVE FCM — délègue ENTIÈREMENT à nativePush.initCapacitorPush ────────
// FcmBootstrap est la seule source de save token. nativePush ne sauvegarde PAS.

async function runNativeFcm(propEmail) {
  console.log('[FCM] Bootstrap native → initCapacitorPush | email:', propEmail);

  await initCapacitorPush({
    onToken: async (token) => {
      try {
        const email = await resolveEmail(propEmail);
        if (!email) { console.error('[FCM_CLIENT_REGISTER] ❌ Pas d\'email pour sauvegarder le token'); return; }
        console.log('[FCM_CLIENT_REGISTER] token reçu | email:', email, '| preview:', token.slice(0, 30) + '...');
        await saveFcmTokenRemote({ user_email: email, token, device_type: 'android_native' });
      } catch (e) {
        console.error('[FCM_CLIENT_REGISTER] onToken error:', e?.message);
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
        console.log(`[FCM] 📬 Foreground | title="${title}" | type=${notifType} | delay=${delayMs != null ? delayMs + 'ms' : 'N/A'} | received_at=${receivedAt}`);
        console.log(`[APK_NOTIFICATION_RUNTIME_CHECK] last_push_event_received=${receivedAt} | push_type=${notifType} | fcm_token_present=true`);
        try { localStorage.setItem('cdl_last_push_received', receivedAt); } catch (_) {}
        try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (_) {}
        if (notifType === 'bedou_recharge_approved') {
          try { window.dispatchEvent(new CustomEvent('bedou_recharge_approved')); } catch (_) {}
        }
        import('sonner').then(({ toast }) => {
          toast(title, {
            description: body,
            duration: 8000,
            action: route ? { label: 'Voir', onClick: () => {
              try { sessionStorage.setItem('cdl_notif_route', route); } catch (_) {}
              window.dispatchEvent(new CustomEvent('cdl_navigate', { detail: { route } }));
            }} : undefined,
          });
        }).catch(() => {});
      } catch (_) {}
    },
    onNotificationTap: ({ route, data }) => {
      try {
        const notifType = data?.type || '';
        console.log('[FCM] 👆 Tap → route:', route, '| type:', notifType);
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
      console.warn('[FCM_CLIENT_REGISTER] ⚠️ Permission Android refusée — push impossible');
    },
  });
}

// ─── WEB FCM (PWA) ────────────────────────────────────────────────────────────

async function runWebFcm(propEmail) {
  try {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') {
      console.log('[FCM] Web: permission non accordée:', Notification.permission);
      return;
    }
    const { registerSW } = await import('@/lib/swRegister');
    await registerSW();
    const { requestWebPushToken, onForegroundMessage } = await import('@/lib/webPush');
    const { token } = await requestWebPushToken();
    if (!token) return;
    const email = await resolveEmail(propEmail);
    if (!email) return;
    await saveFcmTokenRemote({ user_email: email, token, device_type: 'web' });
    onForegroundMessage((payload) => {
      import('sonner').then(({ toast }) => {
        const n = payload?.notification || {};
        toast(n.title || 'CDL', { description: n.body || '', duration: 8000 });
      }).catch(() => {});
    });
    console.log('[FCM] Web init OK');
  } catch (err) {
    console.error('[FCM] Web error:', err?.message);
  }
}