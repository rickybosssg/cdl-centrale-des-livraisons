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

  // Fetch direct — sans cache, toujours depuis BDD
  const fetchBedou = useCallback(async (source = 'manual') => {
    if (!userEmail) { setLoading(false); return; }

    // Debounce 300ms : annule le timer précédent et repart
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    debounceTimer.current = setTimeout(async () => {
      // Si un fetch est en cours, on attend qu'il se termine avant d'en lancer un autre
      if (isFetching.current) {
        // Requeue dans 200ms
        debounceTimer.current = setTimeout(() => fetchBedou(source), 200);
        return;
      }

      isFetching.current = true;
      console.log(`[BEDOU_SYNC_START] source=${source} | email=${userEmail}`);

      try {
        const list = await base44.entities.Bedou.filter({ user_email: userEmail });
        const b = list?.[0] || null;

        console.log(`[BEDOU_SYNC_UPDATE] source=${source} | solde=${b?.solde ?? 'N/A'} | disponible=${b?.solde_disponible ?? 'N/A'} | bonus=${b?.solde_bonus ?? 'N/A'} | email=${userEmail}`);

        setBedou(b || { solde: 0, solde_disponible: 0, solde_bloque: 0, solde_bonus: 0, bonus: 0, gains_totaux: 0, depenses_totales: 0 });
      } catch (err) {
        console.error(`[BEDOU_SYNC_ERROR] source=${source} | error=${err?.message} | email=${userEmail}`);
      } finally {
        isFetching.current = false;
        setLoading(false);
      }
    }, 300);
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
        console.log(`[BEDOU_SYNC_REALTIME] event=Bedou.${ev.type} | email=${userEmail}`);
        fetchBedou(`realtime_bedou_${ev.type}`);
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
      fetchBedou(`realtime_tx_${ev.type}`);
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
        n?.target_entity_type === 'transaction';
      if (!isBedouNotif) return;
      console.log(`[BEDOU_SYNC_REALTIME] event=Notification.create | titre="${n?.titre}" | email=${userEmail}`);
      fetchBedou('realtime_notification');
      // Double reload de sécurité
      setTimeout(() => fetchBedou('realtime_notification_2s'), 2000);
    });

    // 4. Retour focus / visibilitychange
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        console.log(`[BEDOU_SYNC_FOCUS_REFRESH] visibilitychange → visible | email=${userEmail}`);
        fetchBedou('focus_refresh');
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    // 5. Push FCM natif bedou_recharge_approved
    const onFcmBedou = () => {
      console.log(`[BEDOU_SYNC_REALTIME] event=fcm_push bedou_recharge_approved | email=${userEmail}`);
      fetchBedou('fcm_push_bedou');
      setTimeout(() => fetchBedou('fcm_push_bedou_2s'), 2000);
    };
    window.addEventListener('bedou_recharge_approved', onFcmBedou);

    // 6. Refresh manuel externe (ex: après validation admin)
    const onManualRefresh = () => {
      console.log(`[BEDOU_SYNC_FOCUS_REFRESH] event=bedou_sync_refresh (manuel) | email=${userEmail}`);
      fetchBedou('manual_external_refresh');
    };
    window.addEventListener('bedou_sync_refresh', onManualRefresh);

    // 7. Reloads de sécurité après mount
    const t800 = setTimeout(() => fetchBedou('safety_800ms'), 800);
    const t3 = setTimeout(() => fetchBedou('safety_3s'), 3000);
    const t8 = setTimeout(() => fetchBedou('safety_8s'), 8000);

    return () => {
      unsubBedou?.();
      unsubTx?.();
      unsubNotif?.();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('bedou_recharge_approved', onFcmBedou);
      window.removeEventListener('bedou_sync_refresh', onManualRefresh);
      clearTimeout(t800);
      clearTimeout(t3);
      clearTimeout(t8);
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
    console.log('[BEDOU_SYNC_FOCUS_REFRESH] triggerBedouRefresh() dispatched');
  } catch (_) {}
}