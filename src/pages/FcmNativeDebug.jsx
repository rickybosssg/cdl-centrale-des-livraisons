/**
 * FcmNativeDebug — Diagnostic FCM Android natif complet
 * 
 * Affiche EXACTEMENT où la chaîne casse si /system-health est vert mais push échoue.
 */

import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { PushNotifications } from '@capacitor/push-notifications';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { isNativeApp, getPermissionStatus } from '@/lib/nativePush';

export default function FcmNativeDebug() {
  const [user, setUser] = useState(null);
  const [nativeStatus, setNativeStatus] = useState('checking');
  const [permissionStatus, setPermissionStatus] = useState(null);
  const [registerCalled, setRegisterCalled] = useState(false);
  const [registrationEventReceived, setRegistrationEventReceived] = useState(false);
  const [nativeToken, setNativeToken] = useState(null);
  const [bddToken, setBddToken] = useState(null);
  const [lastError, setLastError] = useState(null);
  const [lastMessageId, setLastMessageId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);

  const addLog = (msg) => {
    setLogs(prev => [...prev, { msg, time: new Date().toLocaleTimeString() }].slice(-20));
  };

  useEffect(() => {
    const init = async () => {
      try {
        const me = await base44.auth.me();
        setUser(me);

        // 1. Vérifier si native
        const native = isNativeApp();
        addLog(`isNativeApp() = ${native}`);
        setNativeStatus(native ? 'native' : 'web');

        if (!native) {
          setLoading(false);
          return;
        }

        // 2. Vérifier permission
        const perm = await getPermissionStatus();
        addLog(`Permission status = ${perm}`);
        setPermissionStatus(perm);

        // 3. Vérifier si registration event été attaché
        let regEventReceived = false;
        const listener = await PushNotifications.addListener('registration', (token) => {
          addLog(`✅ registration event reçu: ${token.value?.slice(0, 30)}...`);
          setRegistrationEventReceived(true);
          setNativeToken(token.value);
          regEventReceived = true;
        });

        addLog('Listener registration attaché');

        // 4. Appeler register() et attendre 10s
        addLog('PushNotifications.register() appelé...');
        setRegisterCalled(true);
        await PushNotifications.register();

        // Timeout : si event pas reçu après 10s
        await new Promise(resolve => setTimeout(resolve, 10000));
        if (!regEventReceived) {
          addLog('⚠️ Timeout 10s — registration event JAMAIS reçu');
        }

        // 5. Vérifier BDD
        if (me?.email) {
          const tokens = await base44.entities.FcmToken.filter({ user_email: me.email }, '-updated_date', 1);
          if (tokens?.length > 0) {
            addLog(`✅ BDD token trouvé: ${tokens[0].token?.slice(0, 30)}...`);
            setBddToken(tokens[0].token);
          } else {
            addLog('⚠️ BDD — aucun token trouvé');
          }
        }

        // 6. Listener errors
        const errListener = await PushNotifications.addListener('registrationError', (err) => {
          addLog(`❌ registrationError: ${JSON.stringify(err)}`);
          setLastError(JSON.stringify(err));
        });

        // Cleanup
        return () => {
          listener.remove().catch(() => {});
          errListener.remove().catch(() => {});
        };
      } catch (e) {
        addLog(`❌ Error: ${e.message}`);
        setLastError(e.message);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  const handleSendTestPush = async () => {
    if (!user?.email) {
      addLog('❌ User not authenticated');
      return;
    }
    try {
      addLog('📤 Envoi test push...');
      const res = await base44.functions.invoke('sendCdlNotification', {
        user_email: user.email,
        title: '🧪 Test Native FCM',
        body: 'Test depuis FcmNativeDebug',
        data: { type: 'test_native_debug', entity_id: 'test' },
      });
      addLog(`✅ Push lancé: ${res?.data?.firebase_message_id || 'no msgId'}`);
      setLastMessageId(res?.data?.firebase_message_id);
    } catch (e) {
      addLog(`❌ Push failed: ${e.message}`);
    }
  };

  const handleForceRegister = async () => {
    try {
      addLog('🔄 Force register...');
      setRegisterCalled(false);
      setRegistrationEventReceived(false);
      setNativeToken(null);
      
      const listener = await PushNotifications.addListener('registration', (token) => {
        addLog(`✅ registration event (force): ${token.value?.slice(0, 30)}...`);
        setRegistrationEventReceived(true);
        setNativeToken(token.value);
      });

      await PushNotifications.register();
      setRegisterCalled(true);
      addLog('register() appelé');

      await new Promise(resolve => setTimeout(resolve, 5000));
      listener.remove().catch(() => {});
    } catch (e) {
      addLog(`❌ Force register error: ${e.message}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4" />
          <p>Vérification FCM natif...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">🔍 FCM Native Debug</h1>
          <p className="text-muted-foreground">Diagnostic complet du flux Capacitor PushNotifications</p>
        </div>

        {/* Statut global */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Statut Global</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Contexte</p>
                <p className="font-semibold">
                  {nativeStatus === 'native' ? '📱 APK Native Android' : '🌐 Web/PWA'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Utilisateur</p>
                <p className="font-semibold">{user?.email || 'Non authentifié'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Permission */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Permission Android</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">POST_NOTIFICATIONS</p>
              <p className="font-semibold text-lg">
                {permissionStatus === 'granted' && '✅ Accordée'}
                {permissionStatus === 'denied' && '❌ Refusée définitivement'}
                {permissionStatus === 'prompt' && '⚠️ En attente'}
                {!permissionStatus && '❓ Inconnu'}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Registration */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Registration Event</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">register() appelé</p>
                <p className="font-semibold">
                  {registerCalled ? '✅ Oui' : '❌ Non'}
                </p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">registration event reçu</p>
                <p className="font-semibold">
                  {registrationEventReceived ? '✅ Oui' : '❌ Non'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Token natif */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Token Natif</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {nativeToken ? (
              <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                <p className="text-sm text-muted-foreground mb-2">Token complet masqué</p>
                <p className="font-mono text-sm break-all">{nativeToken.slice(0, 40)}...{nativeToken.slice(-20)}</p>
              </div>
            ) : (
              <div className="p-4 bg-red-50 dark:bg-red-950 rounded-lg border border-red-200 dark:border-red-800">
                <p className="font-semibold text-red-700 dark:text-red-300">❌ Token JAMAIS reçu</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Token BDD */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Token en BDD</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {bddToken ? (
              <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                <p className="text-sm text-muted-foreground mb-2">Token sauvegardé</p>
                <p className="font-mono text-sm break-all">{bddToken.slice(0, 40)}...{bddToken.slice(-20)}</p>
              </div>
            ) : (
              <div className="p-4 bg-yellow-50 dark:bg-yellow-950 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <p className="font-semibold text-yellow-700 dark:text-yellow-300">⚠️ Aucun token en BDD</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Derniers événements */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Derniers événements</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-48 overflow-y-auto font-mono text-xs">
              {logs.length === 0 ? (
                <p className="text-muted-foreground">Aucun log</p>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="text-muted-foreground">
                    <span className="text-muted-foreground/60">{log.time}</span> {log.msg}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-4">
          <Button onClick={handleForceRegister} variant="outline">
            🔄 Force Register
          </Button>
          <Button onClick={handleSendTestPush} variant="default">
            📤 Send Test Push
          </Button>
        </div>

        {/* Diagnostic summary */}
        <Card className="border-2">
          <CardHeader>
            <CardTitle className="text-lg">📋 Diagnostic Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {nativeStatus === 'web' && (
              <p className="text-muted-foreground">Non-native (web) — FCM natif N/A</p>
            )}
            {nativeStatus === 'native' && (
              <>
                {permissionStatus === 'granted' ? (
                  <p className="text-green-700 dark:text-green-300">✅ Permission granted</p>
                ) : (
                  <p className="text-red-700 dark:text-red-300">❌ Permission issue: {permissionStatus}</p>
                )}
                {registerCalled && registrationEventReceived && nativeToken ? (
                  <p className="text-green-700 dark:text-green-300">✅ Native token reçu</p>
                ) : (
                  <p className="text-red-700 dark:text-red-300">❌ registration event jamais déclenché</p>
                )}
                {bddToken ? (
                  <p className="text-green-700 dark:text-green-300">✅ Token sauvegardé en BDD</p>
                ) : (
                  <p className="text-red-700 dark:text-red-300">❌ Token manquant en BDD</p>
                )}
                {lastError && (
                  <p className="text-red-700 dark:text-red-300">❌ Erreur: {lastError}</p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}