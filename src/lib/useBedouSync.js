/**
 * useBedouSync — Hook centralisé de synchronisation Bedou
 * 
 * Écoute tous les déclencheurs possibles et force le reload du solde :
 * - Bedou.update (realtime entity)
 * - Notification.create (recharge validée)
 * - visibilitychange (retour focus)
 * - window event 'bedou_recharge_approved' (push FCM natif)
 * - Reloads de sécurité (500ms, 2s, 5s)
 * 
 * ⚠️ Ne jamais utiliser de cache — toujours filter() direct.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";

export function useBedouSync(userEmail) {
  const [bedou, setBedou] = useState(null);
  const [loading, setLoading] = useState(true);
  const loadingRef = useRef(false);

  const loadBedou = useCallback(async (source = 'manual') => {
    if (!userEmail) { setLoading(false); return; }
    // Éviter les appels parallèles (debounce léger)
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const list = await base44.entities.Bedou.filter({ user_email: userEmail });
      const b = list?.[0] || null;

      console.log('[CLIENT_RECHARGE_FINAL_CHECK]', {
        client_email: userEmail,
        reload_source: source,
        bedou_id: b?.id || 'INTROUVABLE',
        solde_bdd: b?.solde ?? 'N/A',
        solde_disponible_bdd: b?.solde_disponible ?? 'N/A',
        solde_bonus_bdd: b?.solde_bonus ?? 'N/A',
        cache_used: false,
      });

      setBedou(b || { solde: 0, solde_disponible: 0, solde_bloque: 0, solde_bonus: 0, bonus: 0 });
    } catch (err) {
      console.warn('[useBedouSync] load error:', err?.message);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [userEmail]);

  useEffect(() => {
    if (!userEmail) return;

    // Chargement initial
    loadBedou('initial_load');

    // 1. Realtime Bedou entity update
    const unsubBedou = base44.entities.Bedou.subscribe((ev) => {
      if (ev.type === 'update') {
        console.log('[CLIENT_RECHARGE_FINAL_CHECK]', { client_email: userEmail, event: 'Bedou.update', reload_source: 'realtime_entity', reload_triggered: true });
        loadBedou('realtime_bedou_update');
      }
    });

    // 2. Notification interne — recharge approuvée
    const unsubNotif = base44.entities.Notification.subscribe((ev) => {
      if (ev.type !== 'create') return;
      const n = ev.data;
      const isForMe = n?.destinataire_email === userEmail;
      const isRecharge = n?.titre?.includes('Recharge') || n?.message?.includes('crédité');
      if (isForMe && isRecharge) {
        console.log('[CLIENT_RECHARGE_FINAL_CHECK]', { client_email: userEmail, event: 'Notification.create', reload_source: 'internal_notification', reload_triggered: true });
        loadBedou('internal_notification');
        setTimeout(() => loadBedou('internal_notification_500ms'), 500);
        setTimeout(() => loadBedou('internal_notification_2s'), 2000);
        setTimeout(() => loadBedou('internal_notification_5s'), 5000);
      }
    });

    // 3. Retour focus / visibilitychange
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        console.log('[CLIENT_RECHARGE_FINAL_CHECK]', { client_email: userEmail, event: 'visibilitychange', reload_source: 'page_focus', reload_triggered: true });
        loadBedou('page_focus');
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    // 4. Événement custom émis par FcmBootstrap lors d'un push natif
    const onFcmBedou = () => {
      console.log('[CLIENT_RECHARGE_FINAL_CHECK]', { client_email: userEmail, event: 'bedou_recharge_approved', reload_source: 'fcm_push', reload_triggered: true });
      loadBedou('fcm_push_event');
      setTimeout(() => loadBedou('fcm_push_event_500ms'), 500);
      setTimeout(() => loadBedou('fcm_push_event_2s'), 2000);
    };
    window.addEventListener('bedou_recharge_approved', onFcmBedou);

    // 5. Reloads de sécurité
    const t500 = setTimeout(() => loadBedou('safety_500ms'), 500);
    const t2 = setTimeout(() => loadBedou('safety_2s'), 2000);
    const t5 = setTimeout(() => loadBedou('safety_5s'), 5000);

    return () => {
      unsubBedou?.();
      unsubNotif?.();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('bedou_recharge_approved', onFcmBedou);
      clearTimeout(t500);
      clearTimeout(t2);
      clearTimeout(t5);
    };
  }, [userEmail, loadBedou]);

  return { bedou, loading, reload: loadBedou };
}