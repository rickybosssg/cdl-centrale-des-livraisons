/**
 * useBedouSync — Hook centralisé de synchronisation Bedou V2
 *
 * Déclencheurs :
 * - Bedou.subscribe (update/create) — realtime entity
 * - Transaction.subscribe (create) — nouvelle transaction Bedou
 * - Notification.subscribe (create) — recharge validée / crédit / débit
 * - visibilitychange — retour focus app
 * - window event 'bedou_recharge_approved' — push FCM natif
 * - window event 'bedou_sync_refresh' — refresh manuel externe
 * - Reloads de sécurité : 800ms, 3s, 8s après mount
 *
 * Règles :
 * - Jamais de cache — toujours filter() direct
 * - Debounce 300ms pour éviter les appels parallèles
 * - Logs standardisés [BEDOU_SYNC_*]
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";

export function useBedouSync(userEmail) {
  const [bedou, setBedou] = useState(null);
  const [loading, setLoading] = useState(true);
  const debounceTimer = useRef(null);
  const isFetching = useRef(false);
  const queuedFetch = useRef(null);

  // Fetch direct — sans cache, toujours depuis BDD
  const fetchBedou = useCallback(async (source = 'manual', options = {}) => {
    if (!userEmail) { setLoading(false); return; }

    // Debounce 300ms : annule le timer précédent et repart
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    debounceTimer.current = setTimeout(async () => {
      // Si un fetch est en cours, on attend qu'il se termine avant d'en lancer un autre
      if (isFetching.current) {
        queuedFetch.current = source;
        return;
      }

      isFetching.current = true;
      console.log(`[BEDOU_SYNC_START] source=${source} | email=${userEmail}`);

      try {
        const list = await base44.entities.Bedou.filter({ user_email: userEmail });
        const b = list?.[0] || null;

        console.log(`[BEDOU_SYNC_REFRESH_SUCCESS] source=${source} | solde=${b?.solde ?? 'N/A'} | disponible=${b?.solde_disponible ?? 'N/A'} | bonus=${b?.solde_bonus ?? 'N/A'} | email=${userEmail}`);

        setBedou(b || { solde: 0, solde_disponible: 0, solde_bloque: 0, solde_bonus: 0, bonus: 0, gains_totaux: 0, depenses_totales: 0 });
      } catch (err) {
        console.error(`[BEDOU_SYNC_ERROR] source=${source} | error=${err?.message} | email=${userEmail}`);
      } finally {
        isFetching.current = false;
        setLoading(false);
        if (queuedFetch.current) {
          const queuedSource = queuedFetch.current;
          queuedFetch.current = null;
          setTimeout(() => fetchBedou(`${queuedSource}_queued`, { immediate: true }), 50);
        }
      }
    }, options?.immediate ? 0 : 300);
  }, [userEmail]);

  useEffect(() => {
    if (!userEmail) { setLoading(false); return; }

    // Chargement initial immédiat (sans debounce)
    console.log(`[BEDOU_SYNC_START] initial_load | email=${userEmail}`);
    base44.entities.Bedou.filter({ user_email: userEmail }).then(list => {
      const b = list?.[0] || null;
      console.log(`[BEDOU_SYNC_UPDATE] source=initial_load | solde=${b?.solde ?? 'N/A'} | email=${userEmail}`);
      setBedou(b || { solde: 0, solde_disponible: 0, solde_bloque: 0, solde_bonus: 0, bonus: 0, gains_totaux: 0, depenses_totales: 0 });
    }).catch(err => {
      console.error(`[BEDOU_SYNC_ERROR] source=initial_load | error=${err?.message}`);
    }).finally(() => setLoading(false));

    // 1. Realtime Bedou entity — create ou update
    const unsubBedou = base44.entities.Bedou.subscribe((ev) => {
      if (ev.type === 'update' || ev.type === 'create') {
        if (ev.data?.user_email && ev.data.user_email !== userEmail) return;
        console.log(`[BEDOU_SYNC_REALTIME] event=Bedou.${ev.type} | email=${userEmail}`);
        if (ev.data?.user_email === userEmail) setBedou(ev.data);
        fetchBedou(`realtime_bedou_${ev.type}`, { immediate: true });
      }
    });

    // 2. Realtime Transaction — nouvelle transaction Bedou (crédit/débit)
    const unsubTx = base44.entities.Transaction.subscribe((ev) => {
      if (ev.type !== 'create' && ev.type !== 'update') return;
      const tx = ev.data;
      if (tx?.user_email !== userEmail) return;
      const isBedouTx = ['recharge', 'paiement', 'gain', 'bonus', 'retrait', 'ajustement', 'commission'].includes(tx?.type);
      if (!isBedouTx) return;
      console.log(`[BEDOU_SYNC_REALTIME] event=Transaction.${ev.type} | type=${tx?.type} | montant=${tx?.montant} | email=${userEmail}`);
      fetchBedou(`realtime_tx_${ev.type}`, { immediate: true });
      setTimeout(() => fetchBedou(`realtime_tx_${ev.type}_1s`, { immediate: true }), 1000);
    });

    // 3. Notification interne — recharge validée / crédit / débit
    const unsubNotif = base44.entities.Notification.subscribe((ev) => {
      if (ev.type !== 'create') return;
      const n = ev.data;
      if (n?.destinataire_email !== userEmail) return;
      const isBedouNotif =
        n?.titre?.toLowerCase().includes('recharge') ||
        n?.titre?.toLowerCase().includes('bedou') ||
        n?.message?.toLowerCase().includes('crédité') ||
        n?.message?.toLowerCase().includes('débité') ||
        n?.message?.toLowerCase().includes('solde') ||
        n?.target_entity_type === 'bedou' ||
        n?.target_entity_type === 'DemandeRecharge' ||
        n?.target_entity_type === 'transaction';
      if (!isBedouNotif) return;
      console.log(`[BEDOU_SYNC_EVENT_RECEIVED] event=Notification.create | titre="${n?.titre}" | email=${userEmail}`);
      fetchBedou('realtime_notification', { immediate: true });
      // Double reload de sécurité
      setTimeout(() => fetchBedou('realtime_notification_2s', { immediate: true }), 2000);
    });

    // 4. Retour focus / visibilitychange
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        console.log(`[BEDOU_SYNC_FOCUS_REFRESH] visibilitychange → visible | email=${userEmail}`);
        fetchBedou('focus_refresh', { immediate: true });
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    // 5. Push FCM natif : tous les événements qui peuvent impacter Bedou
    const onFcmBedou = (event) => {
      const eventName = event?.type || 'bedou_push';
      console.log(`[BEDOU_SYNC_EVENT_RECEIVED] event=${eventName} | email=${userEmail}`);
      fetchBedou(`fcm_${eventName}`, { immediate: true });
      setTimeout(() => fetchBedou(`fcm_${eventName}_800ms`, { immediate: true }), 800);
      setTimeout(() => fetchBedou(`fcm_${eventName}_2s`, { immediate: true }), 2000);
      setTimeout(() => fetchBedou(`fcm_${eventName}_5s`, { immediate: true }), 5000);
    };
    const bedouEvents = [
      'bedou_recharge_approved',
      'bedou_recharge_rejected',
      'bedou_withdrawal_approved',
      'bedou_withdrawal_rejected',
      'bedou_low_balance',
      'course_delivered',
      'course_delivered_driver',
      'cdl_push_received',
    ];
    bedouEvents.forEach((eventName) => window.addEventListener(eventName, onFcmBedou));

    // 6. Refresh manuel externe (ex: après validation admin)
    const onManualRefresh = () => {
      console.log(`[BEDOU_SYNC_EVENT_RECEIVED] event=bedou_sync_refresh (manuel) | email=${userEmail}`);
      fetchBedou('manual_external_refresh', { immediate: true });
    };
    window.addEventListener('bedou_sync_refresh', onManualRefresh);

    // 6b. Event bedou_updated (dispatché par FcmBootstrap ou autres composants)
    const onBedouUpdated = () => {
      console.log(`[BEDOU_SYNC_EVENT_RECEIVED] event=bedou_updated | email=${userEmail}`);
      fetchBedou('bedou_updated_event', { immediate: true });
    };
    window.addEventListener('bedou_updated', onBedouUpdated);

    return () => {
      unsubBedou?.();
      unsubTx?.();
      unsubNotif?.();
      document.removeEventListener('visibilitychange', onVisible);
      bedouEvents.forEach((eventName) => window.removeEventListener(eventName, onFcmBedou));
      window.removeEventListener('bedou_sync_refresh', onManualRefresh);
      window.removeEventListener('bedou_updated', onBedouUpdated);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [userEmail, fetchBedou]);

  return { bedou, loading, reload: fetchBedou };
}

/**
 * Déclencher un refresh Bedou depuis n'importe quelle page/composant
 * sans avoir accès au hook (ex: après validation admin)
 */
export function triggerBedouRefresh() {
  try {
    window.dispatchEvent(new CustomEvent('bedou_sync_refresh'));
    window.dispatchEvent(new CustomEvent('bedou_updated'));
    console.log('[BEDOU_SYNC_EVENT_RECEIVED] triggerBedouRefresh() dispatched bedou_sync_refresh + bedou_updated');
  } catch (_) {}
}
