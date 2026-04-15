import { useState } from "react";
import { Bell, Settings, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { getFirebaseConfig } from "@/lib/firebaseConfig";

async function getFcmToken() {
  console.log('[getFcmToken] START');
  
  const { getToken } = await import('firebase/messaging');
  const { initializeApp, getApps } = await import('firebase/app');
  const { getMessaging } = await import('firebase/messaging');
  
  // 1️⃣ Charger la config depuis le backend
  console.log('[getFcmToken] ⏳ Appel getFirebaseConfig()');
  const firebaseConfig = await getFirebaseConfig();
  console.log('[getFcmToken] ✅ Config reçue:', {
    apiKey: firebaseConfig?.apiKey ? '✅' : '❌',
    messagingSenderId: firebaseConfig?.messagingSenderId ? '✅' : '❌',
    appId: firebaseConfig?.appId ? '✅' : '❌',
    vapidKey: firebaseConfig?.vapidKey ? '✅' : '❌',
  });
  
  // 2️⃣ Valider complétude
  if (!firebaseConfig || !firebaseConfig.apiKey) {
    throw new Error('Firebase config incomplete: missing apiKey');
  }
  if (!firebaseConfig.messagingSenderId) {
    throw new Error('Firebase config incomplete: missing messagingSenderId');
  }
  if (!firebaseConfig.appId) {
    throw new Error('Firebase config incomplete: missing appId');
  }
  if (!firebaseConfig.vapidKey) {
    throw new Error('Firebase config incomplete: missing vapidKey');
  }
  console.log('[getFcmToken] ✅ Config valide');

  // 3️⃣ Initialiser Firebase
  console.log('[getFcmToken] ⏳ initializeApp()');
  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  const messaging = getMessaging(app);
  console.log('[getFcmToken] ✅ Firebase initialisé');
  
  // 4️⃣ Enregistrer le SW
  console.log('[getFcmToken] ⏳ register SW');
  const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  console.log('[getFcmToken] ✅ SW enregistré:', reg.scope);
  
  await navigator.serviceWorker.ready;
  console.log('[getFcmToken] ✅ SW ready');
  
  // 5️⃣ Envoyer config au SW via postMessage
  const controller = navigator.serviceWorker.controller;
  if (controller) {
    console.log('[getFcmToken] ⏳ postMessage FIREBASE_CONFIG au SW');
    console.log('[getFcmToken] Config being sent:', {
      apiKey: firebaseConfig.apiKey ? firebaseConfig.apiKey.substring(0, 8) + '...' : '❌',
      messagingSenderId: firebaseConfig.messagingSenderId ? firebaseConfig.messagingSenderId.substring(0, 8) + '...' : '❌',
      appId: firebaseConfig.appId ? firebaseConfig.appId.substring(0, 8) + '...' : '❌',
      vapidKey: firebaseConfig.vapidKey ? firebaseConfig.vapidKey.substring(0, 8) + '...' : '❌',
    });
    controller.postMessage({
      type: 'FIREBASE_CONFIG',
      config: firebaseConfig,
    });
    await new Promise(r => setTimeout(r, 500));
    console.log('[getFcmToken] ✅ postMessage envoyé et traité');
  } else {
    console.warn('[getFcmToken] ⚠️ SW controller non disponible');
  }
  
  // 6️⃣ Générer le token
  console.log('[getFcmToken] ⏳ getToken()');
  const token = await getToken(messaging, { 
    vapidKey: firebaseConfig.vapidKey, 
    serviceWorkerRegistration: reg 
  });
  console.log('[getFcmToken] ✅ Token généré:', token.substring(0, 50) + '...');
  
  return token;
}

export default function NotificationPermissionRequest({ onSuccess, variant = "card" }) {
   const [requesting, setRequesting] = useState(false);
   const [permission, setPermission] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'default');

  const isNative = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.();

  const requestPermissionWeb = async () => {
    setRequesting(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm === 'granted') {
        // Générer et enregistrer le token FCM
        let tokenGenerated = false;
        try {
          const token = await getFcmToken();
          if (token) {
            const { base44 } = await import('@/api/base44Client');
            await base44.functions.invoke('saveFcmToken', { token });
            tokenGenerated = true;
            toast.success("✅ Notifications activées avec succès !");
          }
        } catch (e) {
          console.error('FCM Token error:', e);
          toast.error(`❌ Erreur token FCM: ${e.message}`);
        }
        if (tokenGenerated) onSuccess?.();
      } else if (perm === 'denied') {
        toast.error("❌ Les notifications ont été refusées. Ouvrez les paramètres pour les autoriser.");
      }
    } catch (e) {
      toast.error("Erreur: " + e.message);
    }
    setRequesting(false);
  };

  const requestPermissionNative = async () => {
    setRequesting(true);
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      
      // Créer le canal
      await PushNotifications.createChannel({
        id: 'default',
        name: 'CDL Notifications',
        description: 'Toutes les notifications CDL',
        importance: 5,
        sound: 'default',
        vibration: true,
        lights: true,
        lightColor: '#1a73e8',
      }).catch(() => {});

      // Demander permission
      const perm = await PushNotifications.requestPermissions();
      
      if (perm.receive === 'granted') {
        // Enregistrer pour obtenir le token
        await PushNotifications.register();
        
        // Attendre le token
        const token = await new Promise((resolve) => {
          PushNotifications.addListener('registration', (t) => resolve(t.value));
          setTimeout(() => resolve(null), 8000);
        });

        if (token) {
          const { base44 } = await import('@/api/base44Client');
          await base44.functions.invoke('saveFcmToken', { token });
          toast.success("✅ Notifications activées avec succès !");
          onSuccess?.();
        }
      } else {
        toast.error("Les notifications ont été refusées. Ouvrez les paramètres pour les autoriser.");
      }
    } catch (e) {
      toast.error("Erreur: " + e.message);
    }
    setRequesting(false);
  };

  const openSettingsWeb = () => {
    toast.info("📱 Guide d'activation :\n1. Cliquez sur le cadenas dans la barre d'adresse\n2. Notifications → Autoriser\n3. Recharger la page\n4. Cliquez à nouveau sur 'Activer les notifications'", { duration: 8000 });
  };

  const openSettingsNative = async () => {
    // Pour APK natif, afficher simplement le guide car on peut pas ouvrir les paramètres directement
    toast.info("📱 Allez à : Paramètres → Apps → CDL → Notifications");
  };

  if (permission === 'granted') return null;

  if (variant === "banner") {
    // Bannière simple pour pages critiques
    return (
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-l-4 border-amber-500 p-4 rounded-r-lg space-y-2">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-sm text-amber-900">Activez les notifications</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Recevez les nouvelles courses, messages et alertes en temps réel.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          className="w-full bg-amber-600 hover:bg-amber-700 text-white"
          onClick={isNative ? requestPermissionNative : requestPermissionWeb}
          disabled={requesting}
        >
          <Bell className="h-3.5 w-3.5 mr-1.5" />
          {requesting ? "Activation..." : "Activer maintenant"}
        </Button>
      </div>
    );
  }

  if (variant === "card") {
    // Carte pour pages diagnostiques
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <Bell className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm text-amber-900">🔔 Activer les notifications</p>
              <p className="text-xs text-amber-700 mt-1">
                Sans notifications, CDL ne peut pas vous envoyer les nouvelles courses, messages, alertes et validations.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
              onClick={isNative ? requestPermissionNative : requestPermissionWeb}
              disabled={requesting}
            >
              <Bell className="h-3.5 w-3.5 mr-1.5" />
              {requesting ? "Activation..." : "Activer"}
            </Button>
            {permission === 'denied' && (
              <Button
                size="sm"
                variant="outline"
                className="flex-1 border-amber-300"
                onClick={isNative ? openSettingsNative : openSettingsWeb}
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

  if (variant === "button") {
    // Bouton simple
    return (
      <Button
        size="sm"
        className="bg-primary hover:bg-primary/90 gap-2"
        onClick={isNative ? requestPermissionNative : requestPermissionWeb}
        disabled={requesting}
      >
        <Bell className="h-4 w-4" />
        {requesting ? "Activation..." : "Activer les notifications"}
      </Button>
    );
  }

  return null;
}