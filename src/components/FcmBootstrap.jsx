/**
 * FcmBootstrap — Composant indépendant d'initialisation FCM
 *
 * POURQUOI CE COMPOSANT EXISTE :
 * - AppLayoutWrapper reçoit user={null} au montage sur APK natif
 * - userEmail n'est donc jamais défini → useEffect([userEmail]) ne se déclenche jamais
 * - Ce composant est monté UNE SEULE FOIS dans App.jsx, directement dans AuthenticatedApp
 * - Il résout lui-même l'email via base44.auth.me() → 100% indépendant du flux Layout
 *
 * RÈGLE CAPACITOR (NE PAS MODIFIER) :
 * - addListener() AVANT register()
 * - register() appelé à CHAQUE lancement (Firebase est idempotent)
 * - PAS de guard "_registered" — sinon le token ne revient pas après kill process
 */

import { useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { saveFcmToken } from '@/lib/fcmApi';

function isNativePlatform() {
  if (typeof window === 'undefined') return false;
  if (window.location?.protocol === 'capacitor:') return true;
  if (window.Capacitor?.isNativePlatform?.() === true) return true;
  return false;
}

export default function FcmBootstrap() {
  const didRun = useRef(false);

  useEffect(() => {
    // Une seule exécution par montage (StrictMode double-appel safe)
    if (didRun.current) return;
    didRun.current = true;

    const run = async () => {
      // ── 1. Résoudre l'email (obligatoire avant toute sauvegarde) ──────────
      let userEmail = '';
      let attempts = 0;
      while (!userEmail && attempts < 5) {
        try {
          const me = await base44.auth.me();
          userEmail = me?.email || '';
        } catch (_) {}
        if (!userEmail) {
          await new Promise(r => setTimeout(r, 1000));
          attempts++;
        }
      }

      if (!userEmail) {
        console.warn('[FcmBootstrap] ❌ Email introuvable après 5 tentatives — abandon');
        return;
      }

      console.log('[FcmBootstrap] ✅ Email résolu:', userEmail);

      const native = isNativePlatform();
      console.log('[FcmBootstrap] ═══ FCM INIT ═══ | isNative:', native, '| user:', userEmail);

      if (native) {
        await initNative(userEmail);
      } else {
        await initWeb(userEmail);
      }
    };

    run().catch(err => console.error('[FcmBootstrap] Erreur fatale:', err?.message));
  }, []);

  return null; // Pas de rendu
}

// ── Init natif Capacitor ──────────────────────────────────────────────────────
async function initNative(userEmail) {
  let PushNotifications;
  try {
    const mod = await import('@capacitor/push-notifications');
    PushNotifications = mod.PushNotifications;
    console.log('[FcmBootstrap] Plugin PushNotifications chargé ✅');
  } catch (e) {
    console.error('[FcmBootstrap] ❌ Plugin Capacitor NON DISPONIBLE:', e?.message);
    return;
  }

  // Canal Android
  try {
    await PushNotifications.createChannel({
      id: 'default',
      name: 'CDL Notifications',
      importance: 5,
      sound: 'default',
      vibration: true,
      lights: true,
    });
    console.log('[FcmBootstrap] Canal Android créé ✅');
  } catch (_) {}

  // Permission
  let perm;
  try {
    const check = await PushNotifications.checkPermissions();
    perm = check.receive;
    console.log('[FcmBootstrap] Permission actuelle:', perm);
    if (perm !== 'granted') {
      const req = await PushNotifications.requestPermissions();
      perm = req.receive;
      console.log('[FcmBootstrap] Permission après demande:', perm);
    }
  } catch (e) {
    console.error('[FcmBootstrap] Erreur permission:', e?.message);
    return;
  }

  if (perm !== 'granted') {
    console.warn('[FcmBootstrap] Permission refusée → FCM impossible');
    return;
  }

  // Listeners AVANT register() — règle Capacitor obligatoire
  const listeners = [];

  try {
    listeners.push(await PushNotifications.addListener('registration', async (tokenData) => {
      const token = tokenData?.value;
      console.log('[FcmBootstrap] 🔑 REGISTER CALLED — token reçu:', token ? token.slice(0, 30) + '...' : 'VIDE');
      if (!token) return;

      const result = await saveFcmToken({ user_email: userEmail, token, device_type: 'android_native' });
      if (result?.success) {
        console.log('[FcmBootstrap] ✅ TOKEN ENREGISTRÉ EN BDD — action:', result.action, '| id:', result.token_id);
      } else {
        console.error('[FcmBootstrap] ❌ Échec sauvegarde token:', result?.error);
      }

      // Nettoyer les listeners temporaires
      for (const l of listeners) { try { await l.remove(); } catch (_) {} }
    }));

    listeners.push(await PushNotifications.addListener('registrationError', (err) => {
      console.error('[FcmBootstrap] ❌ registrationError:', JSON.stringify(err));
      for (const l of listeners) { try { l.remove(); } catch (_) {} }
    }));

    listeners.push(await PushNotifications.addListener('pushNotificationReceived', (notif) => {
      console.log('[FcmBootstrap] 📬 Notification foreground reçue:', notif?.title);
      const route = notif?.data?.notif_route || notif?.data?.route || null;
      import('sonner').then(({ toast }) => {
        toast(notif?.title || 'CDL', {
          description: notif?.body || '',
          duration: 8000,
          action: route ? { label: 'Voir', onClick: () => window.dispatchEvent(new CustomEvent('cdl_navigate', { detail: { route } })) } : undefined,
        });
      });
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    }));

    listeners.push(await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const data = action.notification?.data || {};
      const route = data.notif_route || data.route || data.target_screen || null;
      console.log('[FcmBootstrap] 👆 Tap notification → route:', route);
      if (route?.startsWith('/')) {
        try { sessionStorage.setItem('cdl_notif_route', route); } catch (_) {}
        window.dispatchEvent(new CustomEvent('cdl_navigate', { detail: { route } }));
      }
    }));

    console.log('[FcmBootstrap] Listeners attachés ✅ |', listeners.length, 'listeners');
  } catch (e) {
    console.error('[FcmBootstrap] Erreur attachement listeners:', e?.message);
    return;
  }

  // register() — TOUJOURS appelé, Firebase renvoie le même token si déjà enregistré
  console.log('[FcmBootstrap] → register() en cours...');
  try {
    await PushNotifications.register();
    console.log('[FcmBootstrap] register() appelé ✅ — en attente callback registration...');
  } catch (e) {
    console.error('[FcmBootstrap] ❌ register() ERREUR:', e?.message);
  }
}

// ── Init web (PWA) ────────────────────────────────────────────────────────────
async function initWeb(userEmail) {
  try {
    if (!('Notification' in window)) {
      console.log('[FcmBootstrap] API Notification non disponible (normal sur APK)');
      return;
    }
    if (Notification.permission !== 'granted') {
      console.log('[FcmBootstrap] Web: permission non accordée →', Notification.permission);
      return;
    }
    const { registerSW } = await import('@/lib/swRegister');
    await registerSW();
    const { requestWebPushToken, onForegroundMessage } = await import('@/lib/webPush');
    const { token } = await requestWebPushToken();
    if (!token) { console.warn('[FcmBootstrap] Pas de token web push'); return; }
    const result = await saveFcmToken({ user_email: userEmail, token, device_type: 'web' });
    console.log('[FcmBootstrap] ✅ Token web enregistré — action:', result?.action);
    onForegroundMessage((payload) => {
      const notif = payload.notification || {};
      const data = payload.data || {};
      const route = data.notif_route || data.route || data.target_screen || null;
      import('sonner').then(({ toast }) => {
        toast(notif.title || 'CDL', {
          description: notif.body || '',
          duration: 8000,
          action: route ? { label: 'Voir', onClick: () => window.dispatchEvent(new CustomEvent('cdl_navigate', { detail: { route } })) } : undefined,
        });
      });
    });
  } catch (err) {
    console.error('[FcmBootstrap] Web init error:', err?.message);
  }
}