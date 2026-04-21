import { useState, useEffect } from "react";
import NotificationPermissionRequest from "./NotificationPermissionRequest";

/**
 * Bannière intelligente : affiche une bannière de notifications si la permission n'est pas accordée
 * À utiliser en haut des pages critiques (Home client, Home livreur, Admin, etc.)
 */
export default function NotificationPermissionBanner({ showAlways = false }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { isNativeApp, getPermissionStatus } = await import('@/lib/nativePush');
      if (isNativeApp()) {
        const perm = await getPermissionStatus();
        if (cancelled) return;
        setShow(showAlways || perm !== 'granted');
        return;
      }
      // Web : API Notification du navigateur (pas fiable sur WebView APK → branche native ci-dessus)
      if (typeof Notification !== 'undefined' && (showAlways || Notification.permission !== 'granted')) {
        setShow(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showAlways]);

  if (!show) return null;

  return (
    <div className="mb-4">
      <NotificationPermissionRequest 
        variant="banner"
        onSuccess={() => setShow(false)}
      />
    </div>
  );
}