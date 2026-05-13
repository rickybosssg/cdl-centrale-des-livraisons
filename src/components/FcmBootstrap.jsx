/**
 * FcmBootstrap — Architecture FCM auto-réparatrice V5
 *
 * BOOT BLOQUANT :
 * - Affiche "Initialisation notifications..." jusqu'à token confirmé en BDD
 * - Vérifie BDD après chaque save (local vs BDD comparison)
 * - Timeout recovery si token absent > BOOT_TIMEOUT_MS
 * - Heartbeat 8min + visibilitychange + force_register event
 *
 * LOGS OBLIGATOIRES :
 * [FCM_BOOT_START]         — démarrage séquence boot
 * [FCM_TOKEN_LOCAL_FOUND]  — token local détecté en localStorage
 * [FCM_TOKEN_SAVE_START]   — save vers BDD lancé
 * [FCM_TOKEN_SAVE_SUCCESS] — save BDD confirmé
 * [FCM_TOKEN_VERIFY_SUCCESS] — relecture BDD OK (local == BDD)
 * [FCM_BOOT_READY]         — boot complet, app prête
 * [FCM_BOOT_RECOVERY]      — recovery auto déclenché
 */

import { useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { initCapacitorPush, isNativeApp } from '@/lib/nativePush';
import { useFcmReady } from '@/context/FcmReadyContext';
import FcmTokenEngine from '@/lib/FcmTokenEngine';

const HEARTBEAT_INTERVAL_MS = 8 * 60 * 1000;
const BOOT_TIMEOUT_MS = 20_000;

// ── Compat : anciens appels saveFcmTokenRemote → FcmTokenEngine ──────────────
export async function saveFcmTokenRemote({ user_email, token }) {
  return FcmTokenEngine.saveToken(user_email, token, 'saveFcmTokenRemote_compat');
}

// ── Vérifier existence rapide (pour heartbeat/recovery) ──────────────────────
async function hasActiveBddToken(userEmail) {
  const { verified } = await FcmTokenEngine.verify(userEmail);
  return verified;
}

// ─────────────────────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────────────────────
export default function FcmBootstrap({ userEmail }) {
  const { setFcmReady, setFcmStatus } = useFcmReady();
  const lastEmailRef = useRef(null);
  const heartbeatRef = useRef(null);
  const initInProgressRef = useRef(false);
  const bootTimerRef = useRef(null);
  const native = isNativeApp();

  // ── Marquer boot complet ────────────────────────────────────────────────
  const markBootReady = useCallback((source = 'verified') => {
    console.log(`[FCM_BOOT_READY] ✅ FCM prêt | source=${source} | user=${lastEmailRef.current}`);
    setFcmStatus('ready');
    setFcmReady(true);
    if (bootTimerRef.current) {
      clearTimeout(bootTimerRef.current);
      bootTimerRef.current = null;
    }
  }, [setFcmReady, setFcmStatus]);

  // ── Callback token (registration + refresh) → délégué à FcmTokenEngine ─────
  const onTokenReceived = useCallback(async (token, source = 'registration') => {
    try {
      let email = lastEmailRef.current;
      if (!email) {
        try {
          const me = await Promise.race([
            base44.auth.me(),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000)),
          ]);
          email = me?.email || null;
        } catch (_) {}
      }
      if (!email) {
        console.error(`[FCM_SAVE_FAILED] email indisponible | source=${source}`);
        return;
      }

      console.log(`[FCM_TOKEN_RECEIVED] source=${source} | preview=${token.slice(0, 30)}... | user=${email}`);

      // Tout délégué à FcmTokenEngine (save + verify)
      const result = await FcmTokenEngine.saveToken(email, token, source);

      if (result?.success && result?.verified) {
        console.log(`[FCM_AUTO_RECOVERY_SUCCESS] token enregistré et vérifié BDD | user=${email} | source=${source}`);
        markBootReady('post_save_verify');
      } else if (result?.success && !result?.verified) {
        // Sauvé mais verify failed → re-register
        console.error(`[FCM_BOOT_RECOVERY] verify échoué → re-register | user=${email}`);
        setFcmStatus('recovery');
        setTimeout(() => startNativeFcmRef.current?.(email), 2000);
      } else if (result?.action !== 'debounced') {
        console.error(`[FCM_SAVE_FAILED] échec save | error=${result?.error} | retry 30s`);
        setTimeout(() => FcmTokenEngine.saveToken(email, token, 'retry').catch(() => {}), 30_000);
      } else {
        // Debounce → vérifier BDD quand même
        const { verified } = await FcmTokenEngine.verify(email);
        if (verified) markBootReady('debounced_verify_ok');
      }
    } catch (e) {
      console.error(`[FCM_SAVE_FAILED] onTokenReceived: ${e?.message}`);
    }
  }, [markBootReady, setFcmStatus]);

  // Ref pour permettre appel récursif sans dépendance circulaire
  const startNativeFcmRef = useRef(null);

  // ── Init FCM natif ────────────────────────────────────────────────────────
  const startNativeFcm = useCallback(async (email) => {
    if (initInProgressRef.current) {
      console.log('[FCM_BOOT_RECOVERY] init déjà en cours — skip');
      return;
    }
    initInProgressRef.current = true;
    console.log(`[FCM_BOOT_START] startNativeFcm | user=${email}`);
    setFcmStatus('registering');

    try {
      await initCapacitorPush({
        onToken: (token) => onTokenReceived(token, 'registration'),
        onTokenRefresh: (token) => onTokenReceived(token, 'token_refresh'),

        onForegroundNotif: (notif) => {
          try {
            const receivedAt = new Date().toISOString();
            const title = notif?.title || notif?.data?.title || 'CDL';
            const body = notif?.body || notif?.data?.body || '';
            const route = notif?.data?.notif_route || notif?.data?.route || null;
            const notifType = notif?.data?.type || '';
            const sentAt = notif?.data?.notification_sent_at || null;
            const delayMs = sentAt ? Date.now() - new Date(sentAt).getTime() : null;

            console.log(`[FCM_FOREGROUND] title="${title}" | type=${notifType} | delay=${delayMs != null ? delayMs + 'ms' : 'N/A'} | at=${receivedAt}`);
            try { localStorage.setItem('cdl_last_push_received', receivedAt); } catch (_) {}
            try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (_) {}

            if (notifType === 'bedou_recharge_approved') {
              try { window.dispatchEvent(new CustomEvent('bedou_recharge_approved')); } catch (_) {}
              try { window.dispatchEvent(new CustomEvent('bedou_updated')); } catch (_) {}
              console.log(`[BEDOU_SYNC_EVENT_RECEIVED] foreground bedou_recharge_approved | user=${email}`);
            }

            import('sonner').then(({ toast }) => {
              toast(title, {
                description: body, duration: 8000,
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
            console.log(`[FCM_TAP] route=${route} | type=${notifType}`);
            if (notifType === 'bedou_recharge_approved') {
              try { window.dispatchEvent(new CustomEvent('bedou_recharge_approved')); } catch (_) {}
              try { window.dispatchEvent(new CustomEvent('bedou_updated')); } catch (_) {}
              console.log(`[BEDOU_SYNC_EVENT_RECEIVED] tap bedou_recharge_approved | user=${email}`);
            }
            if (route?.startsWith('/')) {
              try { sessionStorage.setItem('cdl_notif_route', route); } catch (_) {}
              window.dispatchEvent(new CustomEvent('cdl_navigate', { detail: { route } }));
            }
          } catch (_) {}
        },

        onPermissionDenied: () => {
          console.warn(`[FCM_PERMISSION_DENIED] push impossible | user=${email}`);
          // Permission refusée = on considère le boot "prêt" (dégradé) pour ne pas bloquer l'app
          setFcmStatus('permission_denied');
          setFcmReady(true);
          if (bootTimerRef.current) { clearTimeout(bootTimerRef.current); bootTimerRef.current = null; }
        },
      });
    } catch (e) {
      console.error(`[FCM_SAVE_FAILED] startNativeFcm error: ${e?.message}`);
    } finally {
      initInProgressRef.current = false;
    }
  }, [onTokenReceived, setFcmStatus, setFcmReady]);

  // Synchroniser la ref
  useEffect(() => { startNativeFcmRef.current = startNativeFcm; }, [startNativeFcm]);

  // ── Auto-détection + réparation token expiré → délégué à FcmTokenEngine ─────
  const autoRepairExpiredToken = useCallback(async (email) => {
    if (!email) return;
    try {
      const { count, tokens } = await FcmTokenEngine.getActiveTokens(email);
      if (count > 0) {
        console.log(`[FCM_AUTO_REPAIR] tokens valides trouvés | count=${count} | user=${email}`);
        return;
      }
      // Vérifier si il y avait des tokens avant (inactifs)
      const allTokens = await base44.entities.FcmToken.filter({ user_email: email }, null, 5);
      const cause = (allTokens?.length || 0) > 0 ? 'all_tokens_expired' : 'no_token_ever_saved';
      console.warn(`[FCM_AUTO_REPAIR] Token absent/expiré | cause=${cause} | user=${email} → re-register silencieux`);
      setFcmStatus('auto_repair');
      // FcmTokenEngine.repair dispatche l'event → startNativeFcm le capte
      await FcmTokenEngine.repair(email, cause);
    } catch (e) {
      console.error(`[FCM_AUTO_REPAIR] error: ${e?.message}`);
    }
  }, [setFcmStatus]);

  // ── Recovery silencieux ────────────────────────────────────────────────────
  const silentRecovery = useCallback(async (source = 'heartbeat') => {
    const email = lastEmailRef.current;
    if (!email) return;
    const exists = await hasActiveBddToken(email);
    if (!exists) {
      console.warn(`[FCM_BOOT_RECOVERY] token absent BDD | source=${source} | user=${email} → re-register`);
      setFcmStatus('recovery');
      await startNativeFcm(email);
    } else {
      console.log(`[FCM_TOKEN_VERIFY_SUCCESS] token BDD confirmé | source=${source} | user=${email}`);
      // S'assurer que le contexte est bien prêt
      setFcmReady(true);
      setFcmStatus('ready');
    }
  }, [startNativeFcm, setFcmReady, setFcmStatus]);

  // ── Vérification rapide token actif en BDD (au montage) → FcmTokenEngine ────
  const checkAndBootIfNeeded = useCallback(async (email) => {
    if (!email) return;
    try {
      const { verified, count } = await FcmTokenEngine.verify(email);
      if (!verified) {
        console.warn(`[FCM_BOOT_RECOVERY] Aucun token actif au démarrage → re-register immédiat | user=${email}`);
        setFcmStatus('recovery');
        await startNativeFcmRef.current?.(email);
      } else {
        console.log(`[FCM_TOKEN_VERIFY_SUCCESS] Token actif confirmé au démarrage | user=${email} | count=${count}`);
        markBootReady('startup_check');
      }
    } catch (e) {
      console.warn(`[FCM_BOOT_RECOVERY] checkAndBootIfNeeded error: ${e?.message} → proceeding with normal boot`);
    }
  }, [markBootReady, setFcmStatus]);

  // ── Effect principal ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!userEmail) return;

    const emailChanged = lastEmailRef.current !== userEmail;
    lastEmailRef.current = userEmail;

    console.log(`[FCM_BOOT_START] Bootstrap V5 | native=${native} | email=${userEmail} | emailChanged=${emailChanged}`);

    // ── WEB / PWA ──
    if (!native) {
      const runWeb = async () => {
        try {
          if (!('Notification' in window) || Notification.permission !== 'granted') {
            // Web sans permission → boot prêt en mode dégradé
            setFcmStatus('web_no_permission');
            setFcmReady(true);
            return;
          }
          const { registerSW } = await import('@/lib/swRegister');
          await registerSW();
          const { requestWebPushToken, onForegroundMessage } = await import('@/lib/webPush');
          const { token } = await requestWebPushToken();
          if (token) await onTokenReceived(token, 'web_init');
          else { setFcmStatus('web_no_token'); setFcmReady(true); }
          onForegroundMessage((payload) => {
            import('sonner').then(({ toast }) => {
              const n = payload?.notification || {};
              toast(n.title || 'CDL', { description: n.body || '', duration: 8000 });
            }).catch(() => {});
          });
        } catch (err) {
          console.error(`[FCM_SAVE_FAILED] Web init: ${err?.message}`);
          setFcmStatus('web_error');
          setFcmReady(true); // Ne pas bloquer l'app sur le web
        }
      };
      const t = setTimeout(runWeb, 1500);
      return () => clearTimeout(t);
    }

    // ── NATIF APK ──

    // Statut initial
    setFcmStatus('booting');

    // 0. Vérification immédiate : si token actif déjà en BDD → boot rapide sans attendre Firebase
    // (couvre le cas APK rouvert après courte absence — évite le délai d'affichage du banner)
    // + soft check auto-repair en parallèle (silencieux, pas de blocage)
    setTimeout(() => checkAndBootIfNeeded(userEmail), 300);
    setTimeout(() => autoRepairExpiredToken(userEmail), 500);

    // 1. Timeout de boot : si token jamais confirmé après BOOT_TIMEOUT_MS → recovery forcé
    bootTimerRef.current = setTimeout(async () => {
      const email = lastEmailRef.current;
      if (!email) return;
      console.error(`[FCM_BOOT_RECOVERY] ⛔ BOOT TIMEOUT ${BOOT_TIMEOUT_MS}ms — token non confirmé | user=${email} → recovery forcé`);
      setFcmStatus('recovery');
      // Tentative recovery : vérifier BDD d'abord, puis re-register
      const exists = await hasActiveBddToken(email);
      if (exists) {
        console.log(`[FCM_BOOT_READY] Token trouvé après timeout | user=${email}`);
        markBootReady('timeout_recovery_bdd_ok');
      } else {
        console.warn(`[FCM_BOOT_RECOVERY] BDD vide après timeout → re-register | user=${email}`);
        await startNativeFcm(email);
        // Deuxième chance : vérifier BDD après 10s
        setTimeout(async () => {
          const exists2 = await hasActiveBddToken(email);
          if (exists2) {
            markBootReady('timeout_recovery_2nd_chance');
          } else {
            // Dernier recours : marquer prêt en mode dégradé pour ne pas bloquer l'app
            console.error(`[FCM_BOOT_RECOVERY] Échec recovery définitif → boot dégradé | user=${email}`);
            setFcmStatus('degraded');
            setFcmReady(true);
          }
        }, 10_000);
      }
    }, BOOT_TIMEOUT_MS);

    // 2. Init immédiate
    const initTimer = setTimeout(() => startNativeFcm(userEmail), emailChanged ? 1500 : 500);

    // 3. Heartbeat 8 min (+ auto-repair)
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatRef.current = setInterval(async () => {
      const email = lastEmailRef.current;
      await autoRepairExpiredToken(email);  // Check & repair silencieux
      await silentRecovery('heartbeat');     // Vérification secondaire
    }, HEARTBEAT_INTERVAL_MS);

    // 4. Retour foreground
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      silentRecovery('visibility_change');
    };
    document.addEventListener('visibilitychange', onVisible);

    // 5. Force register depuis login/profil switch
    const onForceRegister = (e) => {
      const targetEmail = e?.detail?.email || lastEmailRef.current;
      if (targetEmail) {
        lastEmailRef.current = targetEmail;
        console.log(`[FCM_BOOT_RECOVERY] force_register event | user=${targetEmail}`);
        setFcmStatus('recovery');
        startNativeFcm(targetEmail);
      }
    };
    window.addEventListener('cdl_fcm_force_register', onForceRegister);

    return () => {
      clearTimeout(initTimer);
      if (bootTimerRef.current) { clearTimeout(bootTimerRef.current); bootTimerRef.current = null; }
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('cdl_fcm_force_register', onForceRegister);
    };
  }, [userEmail, native, startNativeFcm, silentRecovery, onTokenReceived, markBootReady, setFcmStatus, setFcmReady, checkAndBootIfNeeded, autoRepairExpiredToken]);

  return null;
}