/**
 * FcmDiagnostic — Diagnostic notifications push
 * Natif Capacitor (APK) ou Web (PWA)
 */
import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, RefreshCw, Copy, CheckCircle2, XCircle, AlertCircle, Loader2, Smartphone, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

// ── Helpers ──────────────────────────────────────────────────────────────────
function isNativePlatform() {
  if (typeof window === 'undefined') return false;
  if (window.location?.protocol === 'capacitor:') return true;
  if (window.Capacitor?.isNativePlatform?.() === true) return true;
  if (typeof window.Capacitor !== 'undefined') return true;
  return false;
}

function StatusRow({ label, status, detail }) {
  const icon =
    status === 'ok'      ? <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" /> :
    status === 'error'   ? <XCircle      className="h-4 w-4 text-red-500 flex-shrink-0" /> :
    status === 'loading' ? <Loader2      className="h-4 w-4 text-blue-500 flex-shrink-0 animate-spin" /> :
    status === 'warn'    ? <AlertCircle  className="h-4 w-4 text-amber-500 flex-shrink-0" /> :
                           <AlertCircle  className="h-4 w-4 text-slate-400 flex-shrink-0" />;
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

// ── Composant principal ───────────────────────────────────────────────────────
export default function FcmDiagnostic() {
  const navigate = useNavigate();
  const [user, setUser]           = useState(null);
  const [fcmTokens, setFcmTokens] = useState([]);
  const [isNative]                = useState(() => isNativePlatform());
  const [registering, setRegistering] = useState(false);
  const [sending, setSending]     = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [lastNotif, setLastNotif] = useState(null);
  const cleanupRef = useRef(null);

  const [chain, setChain] = useState({
    user:       'loading',
    permission: 'pending',
    register:   'pending',
    token:      'pending',
    db:         'pending',
  });

  // ── Chargement initial ─────────────────────────────────────────────────────
  const load = async () => {
    setChain({ user: 'loading', permission: 'pending', register: 'pending', token: 'pending', db: 'pending' });
    setFcmTokens([]);
    setSendResult(null);

    // 1. User
    let me;
    try {
      me = await base44.auth.me();
      setUser(me);
      setChain(c => ({ ...c, user: 'ok' }));
    } catch {
      setChain(c => ({ ...c, user: 'error' }));
      return;
    }

    // 2. Permission
    if (isNative) {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        const perm = await PushNotifications.checkPermissions();
        setChain(c => ({ ...c, permission: perm.receive === 'granted' ? 'ok' : perm.receive === 'denied' ? 'error' : 'warn' }));
      } catch (e) {
        console.error('[FcmDiag] checkPermissions error:', e?.message);
        setChain(c => ({ ...c, permission: 'error' }));
      }
    } else {
      // Web : window.Notification peut ne pas exister (normal en APK sans Notification API)
      if ('Notification' in window) {
        const p = Notification.permission;
        setChain(c => ({ ...c, permission: p === 'granted' ? 'ok' : p === 'default' ? 'warn' : 'error' }));
      } else {
        // Pas d'API Notification web — pas bloquant si natif
        setChain(c => ({ ...c, permission: 'warn' }));
      }
    }

    // 3. Tokens en BDD
    try {
      const tokens = await base44.entities.FcmToken.filter({ user_email: me.email, is_active: true }, '-registered_at', 5);
      setFcmTokens(tokens);
      const hasToken = tokens.length > 0;
      setChain(c => ({ ...c, token: hasToken ? 'ok' : 'error', db: hasToken ? 'ok' : 'error', register: hasToken ? 'ok' : 'pending' }));
    } catch {
      setChain(c => ({ ...c, token: 'error', db: 'error' }));
    }
  };

  useEffect(() => {
    load();
    return () => { cleanupRef.current?.(); };
  }, []);

  // ── Enregistrement natif Capacitor ─────────────────────────────────────────
  const registerNative = async () => {
    console.log('[FcmDiag] ▶ registerNative() — DÉBUT');
    setRegistering(true);
    setChain(c => ({ ...c, permission: 'loading', register: 'loading' }));

    // ÉTAPE 1 : Vérifier que le plugin est disponible
    let PushNotifications;
    try {
      const mod = await import('@capacitor/push-notifications');
      PushNotifications = mod.PushNotifications;
      console.log('[FcmDiag] ✅ Plugin @capacitor/push-notifications importé');
    } catch (importErr) {
      console.error('[FcmDiag] ❌ Import plugin échoué:', importErr?.message);
      toast.error('Plugin push-notifications non disponible. Vérifiez npx cap sync android.', { duration: 8000 });
      setChain(c => ({ ...c, permission: 'error', register: 'error' }));
      setRegistering(false);
      return;
    }

    // ÉTAPE 2 : Créer canal Android (Android 8+)
    try {
      await PushNotifications.createChannel({
        id: 'default',
        name: 'CDL Notifications',
        importance: 5,
        sound: 'default',
        vibration: true,
        lights: true,
      });
      console.log('[FcmDiag] ✅ Canal Android "default" créé');
    } catch (chanErr) {
      // Non bloquant — le canal peut déjà exister
      console.warn('[FcmDiag] Canal creation (non bloquant):', chanErr?.message);
    }

    // ÉTAPE 3 : Vérifier / demander permission
    try {
      const current = await PushNotifications.checkPermissions();
      console.log('[FcmDiag] Permission actuelle:', current?.receive);

      if (current?.receive !== 'granted') {
        console.log('[FcmDiag] Demande de permission...');
        const req = await PushNotifications.requestPermissions();
        console.log('[FcmDiag] Résultat permission:', req?.receive);

        if (req?.receive !== 'granted') {
          toast.error('Permission refusée. Allez dans Paramètres Android → Apps → CDL → Notifications → Activer.', { duration: 8000 });
          setChain(c => ({ ...c, permission: 'error', register: 'error' }));
          setRegistering(false);
          return;
        }
      }
      setChain(c => ({ ...c, permission: 'ok' }));
      console.log('[FcmDiag] ✅ Permission accordée');
    } catch (permErr) {
      console.error('[FcmDiag] ❌ Erreur permission:', permErr?.message);
      toast.error('Erreur vérification permission : ' + permErr?.message);
      setChain(c => ({ ...c, permission: 'error', register: 'error' }));
      setRegistering(false);
      return;
    }

    // ÉTAPE 4 : Attacher les listeners AVANT register()
    let tokenListener = null;
    let errListener = null;
    let foregroundListener = null;
    let timeoutId = null;
    let tokenReceived = false;

    const cleanup = async () => {
      try { if (tokenListener) await tokenListener.remove(); } catch (_) {}
      try { if (errListener) await errListener.remove(); } catch (_) {}
      if (timeoutId) clearTimeout(timeoutId);
    };

    try {
      tokenListener = await PushNotifications.addListener('registration', async (tokenObj) => {
        if (tokenReceived) return; // éviter double appel
        tokenReceived = true;
        const tkValue = tokenObj?.value;
        console.log('[FcmDiag] ✅ Token FCM reçu:', tkValue ? tkValue.substring(0, 30) + '...' : 'VIDE');

        if (!tkValue) {
          console.error('[FcmDiag] ❌ Token vide reçu !');
          toast.error('Token FCM vide reçu — problème google-services.json ou Firebase.');
          setChain(c => ({ ...c, register: 'error', token: 'error' }));
          setRegistering(false);
          await cleanup();
          return;
        }

        setChain(c => ({ ...c, register: 'ok', token: 'loading', db: 'loading' }));

        // Sauvegarder en base
        try {
          await base44.functions.invoke('saveFcmToken', { token: tkValue, deviceType: 'android_native' });
          setChain(c => ({ ...c, token: 'ok', db: 'ok' }));
          toast.success('✅ Token FCM enregistré ! Notifications activées.', { duration: 5000 });
          // Recharger tokens affichés
          const tokens = await base44.entities.FcmToken.filter(
            { user_email: user?.email, is_active: true }, '-registered_at', 5
          );
          setFcmTokens(tokens);
        } catch (saveErr) {
          console.error('[FcmDiag] ❌ Sauvegarde token échouée:', saveErr?.message);
          setChain(c => ({ ...c, token: 'error', db: 'error' }));
          toast.error('Token reçu mais erreur sauvegarde : ' + saveErr?.message);
        }

        setRegistering(false);
        await cleanup();
      });

      errListener = await PushNotifications.addListener('registrationError', async (err) => {
        console.error('[FcmDiag] ❌ registrationError:', JSON.stringify(err));
        setChain(c => ({ ...c, register: 'error' }));
        const msg = err?.error || err?.message || JSON.stringify(err) || 'Inconnu';
        toast.error(
          'FCM registrationError: ' + msg + '\n→ Vérifiez google-services.json dans android/app/',
          { duration: 10000 }
        );
        setRegistering(false);
        await cleanup();
      });

      // Écouter notifications foreground (diagnostic)
      foregroundListener = await PushNotifications.addListener('pushNotificationReceived', (notif) => {
        console.log('[FcmDiag] 📬 Notif foreground:', notif?.title);
        setLastNotif({ title: notif?.title || '(sans titre)', body: notif?.body || '', time: new Date().toLocaleTimeString() });
        toast.success('📬 Notification reçue : ' + (notif?.title || ''));
      });
      cleanupRef.current = () => { try { foregroundListener?.remove(); } catch (_) {} };

      console.log('[FcmDiag] ✅ Listeners attachés — appel register()...');
    } catch (listenerErr) {
      console.error('[FcmDiag] ❌ Erreur attache listeners:', listenerErr?.message);
      toast.error('Erreur préparation FCM : ' + listenerErr?.message);
      setChain(c => ({ ...c, register: 'error' }));
      setRegistering(false);
      return;
    }

    // ÉTAPE 5 : register() — appelé via setTimeout pour éviter crash thread natif
    // Le crash Android se produit quand register() est appelé dans le même tick JS
    // que requestPermissions(). Le délai laisse le thread natif se stabiliser.
    console.log('[FcmDiag] Pause 500ms avant register() pour stabiliser le thread natif...');
    await new Promise(resolve => setTimeout(resolve, 500));

    // Vérifier que Capacitor est toujours disponible (l'app n'a pas crashé)
    if (!window.Capacitor) {
      toast.error('Capacitor non disponible — l\'APK doit être rebuild avec npx cap sync android', { duration: 10000 });
      setChain(c => ({ ...c, register: 'error' }));
      setRegistering(false);
      await cleanup();
      return;
    }

    try {
      console.log('[FcmDiag] Appel PushNotifications.register()...');
      // Appel synchrone intentionnel — ne pas await pour éviter le crash natif
      // Le résultat arrive via le listener 'registration' ou 'registrationError'
      PushNotifications.register();
      console.log('[FcmDiag] register() lancé (résultat attendu via listener)');
      toast.info('Enregistrement FCM lancé — token attendu dans 5-15 sec...', { duration: 6000 });
    } catch (regErr) {
      console.error('[FcmDiag] ❌ register() a throw:', regErr?.message, regErr?.stack);
      toast.error(
        'register() échoué : ' + (regErr?.message || 'Erreur inconnue') +
        ' — Vérifiez google-services.json dans android/app/ puis npx cap sync android',
        { duration: 12000 }
      );
      setChain(c => ({ ...c, register: 'error' }));
      setRegistering(false);
      await cleanup();
      return;
    }

    // ÉTAPE 6 : Timeout sécurité 45s
    timeoutId = setTimeout(async () => {
      if (!tokenReceived) {
        console.warn('[FcmDiag] ⏱ Timeout 45s — token non reçu');
        toast.error(
          'Timeout 45s : token FCM non reçu.\n' +
          '→ Vérifiez :\n1. google-services.json dans android/app/\n' +
          '2. npx cap sync android + rebuild APK\n' +
          '3. Connexion réseau active',
          { duration: 12000 }
        );
        setChain(c => ({ ...c, register: 'error' }));
        setRegistering(false);
        await cleanup();
      }
    }, 45000);
  };

  // ── Enregistrement Web (PWA) ───────────────────────────────────────────────
  const registerWeb = async () => {
    setRegistering(true);
    try {
      if (!('Notification' in window)) {
        toast.error('API Notification non disponible dans ce navigateur/WebView.');
        setRegistering(false);
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        toast.error('Permission refusée');
        setChain(c => ({ ...c, permission: 'error' }));
        setRegistering(false);
        return;
      }
      setChain(c => ({ ...c, permission: 'ok' }));

      const { registerSW } = await import('@/lib/swRegister');
      await registerSW();
      const { requestWebPushToken } = await import('@/lib/webPush');
      const { token } = await requestWebPushToken();
      if (token) {
        await base44.functions.invoke('saveFcmToken', { token, deviceType: 'web' });
        setChain(c => ({ ...c, register: 'ok', token: 'ok', db: 'ok' }));
        toast.success('✅ Token Web Push enregistré !');
        await load();
      } else {
        toast.error('Pas de token web push obtenu.');
        setChain(c => ({ ...c, register: 'error' }));
      }
    } catch (err) {
      toast.error('Erreur web push: ' + err?.message);
      setChain(c => ({ ...c, register: 'error' }));
    } finally {
      setRegistering(false);
    }
  };

  // ── Test d'envoi ───────────────────────────────────────────────────────────
  const sendTest = async () => {
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
        toast.success('Notification envoyée — vérifiez votre téléphone');
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

  const copyToken = (token) => {
    navigator.clipboard?.writeText(token);
    toast.success('Token copié');
  };

  // ── Rendu ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 pb-20 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">🔔 Diagnostic Notifications</h1>
          <div className="flex items-center gap-2 mt-0.5">
            {isNative
              ? <><Smartphone className="h-3.5 w-3.5 text-green-600" /><span className="text-xs text-green-700 font-semibold">Mode natif Android (Capacitor)</span></>
              : <><Globe className="h-3.5 w-3.5 text-blue-600" /><span className="text-xs text-blue-700 font-semibold">Mode Web / PWA</span></>
            }
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={load}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Note explicative mode natif */}
      {isNative && (
        <Card className="border-green-300 bg-green-50">
          <CardContent className="p-3">
            <p className="text-xs text-green-800 font-semibold">📱 APK Android natif détecté</p>
            <p className="text-xs text-green-700 mt-1">
              En mode natif, les notifications utilisent <strong>Capacitor PushNotifications</strong> (Firebase FCM), 
              et non l'API Notification web du navigateur. C'est normal de ne pas voir "API Notification disponible" ici.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Chaîne d'état */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">État de la chaîne FCM</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <StatusRow
            label="1. Utilisateur connecté"
            status={chain.user}
            detail={user ? `${user.full_name} (${user.email})` : 'Non connecté'}
          />
          <StatusRow
            label={isNative ? "2. Permission Android (Capacitor)" : "2. Permission Notification (Web)"}
            status={chain.permission}
            detail={
              chain.permission === 'ok'      ? 'Permission accordée ✅' :
              chain.permission === 'warn'    ? isNative ? 'Non encore demandée — cliquez Enregistrer ci-dessous' : 'Non encore demandée' :
              chain.permission === 'error'   ? 'Refusée — Paramètres → Apps → CDL → Notifications' :
              chain.permission === 'loading' ? 'Vérification en cours...' :
              'En attente'
            }
          />
          <StatusRow
            label="3. Enregistrement FCM (register)"
            status={chain.register}
            detail={
              chain.register === 'ok'      ? 'register() exécuté avec succès ✅' :
              chain.register === 'error'   ? 'Échec — vérifiez google-services.json' :
              chain.register === 'loading' ? 'register() en cours...' :
              'Non encore appelé'
            }
          />
          <StatusRow
            label="4. Token FCM généré et en BDD"
            status={chain.token}
            detail={fcmTokens.length > 0
              ? `${fcmTokens.length} token(s) — dernier: ${fcmTokens[0]?.device_type}`
              : 'Aucun token enregistré'}
          />
          <StatusRow
            label="5. Prêt à recevoir des notifications"
            status={chain.db}
            detail={chain.db === 'ok' ? 'Tout est configuré ✅' : 'Token manquant en base'}
          />
        </CardContent>
      </Card>

      {/* Bouton principal : Enregistrer */}
      {chain.db !== 'ok' && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-semibold text-amber-900">
              {isNative ? '📱 Enregistrer ce téléphone Android' : '🌐 Enregistrer ce navigateur'}
            </p>
            <p className="text-xs text-amber-700">
              {isNative
                ? 'Demande la permission Android et génère le token FCM via Capacitor PushNotifications.'
                : 'Demande la permission web et génère le token via Firebase Web Push.'}
            </p>
            <Button
              onClick={isNative ? registerNative : registerWeb}
              disabled={registering}
              className="w-full"
            >
              {registering
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enregistrement en cours...</>
                : '🔑 Demander permission + Enregistrer FCM'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Tokens FCM en BDD */}
      {fcmTokens.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tokens FCM actifs ({fcmTokens.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 px-4 pb-4">
            {fcmTokens.map((t) => (
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
      )}

      {/* Dernière notification reçue (foreground) */}
      {lastNotif && (
        <Card className="border-green-300 bg-green-50">
          <CardContent className="p-3 space-y-1">
            <p className="text-xs font-bold text-green-800">📬 Dernière notification reçue (foreground)</p>
            <p className="text-sm font-semibold text-green-900">{lastNotif.title}</p>
            {lastNotif.body && <p className="text-xs text-green-700">{lastNotif.body}</p>}
            <p className="text-xs text-green-600">{lastNotif.time}</p>
          </CardContent>
        </Card>
      )}

      {/* Test d'envoi */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Envoyer une notification de test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-4">
          <p className="text-xs text-muted-foreground">
            Envoie une notification push à <strong>{user?.email}</strong> via Firebase FCM.
          </p>
          <Button onClick={sendTest} disabled={sending || fcmTokens.length === 0} className="w-full">
            {sending
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Envoi...</>
              : <><Send className="h-4 w-4 mr-2" /> Envoyer test à moi-même</>
            }
          </Button>
          {fcmTokens.length === 0 && (
            <p className="text-xs text-muted-foreground text-center">
              ⚠️ Enregistrez d'abord un token FCM ci-dessus.
            </p>
          )}
          {sendResult && (
            <div className={`p-3 rounded-lg text-sm font-medium ${sendResult.ok
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'}`}>
              {sendResult.msg}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Guide crash Android */}
      {isNative && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 space-y-2 text-xs text-red-900">
            <p className="font-bold">🔴 Si l'app se ferme au clic "Enregistrer" :</p>
            <p className="font-semibold mt-1">Causes les plus fréquentes :</p>
            <ul className="space-y-1 ml-3 list-disc">
              <li><strong>google-services.json manquant</strong> dans <code>android/app/</code> → crash FirebaseApp</li>
              <li><strong>npx cap sync android</strong> non exécuté après modification</li>
              <li><strong>APK non rebuild</strong> après sync dans Android Studio</li>
              <li>Package name dans google-services.json ≠ package Android réel</li>
            </ul>
            <p className="font-semibold mt-2">Commandes Logcat pour identifier le crash :</p>
            <div className="bg-red-100 rounded p-2 font-mono text-[10px] space-y-1">
              <p># Voir tous les crashs</p>
              <p>adb logcat -s AndroidRuntime:E</p>
              <p># Voir logs FCM</p>
              <p>adb logcat -s FirebaseMessaging:* Firebase:*</p>
              <p># Voir logs CDL</p>
              <p>adb logcat | grep -i "cdl\|capacitor\|firebase"</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Guide debug général */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="p-4 space-y-2 text-xs text-blue-800">
          <p className="font-bold">🔍 Checklist FCM Android :</p>
          <ul className="space-y-1 ml-3 list-disc">
            <li><strong>google-services.json</strong> présent dans <code>android/app/</code> ?</li>
            <li>Rebuild APK dans Android Studio après <code>npx cap sync android</code> ?</li>
            <li>Package name <strong>identique</strong> dans google-services.json et AndroidManifest.xml ?</li>
            <li>Connexion réseau active (FCM nécessite internet) ?</li>
            <li>Android 13+ : permission <code>POST_NOTIFICATIONS</code> dans le manifest ?</li>
            <li>Logcat filtre : <code>FirebaseMessaging</code> ou <code>CdlApp</code></li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}