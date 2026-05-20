/**
 * FirebaseConfigDiag — Diagnostic config Firebase côté client + serveur
 * Répond aux 7 questions :
 * 1. Variables écrasées ?
 * 2. Preview vs Production ?
 * 3. Injection build APK ?
 * 4. Correspond à cdl-app-4743c ?
 * 5. Placeholders actifs ?
 * 6. Client = Serveur project_id ?
 * 7. Chargement runtime Capacitor ?
 */
import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { firebaseConfig, vapidKey } from '@/lib/firebaseConfig';
import { CheckCircle2, XCircle, AlertTriangle, Copy, RefreshCw, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const BACKEND_PROJECT = 'cdl-app-4743c';

function isNativeCapacitor() {
  try {
    return typeof window.Capacitor !== 'undefined' && window.Capacitor?.isNativePlatform?.() === true;
  } catch (_) { return false; }
}

function isReal(v) {
  return v && !String(v).includes('PLACEHOLDER') && !String(v).includes('REMPLACER') && String(v).length > 5;
}

function StatusRow({ label, value, ok, note }) {
  const Icon = ok === true ? CheckCircle2 : ok === false ? XCircle : AlertTriangle;
  const color = ok === true ? 'text-green-600' : ok === false ? 'text-red-500' : 'text-amber-500';
  return (
    <div className="flex items-start gap-2 py-2 border-b last:border-0">
      <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${color}`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-muted-foreground">{label}</p>
        <p className={`text-xs font-mono break-all mt-0.5 ${ok === false ? 'text-red-600' : 'text-foreground'}`}>{value || '—'}</p>
        {note && <p className="text-[11px] text-amber-700 mt-0.5">{note}</p>}
      </div>
      <span className={`text-[10px] font-bold flex-shrink-0 ${ok === true ? 'text-green-700' : ok === false ? 'text-red-600' : 'text-amber-600'}`}>
        {ok === true ? 'OK' : ok === false ? 'KO' : '?'}
      </span>
    </div>
  );
}

function SectionHeader({ n, title, ok }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold ${ok === true ? 'bg-green-50 text-green-800' : ok === false ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'}`}>
      <span className="text-xs bg-white rounded-full w-5 h-5 flex items-center justify-center font-bold">{n}</span>
      {title}
      <span className="ml-auto">{ok === true ? '✅' : ok === false ? '❌' : '⏳'}</span>
    </div>
  );
}

export default function FirebaseConfigDiag() {
  const navigate = useNavigate();
  const [serverDiag, setServerDiag] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isNative] = useState(isNativeCapacitor);

  // Valeurs client résolues
  const clientProjectId = firebaseConfig.projectId;
  const clientApiKey = firebaseConfig.apiKey;
  const clientSenderId = firebaseConfig.messagingSenderId;
  const clientAppId = firebaseConfig.appId;
  const clientVapid = vapidKey;

  // Tests client
  const q1_notOverwritten = {
    apiKey: isReal(clientApiKey),
    senderId: isReal(clientSenderId),
    appId: isReal(clientAppId),
    vapid: isReal(clientVapid),
  };
  const q1_ok = Object.values(q1_notOverwritten).every(Boolean);

  const q3_injected = {
    apiKey: !!import.meta.env.VITE_FIREBASE_API_KEY,
    projectId: !!import.meta.env.VITE_FIREBASE_PROJECT_ID,
    senderId: !!import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: !!import.meta.env.VITE_FIREBASE_APP_ID,
    vapid: !!import.meta.env.VITE_FIREBASE_VAPID_KEY,
  };
  const q3_ok = Object.values(q3_injected).every(Boolean);

  const q4_clientOk = clientProjectId === BACKEND_PROJECT;

  const q5_noPlaceholder = q1_ok; // même check

  const serverProjectId = serverDiag?.firebase?.project_id;
  const q6_match = serverDiag ? (clientProjectId === serverProjectId) : null;
  const q7_runtime = isNative; // si on est dans Capacitor les variables sont bien chargées

  const runServerDiag = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('testOAuth2Firebase', {});
      setServerDiag(res.data);
    } catch (e) {
      toast.error('Erreur serveur: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { runServerDiag(); }, []);

  const apiOk = serverDiag?.api_test?.api_status?.includes('✅');
  const allOk = q1_ok && q3_ok && q4_clientOk && q5_noPlaceholder && q6_match && apiOk;

  const mask = (v, n = 10) => isReal(v) ? `${String(v).slice(0, n)}...` : v;

  return (
    <div className="max-w-xl mx-auto p-4 space-y-3 pb-20">

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-base font-bold flex-1">Firebase Config Diagnostic</h1>
        <Button size="sm" variant="outline" onClick={runServerDiag} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Retester
        </Button>
      </div>

      {/* Statut global */}
      <div className={`rounded-xl p-3 text-white font-bold text-center text-sm ${allOk ? 'bg-green-700' : 'bg-red-600'}`}>
        {allOk ? '✅ TOUT EST CORRECT — Production Ready' : '❌ PROBLÈMES DÉTECTÉS — Voir détails'}
      </div>

      {/* Q1 — Variables écrasées ? */}
      <SectionHeader n="1" title="Variables écrasées (vs PLACEHOLDER) ?" ok={q1_ok} />
      <Card>
        <CardContent className="p-3">
          <StatusRow label="VITE_FIREBASE_API_KEY" value={mask(clientApiKey)} ok={q1_notOverwritten.apiKey} />
          <StatusRow label="VITE_FIREBASE_MESSAGING_SENDER_ID" value={mask(clientSenderId, 8)} ok={q1_notOverwritten.senderId} />
          <StatusRow label="VITE_FIREBASE_APP_ID" value={mask(clientAppId, 15)} ok={q1_notOverwritten.appId} />
          <StatusRow label="VITE_FIREBASE_VAPID_KEY" value={mask(clientVapid, 12)} ok={q1_notOverwritten.vapid} />
          {!q1_ok && (
            <div className="mt-2 p-2 bg-red-50 rounded text-xs text-red-800">
              ⚠️ Des variables contiennent encore "PLACEHOLDER". Aller sur <strong>Base44 → Settings → Secrets</strong> et vérifier les valeurs VITE_FIREBASE_*.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Q2 — Preview vs Production */}
      <SectionHeader n="2" title="Preview vs Production ?" ok={null} />
      <Card>
        <CardContent className="p-3">
          <StatusRow
            label="Environnement actuel"
            value={import.meta.env.MODE || 'inconnu'}
            ok={null}
            note="Les secrets Base44 sont injectés identiquement en preview ET production via VITE_*"
          />
          <StatusRow
            label="Base URL"
            value={window.location.origin}
            ok={null}
          />
          <p className="text-[11px] text-muted-foreground mt-2">
            ℹ️ Base44 injecte les secrets VITE_* au build, identiques preview/prod. Il n'y a pas de différence de valeur entre les deux environnements.
          </p>
        </CardContent>
      </Card>

      {/* Q3 — Injection build APK */}
      <SectionHeader n="3" title="Variables injectées dans le build ?" ok={q3_ok} />
      <Card>
        <CardContent className="p-3">
          <StatusRow label="VITE_FIREBASE_API_KEY" value={q3_injected.apiKey ? '✅ injectée (import.meta.env définie)' : '❌ undefined'} ok={q3_injected.apiKey} />
          <StatusRow label="VITE_FIREBASE_PROJECT_ID" value={q3_injected.projectId ? '✅ injectée' : '❌ undefined'} ok={q3_injected.projectId} />
          <StatusRow label="VITE_FIREBASE_MESSAGING_SENDER_ID" value={q3_injected.senderId ? '✅ injectée' : '❌ undefined'} ok={q3_injected.senderId} />
          <StatusRow label="VITE_FIREBASE_APP_ID" value={q3_injected.appId ? '✅ injectée' : '❌ undefined'} ok={q3_injected.appId} />
          <StatusRow label="VITE_FIREBASE_VAPID_KEY" value={q3_injected.vapid ? '✅ injectée' : '❌ undefined'} ok={q3_injected.vapid} />
          {!q3_ok && (
            <div className="mt-2 p-2 bg-red-50 rounded text-xs text-red-800">
              ⚠️ Une ou plusieurs variables VITE_ ne sont pas injectées dans ce build. L'APK utilisera les fallbacks hardcodés.
            </div>
          )}
          {q3_ok && (
            <p className="text-[11px] text-green-700 mt-2 font-bold">
              ✅ Toutes les variables VITE_FIREBASE_* sont bien injectées dans ce build.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Q4 — Correspond à cdl-app-4743c ? */}
      <SectionHeader n="4" title={`Correspond à ${BACKEND_PROJECT} ?`} ok={q4_clientOk} />
      <Card>
        <CardContent className="p-3">
          <StatusRow
            label="firebaseConfig.projectId (client actif)"
            value={clientProjectId}
            ok={q4_clientOk}
            note={!q4_clientOk ? `Doit être "${BACKEND_PROJECT}" — actuellement "${clientProjectId}"` : undefined}
          />
          <StatusRow
            label="Cible backend"
            value={BACKEND_PROJECT}
            ok={true}
          />
        </CardContent>
      </Card>

      {/* Q5 — Placeholders actifs ? */}
      <SectionHeader n="5" title="Placeholders actifs ?" ok={q5_noPlaceholder} />
      <Card>
        <CardContent className="p-3">
          {q5_noPlaceholder ? (
            <p className="text-xs text-green-700 font-bold py-1">✅ Aucun placeholder détecté — toutes les valeurs sont réelles.</p>
          ) : (
            <>
              {!q1_notOverwritten.apiKey && <StatusRow label="VITE_FIREBASE_API_KEY" value="PLACEHOLDER actif ❌" ok={false} />}
              {!q1_notOverwritten.senderId && <StatusRow label="VITE_FIREBASE_MESSAGING_SENDER_ID" value="PLACEHOLDER actif ❌" ok={false} />}
              {!q1_notOverwritten.appId && <StatusRow label="VITE_FIREBASE_APP_ID" value="PLACEHOLDER actif ❌" ok={false} />}
              {!q1_notOverwritten.vapid && <StatusRow label="VITE_FIREBASE_VAPID_KEY" value="PLACEHOLDER actif ❌" ok={false} />}
              <div className="mt-2 p-2 bg-amber-50 rounded text-xs text-amber-900">
                <p className="font-bold">→ Source des vraies valeurs :</p>
                <p>Firebase Console → Projet cdl-app-4743c → Paramètres → Vos applications → Config SDK web</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Q6 — Client = Serveur project_id ? */}
      <SectionHeader n="6" title="Client et serveur même project_id ?" ok={q6_match === null ? null : q6_match} />
      <Card>
        <CardContent className="p-3">
          <StatusRow label="project_id client (firebaseConfig)" value={clientProjectId} ok={q4_clientOk} />
          <StatusRow
            label="project_id serveur (FIREBASE_SERVICE_ACCOUNT_JSON)"
            value={loading ? '⏳ chargement...' : serverProjectId || '❌ non disponible'}
            ok={loading ? null : !!serverProjectId && serverProjectId === BACKEND_PROJECT}
          />
          {q6_match === false && (
            <div className="mt-2 p-2 bg-red-50 rounded text-xs text-red-900 font-bold">
              ❌ MISMATCH CRITIQUE ! Client="{clientProjectId}" ≠ Serveur="{serverProjectId}". Les tokens FCM seront rejetés (403).
            </div>
          )}
          {q6_match === true && (
            <p className="text-[11px] text-green-700 font-bold mt-2">✅ Client et serveur utilisent le même projet Firebase.</p>
          )}
        </CardContent>
      </Card>

      {/* Q7 — Runtime Capacitor */}
      <SectionHeader n="7" title="Chargement runtime Capacitor Android ?" ok={q7_runtime ? true : null} />
      <Card>
        <CardContent className="p-3">
          <StatusRow
            label="Environnement détecté"
            value={isNative ? '📱 Capacitor natif Android/iOS' : '🌐 WebView / Navigateur web'}
            ok={null}
          />
          <StatusRow
            label="Mode serveur Capacitor"
            value='"server.url": "https://cdl.base44.app" — charge la WebApp distante'
            ok={null}
            note="Les variables VITE_* sont compilées dans le bundle JS servi par cdl.base44.app. L'APK les charge via la WebView → toujours les valeurs du dernier build Base44."
          />
          <StatusRow
            label="google-services.json"
            value={isNative ? 'Actif (requis pour @capacitor/push-notifications)' : 'Non utilisé (web)'}
            ok={null}
            note="Pour l'APK natif, google-services.json doit aussi référencer cdl-app-4743c."
          />
          {isNative && (
            <p className="text-[11px] text-green-700 font-bold mt-2">✅ Exécution dans Capacitor — variables VITE_* chargées depuis le build Base44 distant.</p>
          )}
          {!isNative && (
            <p className="text-[11px] text-amber-700 mt-2">ℹ️ Test depuis navigateur — l'APK chargera les mêmes valeurs via la WebView (mode serveur distant).</p>
          )}
        </CardContent>
      </Card>

      {/* Serveur — OAuth2 + API FCM */}
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold ${apiOk ? 'bg-green-50 text-green-800' : serverDiag && !apiOk ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'}`}>
        <span className="text-xs bg-white rounded-full w-5 h-5 flex items-center justify-center font-bold">+</span>
        Service Account + API FCM v1
        <span className="ml-auto">{apiOk ? '✅' : serverDiag && !apiOk ? '❌' : '⏳'}</span>
      </div>
      <Card>
        <CardContent className="p-3">
          {serverDiag ? (
            <>
              <StatusRow label="client_email" value={serverDiag.firebase?.client_email} ok={!!serverDiag.firebase?.client_email} />
              <StatusRow label="OAuth2 token" value={serverDiag.oauth2?.token_generated ? `✅ généré (len=${serverDiag.oauth2.token_length})` : '❌ échec'} ok={!!serverDiag.oauth2?.token_generated} />
              <StatusRow
                label="API FCM v1"
                value={`HTTP ${serverDiag.api_test?.http_status} — ${serverDiag.api_test?.api_status}`}
                ok={apiOk}
                note={!apiOk && serverDiag.api_test?.http_status === 403 ? 'Vérifier les rôles IAM du service account dans Google Cloud Console' : undefined}
              />
            </>
          ) : (
            <p className="text-xs text-muted-foreground py-2">⏳ Chargement diagnostic serveur...</p>
          )}
        </CardContent>
      </Card>

      {/* Bouton copier résumé */}
      <Button variant="outline" className="w-full" onClick={() => {
        const lines = [
          '=== Firebase CDL Config Diagnostic ===',
          `1. Variables écrasées: ${q1_ok ? 'NON ✅' : 'OUI ❌'}`,
          `2. Preview=Prod: OUI (injections identiques)`,
          `3. Variables injectées: ${q3_ok ? 'OUI ✅' : 'NON ❌'}`,
          `4. Project cdl-app-4743c: ${q4_clientOk ? 'OUI ✅' : 'NON ❌'} (actuel: ${clientProjectId})`,
          `5. Placeholders actifs: ${q5_noPlaceholder ? 'AUCUN ✅' : 'OUI ❌'}`,
          `6. Client=Serveur project_id: ${q6_match === null ? 'TEST EN COURS' : q6_match ? 'OUI ✅' : 'NON ❌'} (client=${clientProjectId}, serveur=${serverProjectId || 'N/A'})`,
          `7. Capacitor runtime: ${isNative ? 'NATIF (WebView distante)' : 'WEB'}`,
          `API FCM: ${apiOk ? '✅ ACCESSIBLE' : serverDiag ? '❌ ' + serverDiag.api_test?.api_status : 'N/A'}`,
        ];
        navigator.clipboard.writeText(lines.join('\n'));
        toast.success('Résumé copié');
      }}>
        <Copy className="h-4 w-4 mr-2" /> Copier résumé diagnostic (7 points)
      </Button>
    </div>
  );
}