/**
 * FcmDiagnostic — Page de diagnostic notifications push
 * Affiche le token FCM de l'utilisateur, état de la chaîne, et test d'envoi.
 */
import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, RefreshCw, Copy, CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

function StatusRow({ label, status, detail }) {
  const icon = status === 'ok'
    ? <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
    : status === 'error'
      ? <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
      : status === 'loading'
        ? <Loader2 className="h-4 w-4 text-blue-500 flex-shrink-0 animate-spin" />
        : <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />;

  return (
    <div className="flex items-start gap-3 py-2 border-b last:border-0">
      {icon}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {detail && <p className="text-xs text-muted-foreground mt-0.5 break-all">{detail}</p>}
      </div>
    </div>
  );
}

export default function FcmDiagnostic() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [fcmTokens, setFcmTokens] = useState([]);
  const [chain, setChain] = useState({
    user: 'loading',
    permission: 'pending',
    token: 'pending',
    db: 'pending',
  });
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [isNative, setIsNative] = useState(false);

  const detectMode = () => {
    if (typeof window === 'undefined') return false;
    if (window.location?.protocol === 'capacitor:') return true;
    if (typeof window.Capacitor !== 'undefined') return true;
    return false;
  };

  const load = async () => {
    setIsNative(detectMode());
    setChain({ user: 'loading', permission: 'pending', token: 'pending', db: 'pending' });
    setFcmTokens([]);
    setSendResult(null);

    // Étape 1 : User
    let me;
    try {
      me = await base44.auth.me();
      setUser(me);
      setChain(c => ({ ...c, user: 'ok' }));
    } catch {
      setChain(c => ({ ...c, user: 'error' }));
      return;
    }

    // Étape 2 : Permission
    const native = detectMode();
    if (native) {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        const perm = await PushNotifications.checkPermissions();
        setChain(c => ({ ...c, permission: perm.receive === 'granted' ? 'ok' : 'error' }));
      } catch {
        setChain(c => ({ ...c, permission: 'error' }));
      }
    } else {
      const perm = 'Notification' in window ? Notification.permission : 'unavailable';
      setChain(c => ({ ...c, permission: perm === 'granted' ? 'ok' : perm === 'default' ? 'warn' : 'error' }));
    }

    // Étape 3+4 : Token en BDD
    try {
      const tokens = await base44.entities.FcmToken.filter(
        { user_email: me.email, is_active: true },
        '-registered_at',
        5
      );
      setFcmTokens(tokens);
      setChain(c => ({
        ...c,
        token: tokens.length > 0 ? 'ok' : 'error',
        db: tokens.length > 0 ? 'ok' : 'error',
      }));
    } catch {
      setChain(c => ({ ...c, token: 'error', db: 'error' }));
    }
  };

  useEffect(() => { load(); }, []);

  const copyToken = (token) => {
    navigator.clipboard?.writeText(token);
    toast.success('Token copié');
  };

  const sendTestToSelf = async () => {
    if (!user?.email) return;
    setSending(true);
    setSendResult(null);
    try {
      const res = await base44.functions.invoke('testNotification', {
        recipient_email: user.email,
        recipient_role: user.role || 'user',
      });
      const d = res.data;
      if (d?.success) {
        setSendResult({ ok: true, msg: `✅ Envoyée ! ${d.details?.sent}/${d.details?.tokens_found} token(s)` });
        toast.success('Notification envoyée — vérifie ton téléphone');
      } else {
        setSendResult({ ok: false, msg: d?.details || d?.message || 'Échec envoi' });
        toast.error('Échec: ' + (d?.details || d?.message));
      }
    } catch (err) {
      setSendResult({ ok: false, msg: err.message });
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  const requestPermissionAndToken = async () => {
    toast.info('Tentative Capacitor Push...');
    try {
      // Toujours essayer Capacitor en premier (APK Base44 + Android Studio)
      const { PushNotifications } = await import('@capacitor/push-notifications');
      
      // Créer le canal Android
      try {
        await PushNotifications.createChannel({
          id: 'default', name: 'CDL Notifications',
          importance: 5, sound: 'default', vibration: true,
        });
      } catch (_) {}

      // Demander la permission
      const perm = await PushNotifications.requestPermissions();
      if (perm.receive !== 'granted') {
        toast.error('Permission refusée par Android');
        return;
      }

      toast.success('Permission accordée — génération token...');

      // Écouter le token
      const listener = await PushNotifications.addListener('registration', async (token) => {
        await listener.remove();
        toast.success('Token reçu ! Sauvegarde...');
        try {
          await base44.functions.invoke('saveFcmToken', { token: token.value, deviceType: 'android_native' });
          toast.success('✅ Token sauvegardé en BDD !');
          load();
        } catch (saveErr) {
          toast.error('Erreur sauvegarde: ' + saveErr.message);
        }
      });

      await PushNotifications.register();
      toast.info('register() appelé — attente du token...');

    } catch (capacitorErr) {
      // Fallback web si Capacitor vraiment pas disponible
      toast.warning('Capacitor non disponible: ' + capacitorErr.message);
      if ('Notification' in window) {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          toast.success('Permission web accordée');
          load();
        } else {
          toast.error('Permission web refusée');
        }
      }
    }
  };

  const mode = isNative ? '📱 Capacitor natif (Android Studio APK)' : '🌐 Web / APK Base44';

  return (
    <div className="space-y-4 pb-20 max-w-lg mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-lg font-bold">🔔 Diagnostic Notifications</h1>
          <p className="text-xs text-muted-foreground">{mode}</p>
        </div>
        <Button variant="ghost" size="icon" className="ml-auto" onClick={load}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Chaîne de notifications */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">État de la chaîne</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <StatusRow
            label="1. Utilisateur connecté"
            status={chain.user}
            detail={user ? `${user.full_name} (${user.email})` : 'Non connecté'}
          />
          <StatusRow
            label="2. Permission notifications"
            status={chain.permission}
            detail={
              chain.permission === 'ok' ? 'Accordée ✅' :
              chain.permission === 'warn' ? 'Non demandée encore' :
              chain.permission === 'error' ? 'Refusée — allez dans Paramètres → Apps → CDL → Notifications' :
              'Vérification...'
            }
          />
          <StatusRow
            label="3. Token FCM généré"
            status={chain.token}
            detail={fcmTokens.length > 0 ? `${fcmTokens.length} token(s) actif(s)` : 'Aucun token en BDD'}
          />
          <StatusRow
            label="4. Token sauvegardé en BDD"
            status={chain.db}
            detail={fcmTokens.length > 0 ? `Dernier: ${fcmTokens[0]?.device_type} — ${new Date(fcmTokens[0]?.registered_at).toLocaleString()}` : 'Aucun'}
          />
        </CardContent>
      </Card>

      {/* Tokens FCM */}
      {fcmTokens.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tokens FCM actifs ({fcmTokens.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 px-4 pb-4">
            {fcmTokens.map((t, i) => (
              <div key={t.id} className="bg-muted rounded-lg p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-primary">
                    {t.device_type === 'android_native' ? '📱 Android Natif' : '🌐 Web'}
                  </span>
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => copyToken(t.token)}>
                    <Copy className="h-3 w-3 mr-1" /> Copier
                  </Button>
                </div>
                <p className="text-xs font-mono text-muted-foreground break-all">
                  {t.token.substring(0, 60)}...
                </p>
                <p className="text-xs text-muted-foreground">
                  Enregistré: {new Date(t.registered_at).toLocaleString()}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-semibold text-amber-900">⚠️ Aucun token FCM en BDD</p>
            <p className="text-xs text-amber-700">
              L'app n'a pas encore enregistré de token pour cet utilisateur.
              {isNative
                ? ' Le token Capacitor doit être généré au lancement.'
                : ' Vérifie que le Service Worker Firebase est enregistré.'}
            </p>
            <Button size="sm" onClick={requestPermissionAndToken} className="w-full">
              🔑 Demander permission + générer token
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Envoi test */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">5. Envoyer une notification de test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-4">
          <p className="text-xs text-muted-foreground">
            Envoie une notification push à <strong>{user?.email}</strong> sur tous ses appareils enregistrés.
          </p>
          <Button
            onClick={sendTestToSelf}
            disabled={sending || fcmTokens.length === 0}
            className="w-full"
          >
            {sending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Envoi...</>
            ) : (
              <><Send className="h-4 w-4 mr-2" /> Envoyer test à moi-même</>
            )}
          </Button>

          {sendResult && (
            <div className={`p-3 rounded-lg text-sm font-medium ${sendResult.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
              {sendResult.msg}
            </div>
          )}

          {fcmTokens.length === 0 && (
            <p className="text-xs text-muted-foreground text-center">
              Génère d'abord un token FCM ci-dessus
            </p>
          )}
        </CardContent>
      </Card>

      {/* Guide de debug */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="p-4 space-y-2 text-xs text-blue-800">
          <p className="font-bold">🔍 Si la notification n'arrive pas :</p>
          <ul className="space-y-1 ml-3 list-disc">
            <li><strong>App ouverte</strong> → listener Capacitor `pushNotificationReceived`</li>
            <li><strong>Background</strong> → système Android (automatique si canal "default" créé)</li>
            <li><strong>App fermée</strong> → FCM + canal Android importance 5 requis</li>
            <li>Vérifier <strong>google-services.json</strong> dans le projet Android</li>
            <li>Vérifier que <strong>FIREBASE_SERVICE_ACCOUNT_JSON</strong> est correct en BDD</li>
            <li>Vérifier les logs Android Studio (Logcat → tag "CDL")</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}