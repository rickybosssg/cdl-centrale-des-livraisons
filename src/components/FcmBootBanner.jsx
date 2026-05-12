/**
 * FcmBootBanner — Bannière d'initialisation FCM
 *
 * Affiché uniquement sur APK natif, pendant le boot FCM (token non encore confirmé BDD).
 * Disparaît automatiquement dès que fcmReady = true.
 * Timeout de sécurité : masqué après 25s quoi qu'il arrive.
 */
import { useEffect, useState } from 'react';
import { useFcmReady } from '@/context/FcmReadyContext';
import { isNativeApp } from '@/lib/nativePush';

const STATUS_LABELS = {
  idle: 'Initialisation...',
  booting: 'Initialisation notifications…',
  registering: 'Enregistrement appareil…',
  recovery: 'Récupération notifications…',
  ready: null,
  permission_denied: null,
  web_no_permission: null,
  web_no_token: null,
  web_error: null,
  degraded: null,
};

export default function FcmBootBanner() {
  const { fcmReady, fcmStatus } = useFcmReady();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isNativeApp()) return;
    // Afficher seulement si pas encore prêt
    if (!fcmReady && !dismissed) {
      setVisible(true);
    } else {
      setVisible(false);
    }
  }, [fcmReady, dismissed]);

  // Timeout de sécurité : masquer après 25s pour ne jamais bloquer l'UI
  useEffect(() => {
    if (!isNativeApp()) return;
    const t = setTimeout(() => setDismissed(true), 25_000);
    return () => clearTimeout(t);
  }, []);

  const label = STATUS_LABELS[fcmStatus] || 'Initialisation notifications…';

  if (!visible || !label) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: 'rgba(30, 107, 255, 0.95)',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        backdropFilter: 'blur(8px)',
        paddingTop: 'max(10px, env(safe-area-inset-top))',
      }}
    >
      {/* Spinner */}
      <div style={{
        width: '16px', height: '16px',
        border: '2px solid rgba(255,255,255,0.3)',
        borderTopColor: 'white',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
        flexShrink: 0,
      }} />
      <span style={{ color: 'white', fontSize: '13px', fontWeight: '600', flex: 1 }}>
        {label}
      </span>
      {/* Bouton fermer (dismiss manuel) */}
      <button
        onClick={() => setDismissed(true)}
        style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: '18px', cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
      >
        ×
      </button>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}