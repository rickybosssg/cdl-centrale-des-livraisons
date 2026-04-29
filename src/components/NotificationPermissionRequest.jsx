/**
 * NotificationPermissionRequest
 *
 * Gestion complète des permissions notifications :
 * - Message explicatif AVANT la demande (une seule fois via localStorage)
 * - Si bloqué définitivement → bouton "Ouvrir les paramètres" (pas juste du texte)
 * - Si refusé → rappel doux, sans redemander en boucle
 */

import { useState, useEffect } from 'react';
import { Bell, Settings, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';

const LS_ASKED    = 'cdl_notif_asked';    // permission demandée au moins une fois
const LS_DENIED   = 'cdl_notif_denied';   // utilisateur a explicitement refusé
const LS_REMIND   = 'cdl_notif_remind';   // rappel doux déjà affiché

export default function NotificationPermissionRequest({ onSuccess, onDismiss, variant = 'banner' }) {
  const [step, setStep] = useState(null);
  // step: null | 'explain' | 'denied_soft' | 'blocked'

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { isNativeApp, getPermissionStatus } = await import('@/lib/nativePush');

      let perm;
      if (isNativeApp()) {
        perm = await getPermissionStatus();
      } else {
        perm = typeof Notification !== 'undefined' ? Notification.permission : 'default';
      }

      if (cancelled) return;

      if (perm === 'granted') {
        onSuccess?.();
        return;
      }

      // Bloqué définitivement (denied sur Android = refus permanent)
      if (perm === 'denied') {
        setStep('blocked');
        return;
      }

      // Pas encore demandé → afficher le message explicatif
      const alreadyAsked = localStorage.getItem(LS_ASKED);
      if (!alreadyAsked) {
        setStep('explain');
        return;
      }

      // Déjà demandé et refusé → rappel doux (une seule fois)
      const wasDenied = localStorage.getItem(LS_DENIED);
      const remindShown = localStorage.getItem(LS_REMIND);
      if (wasDenied && !remindShown) {
        setStep('denied_soft');
        return;
      }

      // Sinon ne rien afficher
    })();
    return () => { cancelled = true; };
  }, []);

  const handleAllow = async () => {
    localStorage.setItem(LS_ASKED, '1');
    try {
      const { isNativeApp, requestNativePushToken } = await import('@/lib/nativePush');

      if (isNativeApp()) {
        const token = await requestNativePushToken();
        if (token) {
          try {
            await base44.functions.invoke('saveFcmToken', { token, deviceType: 'android_native' });
          } catch (_) {}
          onSuccess?.();
          setStep(null);
        } else {
          // L'utilisateur a refusé
          localStorage.setItem(LS_DENIED, '1');
          setStep('denied_soft');
        }
        return;
      }

      // Web push
      const { requestWebPushToken } = await import('@/lib/webPush');
      const { token, permission: perm } = await requestWebPushToken();
      if (perm === 'granted' && token) {
        try {
          const me = await base44.auth.me();
          await base44.functions.invoke('saveFcmToken', { token, userId: me?.id, userEmail: me?.email });
        } catch (_) {}
        onSuccess?.();
        setStep(null);
      } else if (perm === 'denied') {
        localStorage.setItem(LS_DENIED, '1');
        setStep('blocked');
      } else {
        localStorage.setItem(LS_DENIED, '1');
        setStep('denied_soft');
      }
    } catch (err) {
      console.error('[NotifPermission]', err);
    }
  };

  const handleOpenSettings = async () => {
    try {
      const { isNativeApp, openAppSettings } = await import('@/lib/nativePush');
      if (isNativeApp()) {
        await openAppSettings();
      } else {
        alert('Ouvrez les paramètres de votre navigateur pour activer les notifications.');
      }
    } catch (_) {}
  };

  const handleDismiss = () => {
    if (step === 'denied_soft') localStorage.setItem(LS_REMIND, '1');
    setStep(null);
    onDismiss?.();
  };

  if (!step) return null;

  // ── Rendu selon le step ────────────────────────────────────────

  if (step === 'explain') {
    return (
      <BannerWrapper onClose={handleDismiss}>
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm text-foreground">Activer les notifications</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              CDL a besoin des notifications pour vous informer des courses, validations, messages et livraisons.
            </p>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <Button size="sm" variant="ghost" className="text-muted-foreground text-xs" onClick={handleDismiss}>
            Plus tard
          </Button>
          <Button size="sm" className="flex-1 bg-primary text-white" onClick={handleAllow}>
            <Bell className="h-3.5 w-3.5 mr-1.5" />
            Activer
          </Button>
        </div>
      </BannerWrapper>
    );
  }

  if (step === 'blocked') {
    return (
      <BannerWrapper onClose={handleDismiss}>
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <Bell className="h-5 w-5 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm text-foreground">Notifications bloquées</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              Activez-les dans les paramètres de l'application pour ne rater aucune course ou livraison.
            </p>
          </div>
        </div>
        <Button size="sm" className="w-full mt-3 bg-amber-600 hover:bg-amber-700 text-white" onClick={handleOpenSettings}>
          <Settings className="h-3.5 w-3.5 mr-1.5" />
          Activer les notifications
        </Button>
      </BannerWrapper>
    );
  }

  if (step === 'denied_soft') {
    return (
      <BannerWrapper onClose={handleDismiss}>
        <div className="flex items-start gap-3">
          <Bell className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-foreground">Notifications désactivées</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Vous pouvez les activer à tout moment depuis les paramètres.
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" className="w-full mt-2 text-xs" onClick={handleOpenSettings}>
          <Settings className="h-3.5 w-3.5 mr-1.5" />
          Ouvrir les paramètres
        </Button>
      </BannerWrapper>
    );
  }

  return null;
}

function BannerWrapper({ children, onClose }) {
  return (
    <div className="relative bg-white border border-border rounded-2xl p-4 shadow-sm">
      <button
        onClick={onClose}
        className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
        aria-label="Fermer"
      >
        <X className="h-4 w-4" />
      </button>
      {children}
    </div>
  );
}