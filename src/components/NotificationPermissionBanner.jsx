import { useState, useEffect } from "react";
import NotificationPermissionRequest from "./NotificationPermissionRequest";

/**
 * Bannière intelligente : affiche une bannière de notifications si la permission n'est pas accordée
 * À utiliser en haut des pages critiques (Home client, Home livreur, Admin, etc.)
 */
export default function NotificationPermissionBanner({ showAlways = false }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Afficher seulement si permission !== granted (et si API Notification existe)
    if (typeof Notification !== 'undefined' && (showAlways || Notification.permission !== 'granted')) {
      setShow(true);
    }
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