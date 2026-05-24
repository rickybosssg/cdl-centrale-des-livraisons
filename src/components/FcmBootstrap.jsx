/**
 * FcmBootstrap — Enregistrement FCM automatique et stable
 *
 * Principe : UN SEUL chemin linéaire, pas de race condition.
 * 1. Au montage avec userEmail → lancer la séquence
 * 2. Séquence : permission → register → token reçu → save BDD
 * 3. Heartbeat 10min + retour foreground → re-vérifier BDD seulement, re-register si absent
 * 4. Changement de user → re-sauvegarder le token local existant avec le nouvel email
 */

import { useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { initCapacitorPush, isNativeApp } from '@/lib/nativePush';
import { useFcmReady } from '@/context/FcmReadyContext';
import FcmTokenEngine from '@/lib/FcmTokenEngine';

const HEARTBEAT_INTERVAL_MS = 10 * 60 * 1000; // 10 min
const BEDOU_PUSH_TYPES = new Set([
  'bedou_recharge_approved',
  'bedou_recharge_rejected',
  'bedou_withdrawal_approved',
  'bedou_withdrawal_rejected',
  'bedou_low_balance',
  'course_delivered',
  'course_delivered_driver',
]);

function dispatchPushEvents(data = {}) {
  const notifType = data?.type || data?.event_type || '';
  try {
    window.dispatchEvent(new CustomEvent('cdl_push_received', { detail: data }));
    if (BEDOU_PUSH_TYPES.has(notifType)) {
      window.dispatchEvent(new CustomEvent(notifType, { detail: data }));
      window.dispatchEvent(new CustomEvent('bedou_updated', { detail: data }));
      window.dispatchEvent(new CustomEvent('bedou_sync_refresh', { detail: data }));
    }
  } catch (_) {}
}

// ── Export compat ──────────────────────────────────────────────────────────────
export async function saveFcmTokenRemote({ user_email, token }) {
  return FcmTokenEngine.saveToken(user_email, token, 'saveFcmTokenRemote_compat');
}

export default function FcmBootstrap({ userEmail }) {
  const { setFcmReady, setFcmStatus } = useFcmReady();
  const emailRef = useRef(null);
  const heartbeatRef = useRef(null);
  const registering = useRef(false);
  const native = isNativeApp();

  // ── Sauvegarder token et marquer ready ────────────────────────────────────
  const handleToken = useCallback(async (token, source = 'registration') => {
    const email = emailRef.current;
    if (!email || !token) return;

    console.log(`[FCM_BOOT] handleToken | source=${source} | email=${email} | token=${token.slice(0, 20)}...`);
    setFcmStatus('saving');

    const result = await FcmTokenEngine.saveToken(email, token, source);

    if (result?.success) {
      console.log(`[FCM_BOOT] token sauvegardé OK | action=${result.action} | verified=${result.verified}`);
      setFcmStatus('ready');
      setFcmReady(true);
    } else if (result?.action !== 'debounced') {
      // Save a échoué → réessayer une fois après 15s
      console.warn(`[FCM_BOOT] save échoué, retry dans 15s | error=${result?.error}`);
      setTimeout(async () => {
        const r2 = await FcmTokenEngine.saveToken(email, token, 'retry');
        if (r2?.success) { setFcmStatus('ready'); setFcmReady(true); }
        else { setFcmStatus('degraded'); setFcmReady(true); }
      }, 15000);
    } else {
      // Debounced → vérifier BDD directement
      const { verified } = await FcmTokenEngine.verify(email);
      setFcmStatus(verified ? 'ready' : 'degraded');
      setFcmReady(true);
    }
  }, [setFcmReady, setFcmStatus]);

  // ── Lancer la séquence FCM native ─────────────────────────────────────────
  const startFcm = useCallback(async (email) => {
    if (registering.current) return;
    registering.current = true;
    setFcmStatus('registering');

    try {
      await initCapacitorPush({
        onToken: (token) => handleToken(token, 'registration'),
        onTokenRefresh: (token) => handleToken(token, 'token_refresh'),

        onForegroundNotif: (notif) => {
          try {
            const title = notif?.title || notif?.data?.title || 'CDL';
            const body = notif?.body || notif?.data?.body || '';
            const route = notif?.data?.notif_route || notif?.data?.route || null;
            try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (_) {}
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
            dispatchPushEvents(notif?.data || {});
          } catch (_) {}
        },

        onNotificationTap: ({ route, data }) => {
          try {
            dispatchPushEvents(data || {});
            if (route?.startsWith('/')) {
              try { sessionStorage.setItem('cdl_notif_route', route); } catch (_) {}
              window.dispatchEvent(new CustomEvent('cdl_navigate', { detail: { route } }));
            }
          } catch (_) {}
        },

        onPermissionDenied: () => {
          console.warn('[FCM_BOOT] Permission notifications refusée');
          setFcmStatus('permission_denied');
          setFcmReady(true);
          registering.current = false;
        },
      });
    } catch (e) {
      console.error('[FCM_BOOT] startFcm erreur:', e?.message);
      setFcmStatus('degraded');
      setFcmReady(true);
    } finally {
      registering.current = false;
    }
  }, [handleToken, setFcmStatus, setFcmReady]);

  // ── Vérifier BDD et re-register si token absent ───────────────────────────
  const checkAndRepair = useCallback(async () => {
    const email = emailRef.current;
    if (!email || !native) return;
    const { verified } = await FcmTokenEngine.verify(email);
    if (!verified) {
      console.log('[FCM_BOOT] checkAndRepair → token absent, re-register');
      startFcm(email);
    }
  }, [native, startFcm]);

  // ── Sync active_profile_type dans localStorage (pour FcmTokenEngine) ─────
  useEffect(() => {
    if (!userEmail) return;
    const syncProfile = async () => {
      try {
        const me = await import('@/api/base44Client').then(m => m.base44.auth.me());
        const profileType = me?.active_profile_type || me?.user_type || null;
        if (profileType) {
          localStorage.setItem('cdl_active_profile_type', profileType);
        }
      } catch (_) {}
    };
    syncProfile();
  }, [userEmail]);

  // ── Effect principal ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!userEmail) return;

    const emailChanged = emailRef.current !== userEmail;
    emailRef.current = userEmail;

    // ── Web / PWA ──
    if (!native) {
      const runWeb = async () => {
        try {
          if (!('Notification' in window) || Notification.permission !== 'granted') {
            setFcmStatus('web_no_permission');
            setFcmReady(true);
            return;
          }
          const { registerSW } = await import('@/lib/swRegister');
          await registerSW();
          const { requestWebPushToken, onForegroundMessage } = await import('@/lib/webPush');
          const { token } = await requestWebPushToken();
          if (token) await handleToken(token, 'web_init');
          else { setFcmStatus('web_no_token'); setFcmReady(true); }
          onForegroundMessage((payload) => {
            import('sonner').then(({ toast }) => {
              const n = payload?.notification || {};
              toast(n.title || 'CDL', { description: n.body || '', duration: 8000 });
            }).catch(() => {});
          });
        } catch {
          setFcmStatus('web_error');
          setFcmReady(true);
        }
      };
      const t = setTimeout(runWeb, 1000);
      return () => clearTimeout(t);
    }

    // ── APK Natif ──
    // Si changement d'utilisateur ET token local existant → re-sauvegarder avec le nouvel email
    if (emailChanged) {
      const { token: localToken } = readLocalToken();
      if (localToken) {
        console.log(`[FCM_BOOT] email changé → re-save token pour ${userEmail}`);
        FcmTokenEngine.saveToken(userEmail, localToken, 'email_change').catch(() => {});
      }
    }

    // Lancer la séquence FCM (permission + register + token + save)
    const initTimer = setTimeout(() => startFcm(userEmail), 500);

    // Heartbeat : vérifier BDD toutes les 10 min
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatRef.current = setInterval(checkAndRepair, HEARTBEAT_INTERVAL_MS);

    // Retour foreground → re-vérifier
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkAndRepair();
    };
    document.addEventListener('visibilitychange', onVisible);

    // Event force_register (depuis login ou switch profil)
    const onForce = (e) => {
      const targetEmail = e?.detail?.email || emailRef.current;
      if (targetEmail) {
        emailRef.current = targetEmail;
        startFcm(targetEmail);
      }
    };
    window.addEventListener('cdl_fcm_force_register', onForce);

    return () => {
      clearTimeout(initTimer);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('cdl_fcm_force_register', onForce);
    };
  }, [userEmail, native, startFcm, checkAndRepair, handleToken, setFcmStatus, setFcmReady]);

  return null;
}

// Helper local (évite import circulaire)
function readLocalToken() {
  try {
    return { token: localStorage.getItem('cdl_fcm_current_token') };
  } catch (_) {
    return { token: null };
  }
}
