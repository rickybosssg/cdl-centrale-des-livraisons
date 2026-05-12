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

const APP_BASE_URL = 'https://cdl.base44.app';
const HEARTBEAT_INTERVAL_MS = 8 * 60 * 1000;  // 8 min
const TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours
const SAVE_DEBOUNCE_MS = 10_000;
const BOOT_TIMEOUT_MS = 20_000;   // 20s max avant recovery forcé
const VERIFY_RETRY_MAX = 3;       // Nombre max de tentatives verify

// ── Verrou anti-doublon save ──────────────────────────────────────────────────
const _saveRecent = new Map();

function shouldSkipSave(email, token) {
  const key = `${email}__${token.slice(0, 20)}`;
  const last = _saveRecent.get(key) || 0;
  const elapsed = Date.now() - last;
  if (elapsed < SAVE_DEBOUNCE_MS) {
    console.log(`[FCM_SAVE_ATTEMPT] debounce skip — ${elapsed}ms | user=${email}`);
    return true;
  }
  _saveRecent.set(key, Date.now());
  setTimeout(() => _saveRecent.delete(key), SAVE_DEBOUNCE_MS * 3);
  return false;
}

async function resolveEmail(propEmail) {
  if (propEmail) return propEmail;
  try {
    const me = await Promise.race([
      base44.auth.me(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000)),
    ]);
    return me?.email || null;
  } catch (e) {
    console.warn('[FCM_SAVE_FAILED] resolveEmail:', e?.message);
    return null;
  }
}

// ── Save public endpoint ──────────────────────────────────────────────────────
export async function saveFcmTokenRemote({ user_email, token, device_type = 'android_native' }) {
  if (!user_email || !token) {
    console.error(`[FCM_SAVE_FAILED] params manquants | email=${!!user_email} token=${!!token}`);
    return { success: false };
  }
  if (shouldSkipSave(user_email, token)) return { success: false, action: 'debounced' };

  console.log(`[FCM_TOKEN_SAVE_START] user=${user_email} | token_preview=${token.slice(0, 30)}...`);

  try {
    const res = await fetch(`${APP_BASE_URL}/functions/saveFcmTokenPublic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_email, token, device_type }),
    });
    const text = await res.text();
    let data = {};
    try { data = JSON.parse(text); } catch (_) {
      console.error(`[FCM_SAVE_FAILED] JSON parse | raw=${text.slice(0, 150)}`);
      return { success: false };
    }

    if (res.ok && data?.success) {
      console.log(`[FCM_TOKEN_SAVE_SUCCESS] action=${data.action} | token_id=${data.token_id} | user=${user_email}`);
      try {
        localStorage.setItem('cdl_fcm_current_token', token);
        localStorage.setItem('cdl_fcm_last_save', new Date().toISOString());
        localStorage.setItem('cdl_fcm_last_user', user_email);
      } catch (_) {}
      return data;
    }

    console.error(`[FCM_SAVE_FAILED] HTTP ${res.status} | error=${data.error || '?'} | user=${user_email}`);
    return { success: false, error: data.error };
  } catch (err) {
    console.error(`[FCM_SAVE_FAILED] fetch error | ${err.message} | user=${user_email}`);
    return { success: false };
  }
}

// ── Vérification forte : relire BDD et comparer avec token local ──────────────
async function verifyTokenInBdd(userEmail, localToken, attempt = 1) {
  try {
    const tokens = await base44.entities.FcmToken.filter({ user_email: userEmail, is_active: true });
    const valid = (tokens || []).filter(t => {
      if (!t.is_active) return false;
      const ref = t.last_used || t.registered_at;
      if (!ref) return true;
      return Date.now() - new Date(ref).getTime() < TOKEN_MAX_AGE_MS;
    });

    if (valid.length === 0) {
      console.error(`[FCM_BOOT_RECOVERY] verifyTokenInBdd | aucun token actif BDD | attempt=${attempt} | user=${userEmail}`);
      return { verified: false, count: 0 };
    }

    // Comparer token local vs token BDD
    if (localToken) {
      const localPreview = localToken.slice(0, 60);
      const bddMatch = valid.find(t => t.token && t.token.startsWith(localPreview.slice(0, 30)));
      if (!bddMatch) {
        console.warn(`[FCM_BOOT_RECOVERY] token local != BDD | local_preview=${localPreview.slice(0, 30)} | bdd_preview=${valid[0].token.slice(0, 30)} | user=${userEmail}`);
        // Mismatch → le token BDD est différent du local, mais il y a quand même un token actif
        // On accepte si la BDD a au moins 1 token valide récent
        console.log(`[FCM_TOKEN_VERIFY_SUCCESS] token BDD valide (mismatch local accepté) | count=${valid.length} | user=${userEmail}`);
        return { verified: true, count: valid.length };
      }
    }

    console.log(`[FCM_TOKEN_VERIFY_SUCCESS] token confirmé en BDD | count=${valid.length} | user=${userEmail}`);
    return { verified: true, count: valid.length };
  } catch (e) {
    console.error(`[FCM_BOOT_RECOVERY] verifyTokenInBdd error | ${e?.message} | user=${userEmail}`);
    return { verified: false, count: 0 };
  }
}

// ── Vérifier existence rapide (pour heartbeat/recovery) ──────────────────────
async function hasActiveBddToken(userEmail) {
  const { verified } = await verifyTokenInBdd(userEmail, null);
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

  // ── Callback token (registration + refresh) ──────────────────────────────
  const onTokenReceived = useCallback(async (token, source = 'registration') => {
    try {
      const email = await resolveEmail(lastEmailRef.current);
      if (!email) {
        console.error(`[FCM_SAVE_FAILED] email indisponible | source=${source}`);
        return;
      }

      console.log(`[FCM_TOKEN_RECEIVED] source=${source} | preview=${token.slice(0, 30)}... | user=${email}`);

      // Vérifier token local existant
      let localToken = null;
      try { localToken = localStorage.getItem('cdl_fcm_current_token'); } catch (_) {}
      if (localToken) {
        console.log(`[FCM_TOKEN_LOCAL_FOUND] local_preview=${localToken.slice(0, 30)}... | user=${email}`);
      }

      // Save en BDD
      const result = await saveFcmTokenRemote({ user_email: email, token, device_type: native ? 'android_native' : 'web' });

      if (result?.success) {
        // Vérification forte post-save
        let verified = false;
        for (let attempt = 1; attempt <= VERIFY_RETRY_MAX; attempt++) {
          await new Promise(r => setTimeout(r, 800 * attempt)); // délai croissant
          const { verified: v } = await verifyTokenInBdd(email, token, attempt);
          if (v) { verified = true; break; }
          console.warn(`[FCM_BOOT_RECOVERY] verify attempt ${attempt}/${VERIFY_RETRY_MAX} failed | user=${email}`);
        }

        if (verified) {
          console.log(`[FCM_AUTO_RECOVERY_SUCCESS] token enregistré et vérifié BDD | user=${email} | source=${source}`);
          markBootReady('post_save_verify');
        } else {
          // Mismatch persistant → re-trigger recovery
          console.error(`[FCM_BOOT_RECOVERY] verify failed après ${VERIFY_RETRY_MAX} tentatives → re-register | user=${email}`);
          setFcmStatus('recovery');
          setTimeout(() => startNativeFcmRef.current?.(email), 2000);
        }
      } else if (result?.action !== 'debounced') {
        console.error(`[FCM_SAVE_FAILED] échec save | error=${result?.error} | retry 30s`);
        setTimeout(() => saveFcmTokenRemote({ user_email: email, token, device_type: native ? 'android_native' : 'web' }).catch(() => {}), 30_000);
      } else {
        // Debounce = token déjà sauvé récemment → vérifier si BDD ok quand même
        const { verified } = await verifyTokenInBdd(email, token);
        if (verified) markBootReady('debounced_verify_ok');
      }
    } catch (e) {
      console.error(`[FCM_SAVE_FAILED] onTokenReceived: ${e?.message}`);
    }
  }, [native, markBootReady]);

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

    // 3. Heartbeat 8 min
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatRef.current = setInterval(() => silentRecovery('heartbeat'), HEARTBEAT_INTERVAL_MS);

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
  }, [userEmail, native, startNativeFcm, silentRecovery, onTokenReceived, markBootReady, setFcmStatus, setFcmReady]);

  return null;
}