import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

// ─── Constantes Firebase ─────────────────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: "cdl-app-4743c.firebaseapp.com",
  projectId: "cdl-app-4743c",
  storageBucket: "cdl-app-4743c.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

// ─── Import Firebase dynamique ────────────────────────────────────────────────
async function getFirebaseMessaging() {
  const { initializeApp, getApps } = await import('firebase/app');
  const { getMessaging } = await import('firebase/messaging');
  const app = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApps()[0];
  return getMessaging(app);
}

// ─── Enregistrement du service worker et obtention du token ──────────────────
async function getFcmToken() {
  const { getToken } = await import('firebase/messaging');
  const messaging = await getFirebaseMessaging();
  const params = new URLSearchParams({
    apiKey: FIREBASE_CONFIG.apiKey || '',
    authDomain: FIREBASE_CONFIG.authDomain,
    projectId: FIREBASE_CONFIG.projectId,
    storageBucket: FIREBASE_CONFIG.storageBucket,
    messagingSenderId: FIREBASE_CONFIG.messagingSenderId || '',
    appId: FIREBASE_CONFIG.appId || '',
  });
  const reg = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${params}`);
  await navigator.serviceWorker.ready;
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
  return { token, reg };
}

// ─── Composant ligne de statut ────────────────────────────────────────────────
function StatusRow({ label, status, detail }) {
  // status: "loading" | "ok" | "warn" | "error"
  const icons = {
    loading: <Loader2 className="h-5 w-5 text-muted-foreground animate-spin mt-0.5 flex-shrink-0" />,
    ok:      <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />,
    warn:    <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />,
    error:   <XCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />,
  };
  return (
    <div className="flex items-start gap-3 py-3 border-b last:border-0">
      {icons[status] || icons.loading}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {detail && <p className="text-xs text-muted-foreground mt-0.5 break-all">{detail}</p>}
      </div>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function FcmDiagnostic() {
  const [steps, setSteps] = useState([]);
  const [running, setRunning] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [fcmToken, setFcmToken] = useState(null);
  const [userEmail, setUserEmail] = useState(null);

  const setStep = (id, update) =>
    setSteps(prev => {
      const idx = prev.findIndex(s => s.id === id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], ...update };
        return next;
      }
      return [...prev, { id, ...update }];
    });

  const runDiagnostic = async () => {
    setRunning(true);
    setFcmToken(null);
    setSteps([]);

    // ── 1. Secrets frontend ──────────────────────────────────────────────────
    setStep('secrets', { label: "Secrets VITE_ configurés", status: "loading", detail: "" });
    const missing = Object.entries(FIREBASE_CONFIG)
      .filter(([, v]) => !v || v === 'undefined')
      .map(([k]) => k);
    const vapidOk = !!VAPID_KEY && VAPID_KEY !== 'undefined';
    if (missing.length > 0 || !vapidOk) {
      setStep('secrets', {
        status: "error",
        detail: `Manquants: ${[...missing, !vapidOk && 'VAPID_KEY'].filter(Boolean).join(', ')}`,
      });
    } else {
      setStep('secrets', {
        status: "ok",
        detail: `API key: ${FIREBASE_CONFIG.apiKey?.substring(0,12)}… | Sender: ${FIREBASE_CONFIG.messagingSenderId}`,
      });
    }

    // ── 2. Service Account JSON (via backend) ────────────────────────────────
    setStep('sa', { label: "Secret FIREBASE_SERVICE_ACCOUNT_JSON", status: "loading", detail: "" });
    try {
      const res = await base44.functions.invoke('testFcm', { ping: true });
      const d = res.data;
      if (d.ok && d.sa_client_email) {
        setStep('sa', { status: "ok", detail: `${d.sa_client_email}` });
      } else {
        setStep('sa', { status: "error", detail: d.error || "JSON invalide" });
      }
    } catch(e) {
      setStep('sa', { status: "error", detail: e.message });
    }

    // ── 3. Permission navigateur ─────────────────────────────────────────────
    setStep('perm', { label: "Permission notifications navigateur", status: "loading", detail: "" });
    let perm = Notification.permission;
    if (perm === 'default') {
      perm = await Notification.requestPermission();
    }
    if (perm === 'granted') {
      setStep('perm', { status: "ok", detail: "Autorisé" });
    } else {
      setStep('perm', { status: "error", detail: `Refusé (${perm}) - autorisez dans les paramètres du navigateur` });
      setRunning(false);
      return;
    }

    // ── 4. Authentification utilisateur ─────────────────────────────────────
    setStep('user', { label: "Utilisateur connecté", status: "loading", detail: "" });
    let me;
    try {
      me = await base44.auth.me();
      setUserEmail(me.email);
      setStep('user', { status: "ok", detail: me.email });
    } catch(e) {
      setStep('user', { status: "error", detail: "Non connecté: " + e.message });
      setRunning(false);
      return;
    }

    // ── 5. Service Worker ────────────────────────────────────────────────────
    setStep('sw', { label: "Service Worker Firebase enregistré", status: "loading", detail: "" });
    let swReg;
    try {
      const result = await getFcmToken();
      swReg = result.reg;
      setStep('sw', {
        status: "ok",
        detail: `Scope: ${swReg.scope} | État: ${swReg.active?.state || 'actif'}`,
      });

      // ── 6. Token FCM ───────────────────────────────────────────────────────
      setStep('token', { label: "Token FCM généré", status: "loading", detail: "" });
      const token = result.token;
      if (token) {
        setFcmToken(token);
        setStep('token', { status: "ok", detail: token.substring(0, 50) + "…" });

        // ── 7. Sauvegarde token ────────────────────────────────────────────
        setStep('save', { label: "Token enregistré en base", status: "loading", detail: "" });
        try {
          await base44.functions.invoke('saveFcmToken', { token });
          setStep('save', { status: "ok", detail: "Token sauvegardé pour " + me.email });
        } catch(e) {
          setStep('save', { status: "warn", detail: "Erreur sauvegarde: " + e.message });
        }
      } else {
        setStep('token', { status: "error", detail: "Aucun token retourné - vérifiez VAPID_KEY" });
        setStep('save', { label: "Token enregistré en base", status: "error", detail: "Token manquant" });
      }
    } catch(e) {
      setStep('sw', { status: "error", detail: e.message });
      setStep('token', { label: "Token FCM généré", status: "error", detail: "Service worker requis" });
      setStep('save', { label: "Token enregistré en base", status: "error", detail: "Token manquant" });
    }

    setRunning(false);
  };

  const sendTestNotification = async () => {
    if (!userEmail) return;
    setSendingTest(true);
    try {
      const res = await base44.functions.invoke('sendFcmNotification', {
        user_email: userEmail,
        title: "🔔 Test CDL - Notifications actives !",
        body: "Si vous voyez ceci, les notifications push fonctionnent parfaitement.",
        data: { type: "test", timestamp: String(Date.now()) },
      });
      const d = res.data;
      if (d.sent > 0) {
        toast.success(`✅ Notification envoyée sur ${d.sent} appareil(s) !`);
      } else {
        toast.error(`Échec: ${d.error || d.message || "0 appareil atteint"}`);
      }
    } catch(e) {
      toast.error("Erreur: " + e.message);
    }
    setSendingTest(false);
  };

  useEffect(() => { runDiagnostic(); }, []);

  const allOk = steps.length > 0 && steps.every(s => s.status === 'ok');
  const hasError = steps.some(s => s.status === 'error');

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4 pb-12">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Diagnostic FCM</h1>
        <Button variant="outline" size="icon" onClick={runDiagnostic} disabled={running}>
          <RefreshCw className={`h-4 w-4 ${running ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Status global */}
      {!running && steps.length > 0 && (
        <div className={`rounded-xl p-3 text-sm font-semibold text-center ${
          allOk ? 'bg-green-50 text-green-700 border border-green-200' :
          hasError ? 'bg-red-50 text-red-700 border border-red-200' :
          'bg-amber-50 text-amber-700 border border-amber-200'
        }`}>
          {allOk ? '✅ Firebase FCM entièrement opérationnel !' :
           hasError ? '❌ Des erreurs ont été détectées - voir détails ci-dessous' :
           '⚠️ Quelques avertissements'}
        </div>
      )}

      {/* Checks */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Checks système</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {steps.length === 0 && (
            <div className="flex items-center gap-2 py-4 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Diagnostic en cours…</span>
            </div>
          )}
          {steps.map(step => (
            <StatusRow key={step.id} label={step.label} status={step.status} detail={step.detail} />
          ))}
        </CardContent>
      </Card>

      {/* Test d'envoi */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Test d'envoi push</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Envoie une vraie notification push Firebase vers votre appareil (fonctionne même app fermée).
          </p>
          <Button
            className="w-full"
            onClick={sendTestNotification}
            disabled={sendingTest || running || !fcmToken || !userEmail}
          >
            {sendingTest
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Envoi en cours…</>
              : "🔔 Envoyer une notification test"
            }
          </Button>
          {!fcmToken && !running && (
            <p className="text-xs text-amber-600 text-center">
              Complétez d'abord les checks ci-dessus (token FCM requis)
            </p>
          )}
        </CardContent>
      </Card>

      {/* Guide correction */}
      {hasError && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 space-y-2">
            <p className="text-sm font-semibold text-amber-800">Guide de correction</p>
            <div className="space-y-1 text-xs text-amber-700">
              <p><strong>FIREBASE_SERVICE_ACCOUNT_JSON invalide ?</strong></p>
              <ol className="list-decimal list-inside space-y-0.5 ml-1">
                <li>Firebase Console → Paramètres du projet</li>
                <li>Onglet "Comptes de service"</li>
                <li>Générer une nouvelle clé privée → télécharger le .json</li>
                <li>Copier le contenu complet et le coller dans le secret</li>
              </ol>
              <p className="mt-2"><strong>VAPID_KEY invalide ?</strong></p>
              <ol className="list-decimal list-inside space-y-0.5 ml-1">
                <li>Firebase Console → Paramètres du projet</li>
                <li>Cloud Messaging → Certificats Web Push</li>
                <li>Copier la clé publique dans VITE_FIREBASE_VAPID_KEY</li>
              </ol>
              <p className="mt-2"><strong>Permission refusée ?</strong></p>
              <p className="ml-1">Cliquez sur 🔒 dans la barre d'adresse → Autoriser les notifications</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}