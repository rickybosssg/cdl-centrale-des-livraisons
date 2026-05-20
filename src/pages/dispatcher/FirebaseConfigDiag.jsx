/**
 * FirebaseConfigDiag — Diagnostic config Firebase côté client + serveur
 * Affiche les vraies valeurs actives et indique ce qui manque
 */
import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { firebaseConfig, vapidKey } from '@/lib/firebaseConfig';
import { CheckCircle2, XCircle, AlertTriangle, Copy, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

const BACKEND_PROJECT = 'cdl-app-4743c';

function Row({ label, value, ok }) {
  const Icon = ok === true ? CheckCircle2 : ok === false ? XCircle : AlertTriangle;
  const color = ok === true ? 'text-green-600' : ok === false ? 'text-red-500' : 'text-amber-500';
  return (
    <div className="flex items-start gap-2 py-2 border-b last:border-0">
      <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${color}`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-muted-foreground">{label}</p>
        <p className={`text-xs font-mono break-all ${ok === false ? 'text-red-600' : 'text-foreground'}`}>{value || '—'}</p>
      </div>
    </div>
  );
}

export default function FirebaseConfigDiag() {
  const [serverDiag, setServerDiag] = useState(null);
  const [loading, setLoading] = useState(false);

  const isReal = (v) => v && !String(v).includes('PLACEHOLDER') && !String(v).includes('example') && v.length > 5;

  const clientRows = [
    { label: 'projectId (client)', value: firebaseConfig.projectId, ok: firebaseConfig.projectId === BACKEND_PROJECT },
    { label: 'apiKey', value: isReal(firebaseConfig.apiKey) ? `${String(firebaseConfig.apiKey).slice(0, 10)}...` : firebaseConfig.apiKey, ok: isReal(firebaseConfig.apiKey) },
    { label: 'messagingSenderId', value: isReal(firebaseConfig.messagingSenderId) ? `${String(firebaseConfig.messagingSenderId).slice(0, 8)}...` : firebaseConfig.messagingSenderId, ok: isReal(firebaseConfig.messagingSenderId) },
    { label: 'appId', value: isReal(firebaseConfig.appId) ? `${String(firebaseConfig.appId).slice(0, 15)}...` : firebaseConfig.appId, ok: isReal(firebaseConfig.appId) },
    { label: 'vapidKey', value: isReal(vapidKey) ? `${String(vapidKey).slice(0, 12)}...` : vapidKey, ok: isReal(vapidKey) },
  ];

  const clientOk = clientRows.every(r => r.ok);
  const projectMatch = firebaseConfig.projectId === BACKEND_PROJECT;

  const runServerDiag = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('testOAuth2Firebase', {});
      setServerDiag(res.data);
    } catch (e) {
      toast.error('Erreur: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { runServerDiag(); }, []);

  const serverProjectId = serverDiag?.firebase?.project_id;
  const apiOk = serverDiag?.api_test?.api_status?.includes('✅');

  return (
    <div className="max-w-xl mx-auto p-4 space-y-4 pb-20">
      <h1 className="text-lg font-bold">Firebase Config Diagnostic</h1>

      {/* Statut global */}
      <div className={`rounded-xl p-3 text-white font-bold text-center text-sm ${
        clientOk && apiOk ? 'bg-green-700' : 'bg-red-600'
      }`}>
        {clientOk && apiOk
          ? '✅ CLIENT + SERVEUR OK — Tokens valides'
          : `❌ ${!projectMatch ? 'PROJET MISMATCH' : !clientOk ? 'CONFIG CLIENT INCOMPLÈTE' : 'API SERVEUR 403'}`}
      </div>

      {/* Cohérence projet */}
      <Card className={projectMatch ? 'border-green-300' : 'border-red-400'}>
        <CardHeader className="pb-1 pt-3 px-4">
          <CardTitle className="text-sm">Cohérence projet Firebase</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Client (firebaseConfig.projectId)</span>
            <span className={`font-mono font-bold ${firebaseConfig.projectId === BACKEND_PROJECT ? 'text-green-700' : 'text-red-600'}`}>
              {firebaseConfig.projectId}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Serveur (FIREBASE_SERVICE_ACCOUNT_JSON)</span>
            <span className="font-mono font-bold text-green-700">{serverProjectId || '...'}</span>
          </div>
          {!projectMatch && (
            <p className="text-red-600 font-bold mt-2">
              ⚠️ MISMATCH ! Tokens générés pour "{firebaseConfig.projectId}" mais backend attend "{BACKEND_PROJECT}".
            </p>
          )}
        </CardContent>
      </Card>

      {/* Config client */}
      <Card className={clientOk ? 'border-green-300' : 'border-red-300'}>
        <CardHeader className="pb-1 pt-3 px-4">
          <CardTitle className="text-sm">Variables VITE_FIREBASE_* (côté client)</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          {clientRows.map((r) => <Row key={r.label} {...r} />)}
          {!clientOk && (
            <div className="mt-3 p-3 bg-amber-50 rounded-lg text-xs space-y-1 text-amber-900">
              <p className="font-bold">Comment corriger :</p>
              <p>1. Aller sur <strong>Firebase Console → Paramètres projet → Vos applications → Config SDK</strong></p>
              <p>2. Copier les valeurs dans <strong>Base44 → Settings → Environment Variables</strong></p>
              <p>3. Ajouter chaque variable avec le nom exact : VITE_FIREBASE_API_KEY, etc.</p>
              <p>4. Redéployer l'app (rebuild APK)</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Serveur */}
      <Card className={apiOk ? 'border-green-300' : 'border-red-300'}>
        <CardHeader className="pb-1 pt-3 px-4 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Service Account serveur</CardTitle>
          <Button size="sm" variant="ghost" onClick={runServerDiag} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          {serverDiag ? (
            <>
              <Row label="project_id" value={serverDiag.firebase?.project_id} ok={serverDiag.firebase?.project_id === BACKEND_PROJECT} />
              <Row label="client_email" value={serverDiag.firebase?.client_email} ok={!!serverDiag.firebase?.client_email} />
              <Row label="OAuth2 token" value={serverDiag.oauth2?.token_generated ? `✅ généré (len=${serverDiag.oauth2.token_length})` : '❌ échec'} ok={serverDiag.oauth2?.token_generated} />
              <Row label="API FCM v1 HTTP" value={`HTTP ${serverDiag.api_test?.http_status} — ${serverDiag.api_test?.api_status}`} ok={apiOk} />
              {!apiOk && serverDiag.api_test?.http_status === 403 && (
                <div className="mt-3 p-3 bg-red-50 rounded-lg text-xs text-red-900 space-y-1">
                  <p className="font-bold">Corriger le 403 :</p>
                  <p>1. <a href="https://console.cloud.google.com/iam-admin/iam" target="_blank" className="underline text-blue-600">console.cloud.google.com/iam-admin/iam</a></p>
                  <p>2. Projet : <strong>{serverDiag.firebase?.project_id}</strong></p>
                  <p>3. Service account : <strong>{serverDiag.firebase?.client_email}</strong></p>
                  <p>4. Ajouter rôle : <strong>Firebase Admin SDK Administrator Service Agent</strong></p>
                  <p>5. Ajouter rôle : <strong>Firebase Cloud Messaging API Admin</strong></p>
                  <p>6. Attendre 2-3 min → retester</p>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Chargement...</p>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="space-y-2">
        <Button className="w-full" onClick={runServerDiag} disabled={loading}>
          {loading ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Test en cours...</> : '🔄 Relancer diagnostic serveur'}
        </Button>
        <Button variant="outline" className="w-full" onClick={() => {
          const info = `Firebase CDL Config:\nproject_id: ${firebaseConfig.projectId}\nbackend: ${BACKEND_PROJECT}\nclient_email: ${serverDiag?.firebase?.client_email || 'N/A'}\napi_status: ${serverDiag?.api_test?.api_status || 'N/A'}`;
          navigator.clipboard.writeText(info);
          toast.success('Copié');
        }}>
          <Copy className="h-4 w-4 mr-2" /> Copier résumé diagnostic
        </Button>
      </div>
    </div>
  );
}