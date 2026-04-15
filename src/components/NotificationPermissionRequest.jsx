/**
 * NotificationPermissionRequest — Simple et minimaliste
 * Activation notifications navigateur + génération token FCM
 */

import { useState } from 'react';
import { Bell, Settings, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { getFirebaseConfig } from '@/lib/firebaseConfig';

/**
 * Fonction minimaliste : enregistrer SW + générer token FCM
 */
async function generateFcmToken() {
  console.log('[generateFcmToken] START');

  // 1. Charger config depuis backend (source unique)
  console.log('[generateFcmToken] ⏳ Chargement config Firebase...');
  const firebaseConfig = await getFirebaseConfig();
  if (!firebaseConfig) {
    throw new Error('Firebase config non disponible du backend');
  }
  console.log('[generateFcmToken] ✅ Config reçue');

  // 2. Importer Firebase modules
  console.log('[generateFcmToken] ⏳ Import Firebase...');
  const { initializeApp, getApps } = await import('firebase/app');
  const { getMessaging } = await import('firebase/messaging');
  const { getToken } = await import('firebase/messaging');
  console.log('[generateFcmToken] ✅ Firebase importé');

  // 3. Initialiser Firebase app (une seule fois)
  console.log('[generateFcmToken] ⏳ initializeApp...');
  const app =
    getApps().length === 0
      ? initializeApp(firebaseConfig)
      : getApps()[0];
  const messaging = getMessaging(app);
  console.log('[generateFcmToken] ✅ Firebase app initialisé');

  // 4. Enregistrer Service Worker
  console.log('[generateFcmToken] ⏳ Nettoyage anciens SW...');
  const allRegs = await navigator.serviceWorker.getRegistrations();
  for (const reg of allRegs) {
    console.log('[generateFcmToken] 🗑️ Unregister:', reg.scope);
    await reg.unregister();
  }
  console.log('[generateFcmToken] ⏳ Enregistrement nouveau SW...');
  const swReg = await navigator.serviceWorker.register(
    '/firebase-messaging-sw.js',
    { scope: '/' }
  );
  console.log('[generateFcmToken] ✅ SW enregistré:', swReg.scope);

  await navigator.serviceWorker.ready;
  console.log('[generateFcmToken] ✅ SW ready');

  // 5. Générer token FCM
  console.log('[generateFcmToken] ⏳ Génération token FCM...');
  const token = await getToken(messaging, {
    vapidKey: firebaseConfig.vapidKey,
    serviceWorkerRegistration: swReg,
  });

  if (!token) {
    throw new Error('Token FCM vide');
  }

  console.log('[generateFcmToken] ✅ Token généré:', token.substring(0, 50) + '...');
  return token;
}

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

  // Flux Web : permission + token FCM
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

      // Générer token
      console.log('[NotificationPermissionRequest] ⏳ Génération token...');
      const token = await generateFcmToken();

      // Sauvegarder token
      const { base44 } = await import('@/api/base44Client');
      await base44.functions.invoke('saveFcmToken', { token });

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

      // Enregistrer et attendre token
      await PushNotifications.register();
      const token = await new Promise((resolve) => {
        PushNotifications.addListener('registration', (t) =>
          resolve(t.value)
        );
        setTimeout(() => resolve(null), 8000);
      });

      if (!token) {
        throw new Error('Token natif non reçu');
      }

      // Sauvegarder
      const { base44 } = await import('@/api/base44Client');
      await base44.functions.invoke('saveFcmToken', { token });

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