/**
 * NotificationPermissionBanner
 * Affiché quand l'utilisateur n'a pas accordé la permission notifications.
 * Propose d'activer ou d'ouvrir les paramètres.
 */
import { useState, useEffect } from "react";
import { Bell, BellOff, X, Settings } from "lucide-react";
import { isNativeApp } from "@/lib/nativePush";

export default function NotificationPermissionBanner() {
  const [show, setShow] = useState(false);
  const [isDenied, setIsDenied] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Ne pas afficher si déjà dismissé cette session
    if (sessionStorage.getItem('cdl_notif_banner_dismissed')) return;

    const check = async () => {
      if (isNativeApp()) {
        // L'APK gère ça via initCapacitorPush → onPermissionDenied
        return;
      }
      if (!('Notification' in window)) return;
      if (Notification.permission === 'granted') return;
      if (Notification.permission === 'denied') {
        setIsDenied(true);
        setShow(true);
      } else {
        // 'default' → afficher le bandeau après 3s
        setTimeout(() => setShow(true), 3000);
      }
    };
    check();
  }, []);

  const handleEnable = async () => {
    if (!('Notification' in window)) return;
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      setShow(false);
      // Re-enregistrer le token FCM
      try {
        const mod = await import('@/lib/pushNotifications');
        const token = await mod.registerFcmToken();
        if (token) {
          const { base44 } = await import('@/api/base44Client');
          base44.functions.invoke('saveFcmToken', { token }).catch(() => {});
        }
      } catch (_) {}
    } else {
      setIsDenied(true);
    }
  };

  const handleDismiss = () => {
    setShow(false);
    setDismissed(true);
    sessionStorage.setItem('cdl_notif_banner_dismissed', '1');
  };

  const handleOpenSettings = () => {
    // Sur mobile, on peut essayer d'ouvrir les paramètres app via Capacitor
    if (isNativeApp()) {
      try {
        // Tenter d'ouvrir les paramètres natifs
        if (window.Capacitor?.Plugins?.App) {
          // Pas d'API directe dans App plugin pour les settings notif
          // Afficher un message explicatif
        }
      } catch (_) {}
    }
    // Web : expliquer comment activer
    handleDismiss();
  };

  if (!show || dismissed) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] mx-auto max-w-lg">
      <div className={`flex items-center gap-3 px-4 py-3 shadow-lg ${
        isDenied
          ? 'bg-red-600 text-white'
          : 'bg-amber-500 text-white'
      }`}>
        {isDenied
          ? <BellOff className="h-4 w-4 flex-shrink-0" />
          : <Bell className="h-4 w-4 flex-shrink-0 animate-pulse" />
        }
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold leading-tight">
            {isDenied
              ? 'Notifications désactivées'
              : '🔔 Activez les notifications CDL'
            }
          </p>
          <p className="text-[10px] opacity-90 leading-tight">
            {isDenied
              ? 'Ouvrez les paramètres de votre téléphone pour les réactiver'
              : 'Recevez vos courses, messages et alertes en temps réel'
            }
          </p>
        </div>
        {isDenied ? (
          <button
            onClick={handleOpenSettings}
            className="flex-shrink-0 flex items-center gap-1 bg-white/20 px-2 py-1.5 rounded-lg text-[10px] font-bold"
          >
            <Settings className="h-3 w-3" />
            Paramètres
          </button>
        ) : (
          <button
            onClick={handleEnable}
            className="flex-shrink-0 bg-white text-amber-600 px-3 py-1.5 rounded-lg text-[10px] font-black"
          >
            Activer
          </button>
        )}
        <button onClick={handleDismiss} className="flex-shrink-0 p-1 opacity-80 hover:opacity-100">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}