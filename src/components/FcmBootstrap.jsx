/**
 * FcmBootstrap — Architecture FCM auto-réparatrice V4
 *
 * GARANTIES :
 * 1. Token toujours présent en BDD pour chaque session connectée
 * 2. Heartbeat 8 min → re-register() Firebase si token absent BDD
 * 3. Retour foreground → vérification + récupération silencieuse
 * 4. Login / changement email → force re-register() immédiat
 * 5. onTokenRefresh Firebase → sauvegarde automatique du nouveau token
 * 6. Nettoyage intelligent : jamais supprimer le dernier token actif < 7j
 * 7. Auto-retry 30s si save échoue
 * 8. Logs audit normalisés [FCM_AUTO_RECOVERY_START/SUCCESS]
 *
 * SOURCE UNIQUE d'enregistrement — rien d'autre ne sauvegarde en BDD.
 */

import { useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { initCapacitorPush, isNativeApp } from '@/lib/nativePush';

const APP_BASE_URL = 'https://cdl.base44.app';
const FCM_INIT_DELAY_MS = 1500;        // Délai initial après login
const HEARTBEAT_INTERVAL_MS = 8 * 60 * 1000; // 8 min
const TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours
const SAVE_DEBOUNCE_MS = 10_000;       // Anti-doublon 10s

// ── Verrou anti-doublon save ──────────────────────────────────────────────────
const _saveRecent = new Map(); // key = email__token20chars → timestamp

function shouldSkipSave(email, token) {
  const key = `${email}__${token.slice(0, 20)}`;
  const last = _saveRecent.get(key) || 0;
  const elapsed = Date.now() - last;
  if (elapsed < SAVE_DEBOUNCE_MS) {
    console.log(`[FCM_SAVE_ATTEMPT] debounce skip — ${elapsed}ms écoulés | user=${email}`);
    return true;
  }
  _saveRecent.set(key, Date.now());
  setTimeout(() => _saveRecent.delete(key), SAVE_DEBOUNCE_MS * 3);
  return false;
}

// ── Résoudre l'email (prop ou session) ───────────────────────────────────────
async function resolveEmail(propEmail) {
  if (propEmail) return propEmail;
  try {
    const me = await Promise.race([
      base44.auth.me(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000)),
    ]);
    return me?.email || null;
  } catch (e) {
    console.warn('[FCM_SAVE_FAILED] resolveEmail timeout:', e?.message);
    return null;
  }
}

// ── Save vers le backend public (pas de session auth requise) ─────────────────
export async function saveFcmTokenRemote({ user_email, token, device_type = 'android_native' }) {
  if (!user_email || !token) {
    console.error(`[FCM_SAVE_FAILED] params manquants | email=${!!user_email} token=${!!token}`);
    return { success: false };
  }
  if (shouldSkipSave(user_email, token)) return { success: false, action: 'debounced' };

  const url = `${APP_BASE_URL}/functions/saveFcmTokenPublic`;
  console.log(`[FCM_SAVE_ATTEMPT] → ${url} | user=${user_email} | token_preview=${token.slice(0, 30)}...`);

  try {
    const res = await fetch(url, {
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
      console.log(`[FCM_SAVE_SUCCESS] action=${data.action} | token_id=${data.token_id} | user=${user_email}`);
      try {
        localStorage.setItem('cdl_fcm_token_saved', new Date().toISOString());
        localStorage.setItem('cdl_fcm_token_preview', token.slice(0, 30));
        localStorage.setItem('cdl_fcm_last_user', user_email);
        localStorage.setItem('cdl_fcm_current_token', token.slice(0, 60));
        localStorage.setItem('cdl_fcm_last_save', new Date().toISOString());
      } catch (_) {}
      return data;
    }

    console.error(`[FCM_SAVE_FAILED] HTTP ${res.status} | error=${data.error || '?'} | step=${data.step || '?'} | user=${user_email}`);
    return { success: false, error: data.error };
  } catch (err) {
    console.error(`[FCM_SAVE_FAILED] fetch error | ${err.message} | user=${user_email}`);
    return { success: false };
  }
}

// ── Vérifier si token actif < 7j existe en BDD ───────────────────────────────
async function hasActiveBddToken(userEmail) {
  try {
    const tokens = await base44.entities.FcmToken.filter({ user_email: userEmail, is_active: true });
    const valid = (tokens || []).filter(t => {
      if (!t.is_active) return false;
      const ref = t.last_used || t.registered_at;
      if (!ref) return true; // Pas de date → considérer valide
      return Date.now() - new Date(ref).getTime() < TOKEN_MAX_AGE_MS;
    });
    console.log(`[FCM_AUTO_RECOVERY_START] check_bdd | active=${valid.length} | total=${tokens?.length || 0} | user=${userEmail}`);
    return valid.length > 0;
  } catch (e) {
    console.warn(`[FCM_AUTO_RECOVERY_START] bdd_error=${e?.message} | user=${userEmail} → assume absent`);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────────────────────
export default function FcmBootstrap({ userEmail }) {
  const lastEmailRef = useRef(null);   // Email pour lequel FCM est initialisé
  const heartbeatRef = useRef(null);
  const initInProgressRef = useRef(false);
  const native = isNativeApp();

  // ── Callback token — utilisé à chaque register() ou refresh Firebase ─────
  const onTokenReceived = useCallback(async (token, source = 'registration') => {
    try {
      console.log(`[FCM_TOKEN_RECEIVED] source=${source} | preview=${token.slice(0, 30)}... | len=${token.length}`);
      const email = await resolveEmail(lastEmailRef.current);
      if (!email) {
        console.error(`[FCM_SAVE_FAILED] email indisponible | source=${source}`);
        return;
      }

      console.log(`[FCM_TOKEN_REGENERATED] token prêt | user=${email} | source=${source}`);
      const result = await saveFcmTokenRemote({ user_email: email, token, device_type: native ? 'android_native' : 'web' });

      if (result?.success) {
        console.log(`[FCM_TOKEN_SAVED] ✅ action=${result.action} | id=${result.token_id} | user=${email}`);
        console.log(`[FCM_AUTO_RECOVERY_SUCCESS] token enregistré en BDD | user=${email} | source=${source}`);
      } else if (result?.action !== 'debounced') {
        // Auto-retry après 30s si ce n'est pas un debounce
        console.error(`[FCM_SAVE_FAILED] échec save | error=${result?.error} | retry dans 30s`);
        setTimeout(() => saveFcmTokenRemote({ user_email: email, token, device_type: native ? 'android_native' : 'web' }).catch(() => {}), 30_000);
      }
    } catch (e) {
      console.error(`[FCM_SAVE_FAILED] onTokenReceived exception: ${e?.message}`);
    }
  }, [native]);

  // ── Démarrer FCM natif (register + listeners) ────────────────────────────
  const startNativeFcm = useCallback(async (email) => {
    if (initInProgressRef.current) {
      console.log('[FCM_AUTO_RECOVERY_START] init déjà en cours — skip');
      return;
    }
    initInProgressRef.current = true;
    console.log(`[FCM_AUTO_RECOVERY_START] startNativeFcm | user=${email}`);

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
              console.log(`[BEDOU_SYNC_EVENT_RECEIVED] bedou_recharge_approved foreground | user=${email}`);
            }

            import('sonner').then(({ toast }) => {
              toast(title, {
                description: body, duration: 8000,
                action: route ? { label: 'Voir', onClick: () => { try { sessionStorage.setItem('cdl_notif_route', route); } catch (_) {} window.dispatchEvent(new CustomEvent('cdl_navigate', { detail: { route } })); } } : undefined,
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
              console.log(`[BEDOU_SYNC_EVENT_RECEIVED] bedou_recharge_approved tap | user=${email}`);
            }
            if (route?.startsWith('/')) {
              try { sessionStorage.setItem('cdl_notif_route', route); } catch (_) {}
              window.dispatchEvent(new CustomEvent('cdl_navigate', { detail: { route } }));
            }
          } catch (_) {}
        },

        onPermissionDenied: () => {
          console.warn(`[FCM_PERMISSION_DENIED] push impossible | user=${email}`);
        },
      });
    } catch (e) {
      console.error(`[FCM_SAVE_FAILED] startNativeFcm error: ${e?.message}`);
    } finally {
      initInProgressRef.current = false;
    }
  }, [onTokenReceived]);

  // ── Recovery silencieux : vérifie BDD + re-register si absent ────────────
  const silentRecovery = useCallback(async (source = 'heartbeat') => {
    const email = lastEmailRef.current;
    if (!email) return;
    const exists = await hasActiveBddToken(email);
    if (!exists) {
      console.warn(`[FCM_AUTO_RECOVERY_START] token absent en BDD | source=${source} | user=${email}`);
      await startNativeFcm(email);
    } else {
      console.log(`[FCM_REGISTER_SUCCESS] token BDD confirmé | source=${source} | user=${email}`);
    }
  }, [startNativeFcm]);

  // ── Effect principal — déclenché à chaque changement d'email ────────────
  useEffect(() => {
    if (!userEmail) return;

    const emailChanged = lastEmailRef.current !== userEmail;
    lastEmailRef.current = userEmail;

    console.log(`[FCM_REGISTER_SUCCESS] Bootstrap | native=${native} | email=${userEmail} | emailChanged=${emailChanged}`);

    if (!native) {
      // PWA/Web — init légère
      const runWeb = async () => {
        try {
          if (!('Notification' in window) || Notification.permission !== 'granted') return;
          const { registerSW } = await import('@/lib/swRegister');
          await registerSW();
          const { requestWebPushToken, onForegroundMessage } = await import('@/lib/webPush');
          const { token } = await requestWebPushToken();
          if (token) await onTokenReceived(token, 'web_init');
          onForegroundMessage((payload) => {
            import('sonner').then(({ toast }) => {
              const n = payload?.notification || {};
              toast(n.title || 'CDL', { description: n.body || '', duration: 8000 });
            }).catch(() => {});
          });
        } catch (err) {
          console.error(`[FCM_SAVE_FAILED] Web init error: ${err?.message}`);
        }
      };
      const t = setTimeout(runWeb, FCM_INIT_DELAY_MS);
      return () => clearTimeout(t);
    }

    // ── NATIF APK ──

    // 1. Init immédiate (ou après délai court si 1er login)
    const initTimer = setTimeout(() => startNativeFcm(userEmail), emailChanged ? FCM_INIT_DELAY_MS : 500);

    // 2. Heartbeat toutes les 8 min
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatRef.current = setInterval(() => silentRecovery('heartbeat'), HEARTBEAT_INTERVAL_MS);

    // 3. Vérification au retour foreground (sans re-register si token OK)
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      silentRecovery('visibility_change');
    };
    document.addEventListener('visibilitychange', onVisible);

    // 4. Écouter event de login/changement profil externe
    const onForceRegister = (e) => {
      const targetEmail = e?.detail?.email || lastEmailRef.current;
      if (targetEmail) {
        lastEmailRef.current = targetEmail;
        console.log(`[FCM_AUTO_RECOVERY_START] force_register event | user=${targetEmail}`);
        startNativeFcm(targetEmail);
      }
    };
    window.addEventListener('cdl_fcm_force_register', onForceRegister);

    return () => {
      clearTimeout(initTimer);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('cdl_fcm_force_register', onForceRegister);
    };
  }, [userEmail, native, startNativeFcm, silentRecovery, onTokenReceived]);

  return null;
}