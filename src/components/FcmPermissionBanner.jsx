/**
 * FcmPermissionBanner — Bannière non intrusive si permission push refusée/non accordée
 * S'affiche uniquement sur APK Android natif, disparaît si l'utilisateur ferme.
 * Écoute l'event 'cdl_fcm_permission_denied' dispatché par FcmBootstrap.
 */
import { useState, useEffect } from 'react';
import { openAppSettings } from '@/lib/nativePush';

export default function FcmPermissionBanner() {
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState('denied');

  useEffect(() => {
    const handler = (e) => {
      setStatus(e.detail?.status || 'denied');
      setVisible(true);
    };
    window.addEventListener('cdl_fcm_permission_denied', handler);
    return () => window.removeEventListener('cdl_fcm_permission_denied', handler);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[999] px-3 py-2 bg-amber-500 text-white flex items-center gap-2 shadow-lg">
      <span className="text-lg flex-shrink-0">🔔</span>
      <p className="text-xs font-semibold flex-1">
        {status === 'denied'
          ? 'Notifications désactivées — vous manquerez les alertes de course'
          : 'Activez les notifications pour recevoir vos alertes CDL'}
      </p>
      <button
        onClick={async () => {
          await openAppSettings();
          setVisible(false);
        }}
        className="flex-shrink-0 px-2.5 py-1 rounded-lg bg-white text-amber-700 text-xs font-bold"
      >
        Activer
      </button>
      <button onClick={() => setVisible(false)} className="flex-shrink-0 text-white/70 text-lg leading-none px-1">×</button>
    </div>
  );
}