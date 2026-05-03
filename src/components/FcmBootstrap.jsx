/**
 * FcmBootstrap — Initialisation FCM unifiée via nativePush.js
 *
 * RÈGLES :
 * 1. Utilise nativePush.js comme couche unique (pas de duplication)
 * 2. register() est TOUJOURS appelé au démarrage (même si permission 'prompt')
 *    → Firebase demandera la permission si nécessaire
 * 3. Token sauvegardé via saveFcmTokenPublic à chaque démarrage (upsert)
 * 4. Listeners push permanents (pas de cleanup)
 * 5. Web FCM géré séparément (PWA)
 */

import { useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';

const APP_BASE_URL = 'https://cdl.base44.app';
const FCM_DELAY_MS = 2000;

function isNativePlatform() {
  try {
    if (typeof window === 'undefined') return false;
    if (window.location?.protocol === 'capacitor:') return true;
    if (window.location?.protocol === 'file:') return true;
    if (typeof window.Capacitor !== 'undefined' && window.Capacitor?.getPlatform?.() === 'android') return true;
  } catch (_) {}
  return false;
}

async function saveFcmTokenRemote({ user_email, token, device_type = 'android_native' }) {
  if (!user_email || !token) return { success: false };
  try {
    const res = await fetch(`${APP_BASE_URL}/functions/saveFcmTokenPublic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_email, token, device_type }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.success) {
      console.log('[FCM] ✅ Token saved | action:', data.action, '| id:', data.token_id);
      return data;
    }
    console.error('[FCM] ❌ Token save failed:', data?.error);
    return { success: false };
  } catch (err) {
    console.error('[FCM] ❌ Token save error:', err?.message);
    return { success: false };
  }
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

export default function FcmBootstrap({ userEmail }) {
  const didRun = useRef(false);

  useEffect(() => {
    // Ne lancer qu'une fois ET seulement quand on a un email
    if (didRun.current) return;
    if (!userEmail) return; // attendre que l'email soit résolu
    didRun.current = true;

    const native = isNativePlatform();
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
  }, [userEmail]); // relancer si email change (connexion tardive)

  return null;
}

// ─── NATIVE FCM ───────────────────────────────────────────────────────────────

async function runNativeFcm(propEmail) {
  console.log('[FCM] Native init start');

  let PushNotifications;
  try {
    const mod = await import('@capacitor/push-notifications');
    PushNotifications = mod.PushNotifications;
    if (!PushNotifications) throw new Error('null');
  } catch (e) {
    console.error('[FCM] Plugin unavailable:', e?.message);
    return;
  }

  // ── Canaux Android ────────────────────────────────────────────────────────
  // STRATÉGIE : canaux V2 avec nouveaux IDs jamais vus par Android
  // Android interdit de modifier l'importance d'un canal existant.
  // Nouveaux IDs = importance=5 heads-up garanti dès la première installation.
  // Les anciens canaux sont supprimés pour éviter confusion dans les paramètres.
  const OLD_CHANNEL_IDS = ['default', 'CDL_ALERTS_HIGH', 'urgent'];
  const CHANNELS_V2 = [
    {
      id: 'cdl_default_v2',
      name: 'CDL Notifications',
      description: 'Notifications générales CDL',
      importance: 5,
      sound: 'default',
      vibration: true,
      lights: true,
      lightColor: '#1E6BFF',
    },
    {
      id: 'cdl_critical_alerts_v2',
      name: 'CDL Alertes Critiques',
      description: 'Courses, recharges Bedou, profils — priorité maximale',
      importance: 5,
      sound: 'default',
      vibration: true,
      lights: true,
      lightColor: '#FF6B1E',
    },
  ];

  try {
    // Supprimer anciens canaux (silencieux si déjà absents)
    await Promise.allSettled(OLD_CHANNEL_IDS.map(id => PushNotifications.deleteChannel({ id })));
    // Créer les nouveaux canaux V2 (ne pas delete/recreate → importance figée par Android)
    await Promise.all(CHANNELS_V2.map(ch => PushNotifications.createChannel(ch)));
    console.log('[FCM] ✅ Channels V2 created: cdl_default_v2 + cdl_critical_alerts_v2 (importance=5)');
  } catch (e) {
    console.warn('[FCM] Channel error (non-fatal):', e?.message);
  }

  // ── Permission — demander si pas encore accordée ──────────────────────────
  let perm = 'unknown';
  try {
    const check = await PushNotifications.checkPermissions();
    perm = check?.receive || 'unknown';
    console.log('[FCM] Permission status:', perm);

    if (perm === 'prompt' || perm === 'prompt-with-rationale') {
      console.log('[FCM] Requesting permission...');
      const req = await Promise.race([
        PushNotifications.requestPermissions(),
        new Promise((_, r) => setTimeout(() => r({ receive: 'timeout' }), 10000)),
      ]);
      perm = req?.receive || 'unknown';
      console.log('[FCM] Permission after request:', perm);
    }
  } catch (e) {
    console.warn('[FCM] Permission check error:', e?.message);
    perm = 'unknown'; // continuer quand même
  }

  if (perm === 'denied') {
    console.warn('[FCM] Permission DENIED — push non fonctionnel');
    // On continue quand même pour register (cas où l'OS envoie quand même)
  }

  // ── Listeners AVANT register() ────────────────────────────────────────────
  const listeners = [];
  try {
    listeners.push(await PushNotifications.addListener('registration', (tokenData) => {
      try {
        const token = tokenData?.value;
        if (!token) { console.error('[FCM] registration: token vide'); return; }
        console.log('[FCM] ✅ Token reçu (len=' + token.length + '):', token.slice(0, 40) + '...');
        resolveEmail(propEmail).then(email => {
          if (!email) { console.error('[FCM] Pas d\'email pour sauvegarder le token'); return; }
          saveFcmTokenRemote({ user_email: email, token, device_type: 'android_native' });
        }).catch(e => console.error('[FCM] resolveEmail error:', e?.message));
      } catch (e) {
        console.error('[FCM] registration callback error:', e?.message);
      }
    }));

    listeners.push(await PushNotifications.addListener('registrationError', (err) => {
      console.error('[FCM] ❌ registrationError:', JSON.stringify(err));
    }));

    listeners.push(await PushNotifications.addListener('pushNotificationReceived', (notif) => {
      try {
        const receivedAt = new Date().toISOString();
        const title = notif?.title || notif?.data?.title || 'CDL';
        const body = notif?.body || notif?.data?.body || '';
        const route = notif?.data?.notif_route || notif?.data?.route || null;
        const sentAt = notif?.data?.notification_sent_at || null;
        const delayMs = sentAt ? Date.now() - new Date(sentAt).getTime() : null;
        console.log(`[FCM] 📬 Foreground | title="${title}" | channel=${notif?.data?.channel_id || '?'} | delay=${delayMs != null ? delayMs + 'ms' : 'N/A'} | received_at=${receivedAt}`);
        try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (_) {}
        // NOTE : Sur Android, FCM affiche automatiquement la notification dans la barre système
        // même si l'app est au premier plan (depuis Android 13+ avec notification block = false).
        // Le toast Sonner est un affichage IN-APP supplémentaire, pas un remplacement.
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
    }));

    listeners.push(await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      try {
        const data = action?.notification?.data || {};
        const route = data.notif_route || data.route || data.target_screen || null;
        console.log('[FCM] 👆 Tap → route:', route);
        if (route?.startsWith('/')) {
          try { sessionStorage.setItem('cdl_notif_route', route); } catch (_) {}
          window.dispatchEvent(new CustomEvent('cdl_navigate', { detail: { route } }));
        }
      } catch (_) {}
    }));

    console.log('[FCM] ✅', listeners.length, 'listeners attachés');
  } catch (e) {
    console.error('[FCM] addListener error:', e?.message);
    return;
  }

  // ── register() — TOUJOURS appelé ─────────────────────────────────────────
  try {
    console.log('[FCM] Calling register()...');
    await Promise.race([
      PushNotifications.register(),
      new Promise((_, r) => setTimeout(() => r(new Error('register timeout')), 15000)),
    ]);
    console.log('[FCM] ✅ register() OK — attente token callback');
  } catch (e) {
    console.error('[FCM] register() error:', e?.message);
  }
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