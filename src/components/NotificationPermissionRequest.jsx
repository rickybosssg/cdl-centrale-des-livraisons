/**
 * NotificationPermissionRequest — Simple et minimaliste
 * Activation notifications navigateur + génération token FCM
 */

import { useState } from 'react';
import { Bell, Settings, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';

export default function NotificationPermissionRequest({
  onSuccess,
  variant = 'card',
}) {
  const [requesting, setRequesting] = useState(false);
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );

  const isNative =
    typeof window !== 'undefined' &&
    window.Capacitor?.isNativePlatform?.();

  // Flux Web : permission uniquement (pas de token pour le moment)
  const handleRequestWeb = async () => {
    setRequesting(true);
    try {
      console.log('[NotificationPermissionRequest] ⏳ Demande permission...');
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== 'granted') {
        toast.error('❌ Notifications refusées');
        setRequesting(false);
        return;
      }

      console.log('[NotificationPermissionRequest] ✅ Permission accordée');
      toast.success('✅ Notifications activées !');
      onSuccess?.();
    } catch (err) {
      console.error('[NotificationPermissionRequest] ❌', err);
      toast.error(`Erreur: ${err.message}`);
    } finally {
      setRequesting(false);
    }
  };

  // Flux Natif (Capacitor)
  const handleRequestNative = async () => {
    setRequesting(true);
    try {
      const { PushNotifications } = await import(
        '@capacitor/push-notifications'
      );

      // Créer canal Android
      await PushNotifications.createChannel({
        id: 'default',
        name: 'CDL Notifications',
        description: 'Notifications CDL',
        importance: 5,
        sound: 'default',
        vibration: true,
      }).catch(() => {});

      // Demander permission
      const perm = await PushNotifications.requestPermissions();
      if (perm.receive !== 'granted') {
        toast.error('❌ Notifications refusées');
        setRequesting(false);
        return;
      }

      // Enregistrer (sans générer token pour le moment)
      await PushNotifications.register();

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

  const handleRequest = isNative ? handleRequestNative : handleRequestWeb;

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
                CDL vous envoie les courses, messages et alertes en temps
                réel.
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
                  toast.info(
                    isNative
                      ? '📱 Paramètres → Apps → CDL → Notifications'
                      : '📱 Cliquez le cadenas dans la barre → Notifications → Autoriser'
                  )
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