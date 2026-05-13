/**
 * FcmTokenDebug — Outil de diagnostic notifications push
 * Affiche le token FCM de l'utilisateur connecté + test d'envoi direct
 */
import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, Send, Copy, RefreshCw, CheckCircle2, AlertCircle, Smartphone, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import FcmCleanupPanel from '@/components/FcmCleanupPanel';

export default function FcmTokenDebug() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [permStatus, setPermStatus] = useState('unknown');
  const [targetEmail, setTargetEmail] = useState('');
  const [allTokenUsers, setAllTokenUsers] = useState([]);

  // Calculé UNE SEULE FOIS au mount — avant tout useEffect
  const isNative = typeof window !== 'undefined' && (
    window.location?.protocol === 'capacitor:' ||
    window.Capacitor?.isNativePlatform?.() === true
  );

  useEffect(() => {
    const load = async () => {
      try {
        const me = await base44.auth.me();
        setUser(me);
        setTargetEmail(me.email);

        // Permission status
        const isNativeApp = window.Capacitor?.isNativePlatform?.() === true;
        if (isNativeApp) {
          // Sur APK Capacitor, window.Notification n'existe pas — c'est normal
          // Vérifier via le plugin PushNotifications
          try {
            const { PushNotifications } = await import('@capacitor/push-notifications');
            const perm = await PushNotifications.checkPermissions();
            setPermStatus(perm.receive === 'granted' ? 'granted' : perm.receive === 'denied' ? 'denied' : 'default');
          } catch (_) {
            setPermStatus('native_unknown');
          }
        } else if ('Notification' in window) {
          setPermStatus(Notification.permission);
        } else {
          setPermStatus('unavailable');
        }

        // Tokens de l'utilisateur connecté
        const myTokens = await base44.entities.FcmToken.filter({ user_email: me.email }, '-registered_at', 10);
        setTokens(myTokens);

        // Tous les users avec token (pour admin)
        if (me.role === 'admin') {
          const allToks = await base44.entities.FcmToken.filter({ is_active: true }, '-registered_at', 50);
          const emails = [...new Set(allToks.map(t => t.user_email))];
          setAllTokenUsers(emails);
        }
      } catch (err) {
        toast.error('Erreur: ' + err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const copyToken = (token) => {
    navigator.clipboard?.writeText(token).then(() => toast.success('Token copié!')).catch(() => {
      toast.error('Copie non supportée');
    });
  };

  const sendTestToEmail = async (email) => {
    setSending(true);
    try {
      const res = await base44.functions.invoke('sendTestPush', { target_email: email });
      const d = res.data;
      if (d?.fcm_sent > 0) {
        setLastResult({ status: 'success', email, sent: d.fcm_sent, tokens_found: d.token_info?.token_count || 0 });
        toast.success(`✅ Push envoyé à ${email} | channel: cdl_critical_alerts_v3`);
      } else {
        const msg = d?.note || d?.error || (d?.token_info?.token_found === false ? 'Aucun token FCM — ouvrir l\'APK' : 'Envoi échoué');
        setLastResult({ status: 'failed', email, message: msg });
        toast.error(`⚠️ Échec: ${msg}`);
      }
    } catch (err) {
      setLastResult({ status: 'error', email, message: err.message });
      toast.error('Erreur: ' + err.message);
    } finally {
      setSending(false);
    }
  };

  const refreshTokens = async () => {
    if (!user) return;
    setLoading(true);
    const myTokens = await base44.entities.FcmToken.filter({ user_email: user.email }, '-registered_at', 10);
    setTokens(myTokens);
    if (user.role === 'admin') {
      const allToks = await base44.entities.FcmToken.filter({ is_active: true }, '-registered_at', 50);
      setAllTokenUsers([...new Set(allToks.map(t => t.user_email))]);
    }
    setLoading(false);
    toast.success('Actualisé');
  };

  const permColor = {
    granted: 'text-green-700 bg-green-50 border-green-200',
    denied: 'text-red-700 bg-red-50 border-red-200',
    default: 'text-amber-700 bg-amber-50 border-amber-200',
    unavailable: 'text-gray-700 bg-gray-50 border-gray-200',
    native_unknown: 'text-amber-700 bg-amber-50 border-amber-200',
    unknown: 'text-gray-700 bg-gray-50 border-gray-200',
  }[permStatus] || 'text-gray-700 bg-gray-50 border-gray-200';

  const permLabel = {
    granted: '✅ Accordée',
    denied: '❌ Refusée (aller dans Paramètres → Notifications)',
    default: '⚠️ Non demandée encore — cliquer "Demander"',
    unavailable: '❌ API Notification non disponible',
    native_unknown: '⚠️ Natif Capacitor — statut inconnu (cliquer "Demander")',
    unknown: '? Inconnu',
  }[permStatus] || permStatus;

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-lg font-bold">🔔 Diagnostic Notifications FCM</h1>
          <p className="text-xs text-muted-foreground">Chaîne complète : permission → token → envoi → réception</p>
        </div>
        <Button variant="ghost" size="icon" className="ml-auto" onClick={refreshTokens}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Étape 1 — Environnement */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Étape 1 — Environnement</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Mode APK</span>
            <span className={`font-bold px-2 py-0.5 rounded ${isNative ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
              {isNative ? '📱 Capacitor natif' : '🌐 WebView / Web'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">window.Capacitor</span>
            <span className={`font-bold ${typeof window !== 'undefined' && window.Capacitor ? 'text-green-600' : 'text-red-500'}`}>
              {typeof window !== 'undefined' && window.Capacitor ? '✅ Présent' : '❌ Absent'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">isNativePlatform()</span>
            <span className={`font-bold ${isNative ? 'text-green-600' : 'text-red-500'}`}>
              {isNative ? '✅ true' : '❌ false'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">API Notification</span>
            <span className={`font-bold ${'Notification' in window ? 'text-green-600' : isNative ? 'text-amber-500' : 'text-red-500'}`}>
              {'Notification' in window ? '✅ Disponible' : isNative ? '⚠️ Natif (normal)' : '❌ Non disponible'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Service Worker</span>
            <span className={`font-bold ${'serviceWorker' in navigator ? 'text-green-600' : 'text-red-500'}`}>
              {'serviceWorker' in navigator ? '✅ Supporté' : '❌ Non supporté'}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Étape 2 — Permission */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Étape 2 — Permission Android</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className={`px-3 py-2 rounded-lg border text-sm font-semibold ${permColor}`}>
            <Bell className="h-4 w-4 inline mr-2" />
            {permLabel}
          </div>
          {(permStatus === 'default' || permStatus === 'native_unknown') && (
            <Button
              size="sm"
              className="w-full"
              onClick={async () => {
                if (isNative) {
                  try {
                    const { PushNotifications } = await import('@capacitor/push-notifications');
                    const res = await PushNotifications.requestPermissions();
                    setPermStatus(res.receive === 'granted' ? 'granted' : 'denied');
                    toast(res.receive === 'granted' ? '✅ Permission accordée!' : '❌ Permission refusée');
                  } catch (e) {
                    toast.error('Erreur: ' + e.message);
                  }
                } else {
                  const p = await Notification.requestPermission();
                  setPermStatus(p);
                  toast(p === 'granted' ? '✅ Permission accordée!' : '❌ Permission refusée');
                }
              }}
            >
              Demander la permission maintenant
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Étape 3 — Tokens FCM en BDD */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Étape 3 — Tokens FCM en base ({tokens.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {tokens.length === 0 ? (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              ❌ Aucun token FCM enregistré pour <strong>{user?.email}</strong>.<br />
              <span className="text-xs mt-1 block">
                {isNative
                  ? 'Vérifier que @capacitor/push-notifications est installé et que la permission est accordée.'
                  : 'Le Service Worker Firebase doit être enregistré et la permission accordée.'}
              </span>
            </div>
          ) : (
            tokens.map((t, i) => (
              <div key={t.id} className="p-3 rounded-lg border bg-green-50 border-green-200 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-green-700">
                    ✅ Token #{i + 1} — {t.device_type}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded ${t.is_active ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-600'}`}>
                    {t.is_active ? 'Actif' : 'Inactif'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="text-xs text-gray-600 break-all flex-1 bg-white px-2 py-1 rounded border">
                    {t.token.substring(0, 40)}...
                  </code>
                  <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={() => copyToken(t.token)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Enregistré: {t.registered_at ? new Date(t.registered_at).toLocaleString() : 'N/A'} |
                  Dernière utilisation: {t.last_used ? new Date(t.last_used).toLocaleString() : 'N/A'}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Étape 4 — Envoi test */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Étape 4 — Test d'envoi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-xs font-medium mb-1 block text-muted-foreground">Email destinataire</label>
            <div className="flex gap-2">
              <input
                type="email"
                value={targetEmail}
                onChange={e => setTargetEmail(e.target.value)}
                className="flex-1 px-3 py-2 border rounded-lg text-sm bg-background"
                placeholder="email@exemple.com"
              />
              <Button
                onClick={() => sendTestToEmail(targetEmail)}
                disabled={!targetEmail || sending || tokens.length === 0}
                className="flex-shrink-0"
              >
                {sending ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Envoyer à soi-même rapidement */}
          <Button
            variant="outline"
            className="w-full"
            onClick={() => sendTestToEmail(user?.email)}
            disabled={sending || tokens.length === 0}
          >
            <Smartphone className="h-4 w-4 mr-2" />
            M'envoyer une notification test
          </Button>

          {tokens.length === 0 && (
            <p className="text-xs text-red-600">⚠️ Aucun token — impossible d'envoyer avant d'avoir un token enregistré</p>
          )}

          {/* Résultat */}
          {lastResult && (
            <div className={`p-3 rounded-lg border text-xs ${lastResult.status === 'success' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              {lastResult.status === 'success' ? (
                <p className="text-green-700 font-semibold">
                  ✅ Envoyé à {lastResult.email} — {lastResult.sent}/{lastResult.tokens_found} tokens
                </p>
              ) : (
                <p className="text-red-700 font-semibold">
                  ❌ Échec: {lastResult.message}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Étape 5 — Réception attendue */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Étape 5 — Réception attendue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <div className="space-y-1.5">
            <div className="flex items-start gap-2">
              <span className="text-green-600 font-bold flex-shrink-0">App ouverte:</span>
              <span>{isNative ? 'Listener pushNotificationReceived Capacitor → toast dans l\'app' : 'onMessage Firebase → toast dans l\'app'}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-blue-600 font-bold flex-shrink-0">Background:</span>
              <span>{isNative ? 'FCM natif Android → notification système (barre de statut)' : 'Service Worker firebase-messaging-sw.js → notification système'}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-purple-600 font-bold flex-shrink-0">Fermée:</span>
              <span>{isNative ? 'FCM natif Android → notification système, tap ouvre l\'app' : 'SW firebase-messaging-sw.js → notification système'}</span>
            </div>
          </div>
          {isNative && (
            <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-blue-700">
              <strong>Mode Capacitor natif détecté</strong> — Canal officiel : <code>cdl_critical_alerts_v3</code> (importance=5, heads-up activé, visible écran verrouillé).
            </div>
          )}
        </CardContent>
      </Card>

      {/* Nettoyage tokens FCM (admin) */}
      {user?.role === 'admin' && <FcmCleanupPanel />}

      {/* Liste des emails avec tokens (admin) */}
      {user?.role === 'admin' && allTokenUsers.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tous les utilisateurs avec token FCM ({allTokenUsers.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 max-h-48 overflow-y-auto">
            {allTokenUsers.map(email => (
              <div key={email} className="flex items-center justify-between py-1 border-b last:border-0">
                <span className="text-xs truncate flex-1">{email}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs flex-shrink-0"
                  disabled={sending}
                  onClick={() => {
                    setTargetEmail(email);
                    sendTestToEmail(email);
                  }}
                >
                  <Send className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}