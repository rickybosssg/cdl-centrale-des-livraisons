/**
 * NotificationPermissionRequest — Utilise FCM Web Push
 * Fonctionne dans : Chrome, WebView Android (APK Base44), Safari iOS
 */

import { useState, useEffect } from 'react';
import { Bell, Settings, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

export default function NotificationPermissionRequest({
  onSuccess,
  variant = 'card',
}) {
  const [requesting, setRequesting] = useState(false);
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );

  // Sur APK, la permission Web Notification ≠ permission push native Capacitor
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { isNativeApp, getPermissionStatus } = await import('@/lib/nativePush');
      if (!isNativeApp() || cancelled) return;
      const p = await getPermissionStatus();
      if (cancelled) return;
      if (p === 'granted') setPermission('granted');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRequest = async () => {
    setRequesting(true);
    try {
      const { isNativeApp, requestNativePushToken } = await import('@/lib/nativePush');

      if (isNativeApp()) {
        const token = await requestNativePushToken();
        const perm = token ? 'granted' : 'denied';
        setPermission(perm);

        if (!token) {
          toast.error('❌ Notifications refusées ou indisponibles');
          return;
        }

        try {
          await base44.functions.invoke('saveFcmToken', {
            token,
            deviceType: 'android_native',
          });
        } catch (_) {}

        toast.success('✅ Notifications activées !');
        onSuccess?.();
        return;
      }

      const { requestWebPushToken } = await import('@/lib/webPush');
      const { token, permission: perm, error } = await requestWebPushToken();

      setPermission(perm === 'granted' ? 'granted' : perm || 'denied');

      if (perm !== 'granted' || !token) {
        toast.error('❌ Notifications refusées ou indisponibles');
        return;
      }

      // Sauvegarder le token
      try {
        const me = await base44.auth.me();
        await base44.functions.invoke('saveFcmToken', {
          token,
          userId: me?.id,
          userEmail: me?.email,
          userRole: me?.role,
        });
      } catch (_) {}

      toast.success('✅ Notifications activées !');
      onSuccess?.();
    } catch (err) {
      console.error('[NotificationPermissionRequest] ❌', err);
      toast.error(`Erreur: ${err.message}`);
    } finally {
      setRequesting(false);
    }
  };

  if (permission === 'granted') return null;

  if (variant === 'banner') {
    return (
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-l-4 border-amber-500 p-4 rounded-r-lg space-y-2">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-sm text-amber-900">
              Activez les notifications
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Recevez les courses, messages et alertes en temps réel.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          className="w-full bg-amber-600 hover:bg-amber-700 text-white"
          onClick={handleRequest}
          disabled={requesting}
        >
          <Bell className="h-3.5 w-3.5 mr-1.5" />
          {requesting ? 'Activation...' : 'Activer maintenant'}
        </Button>
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <Bell className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm text-amber-900">
                🔔 Activer les notifications
              </p>
              <p className="text-xs text-amber-700 mt-1">
                CDL vous envoie les courses, messages et alertes en temps réel.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
              onClick={handleRequest}
              disabled={requesting}
            >
              <Bell className="h-3.5 w-3.5 mr-1.5" />
              {requesting ? 'Activation...' : 'Activer'}
            </Button>
            {permission === 'denied' && (
              <Button
                size="sm"
                variant="outline"
                className="flex-1 border-amber-300"
                onClick={() =>
                  toast.info('📱 Paramètres → Apps → CDL → Notifications')
                }
              >
                <Settings className="h-3.5 w-3.5 mr-1.5" />
                Paramètres
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (variant === 'button') {
    return (
      <Button
        size="sm"
        className="bg-primary hover:bg-primary/90 gap-2"
        onClick={handleRequest}
        disabled={requesting}
      >
        <Bell className="h-4 w-4" />
        {requesting ? 'Activation...' : 'Activer les notifications'}
      </Button>
    );
  }

  return null;
}