/**
 * FcmDiagnostic — Diagnostic FCM Web Push (APK Base44)
 *
 * L'APK Base44 est une WebView distante → window.Capacitor est absent (normal).
 * On utilise Firebase Messaging Web (VAPID) qui fonctionne dans toute WebView Android.
 */
import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

export default function FcmDiagnostic() {
  const [logs, setLogs] = useState([]);
  const [running, setRunning] = useState(false);
  const [tokenSaved, setTokenSaved] = useState(false);
  const [envInfo, setEnvInfo] = useState(null);

  const addLog = (msg, type = 'info') => {
    const ts = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { msg, type, ts }]);
  };

  useEffect(() => {
    const ua = navigator.userAgent;
    setEnvInfo({
      ua: ua.substring(0, 120),
      isAndroid: /Android/i.test(ua),
      isWebView: /wv\)/i.test(ua) || /WebView/i.test(ua),
      hasCapacitor: !!window.Capacitor,
      isNative: window.Capacitor?.isNativePlatform?.() ?? false,
      url: window.location.href.substring(0, 60),
      notifSupport: 'Notification' in window,
      notifPerm: typeof Notification !== 'undefined' ? Notification.permission : 'N/A',
      swSupport: 'serviceWorker' in navigator,
    });
  }, []);

  const runDiagnostic = async () => {
    setRunning(true);
    setLogs([]);
    setTokenSaved(false);

    addLog('═══════════════════════════', 'info');
    addLog('🚀 DIAGNOSTIC FCM WEB PUSH', 'info');
    addLog('═══════════════════════════', 'info');

    // ── ENVIRONNEMENT ────────────────────────────────────────────────────────
    addLog('--- ENVIRONNEMENT ---', 'info');
    const ua = navigator.userAgent;
    const isAndroid = /Android/i.test(ua);
    const isWebView = /wv\)/i.test(ua) || /WebView/i.test(ua);
    const hasCapacitor = !!window.Capacitor;

    addLog(`Android UA: ${isAndroid ? '✅' : '❌'}`, isAndroid ? 'success' : 'warn');
    addLog(`WebView: ${isWebView ? '✅' : '⚠️ non détecté'}`, 'info');
    addLog(`window.Capacitor: ${hasCapacitor ? '⚠️ présent' : '✅ absent (normal APK Base44)'}`, hasCapacitor ? 'warn' : 'success');
    addLog('ℹ️ APK Base44 = WebView distante → Capacitor absent = NORMAL', 'info');
    addLog('ℹ️ Solution: Firebase Messaging Web (VAPID) fonctionne dans toute WebView', 'info');

    // ── NOTIFICATION API ─────────────────────────────────────────────────────
    addLog('--- PERMISSION NOTIFICATION ---', 'info');
    if (!('Notification' in window)) {
      addLog('❌ API Notification non disponible', 'error');
      setRunning(false);
      return;
    }
    addLog(`Permission actuelle: ${Notification.permission}`, Notification.permission === 'granted' ? 'success' : 'warn');

    // ── SERVICE WORKER ───────────────────────────────────────────────────────
    addLog('--- SERVICE WORKER ---', 'info');
    if (!('serviceWorker' in navigator)) {
      addLog('❌ Service Worker non supporté', 'error');
      setRunning(false);
      return;
    }
    addLog('✅ Service Worker supporté', 'success');

    // ── FCM WEB PUSH ─────────────────────────────────────────────────────────
    addLog('--- FCM WEB PUSH (Firebase Messaging) ---', 'info');
    addLog('Appel requestWebPushToken...', 'info');

    try {
      const { requestWebPushToken } = await import('@/lib/webPush');
      const { token, permission, error } = await requestWebPushToken();

      addLog(`Permission: ${permission}`, permission === 'granted' ? 'success' : 'error');

      if (error) {
        addLog(`⚠️ Erreur getToken: ${error}`, 'error');
        addLog('💡 Vérifier: VITE_FIREBASE_* dans les secrets', 'warn');
        addLog('💡 Vérifier: VITE_FIREBASE_VAPID_KEY correcte', 'warn');
        addLog('💡 Vérifier: domaine autorisé dans Firebase Console', 'warn');
        setRunning(false);
        return;
      }

      if (!token) {
        addLog('❌ Token non obtenu (permission refusée?)', 'error');
        setRunning(false);
        return;
      }

      addLog(`✅ TOKEN FCM OBTENU! (${token.length} chars)`, 'success');
      addLog(`Token: ${token.substring(0, 50)}...`, 'success');

      // Sauvegarder en BDD
      addLog('Sauvegarde token en BDD...', 'info');
      try {
        const me = await base44.auth.me();
        if (me?.email) {
          const res = await base44.functions.invoke('saveFcmToken', {
            token,
            userId: me.id,
            userEmail: me.email,
            userRole: me.role,
          });
          addLog(`✅ Token sauvegardé — id: ${res.data?.token_id}`, 'success');
          addLog(`   action: ${res.data?.action}`, 'success');
          setTokenSaved(true);
        } else {
          addLog('⚠️ Non connecté — token non sauvegardé', 'warn');
        }
      } catch (saveErr) {
        addLog(`❌ saveFcmToken: ${saveErr.message}`, 'error');
      }

      addLog('═══════════════════════════', 'success');
      addLog('✅ FCM WEB PUSH OPÉRATIONNEL', 'success');
      addLog('Les notifications fonctionnent dans l\'APK Base44!', 'success');
      addLog('═══════════════════════════', 'success');

    } catch (err) {
      addLog(`❌ Erreur: ${err.message}`, 'error');
    }

    setRunning(false);
  };

  const colorMap = { info: '#e0f0ff', success: '#d4edda', warn: '#fff3cd', error: '#f8d7da' };
  const textMap = { info: '#1a5276', success: '#155724', warn: '#856404', error: '#721c24' };

  return (
    <div style={{ fontFamily: 'monospace', padding: '16px', maxWidth: '100%', background: '#0d1117', minHeight: '100vh', color: '#e6edf3' }}>
      <h1 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px', color: '#58a6ff' }}>
        🔬 CDL FCM Web Push Diagnostic
      </h1>

      {/* Badge environnement */}
      {envInfo && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{
            padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold',
            background: envInfo.isAndroid ? '#238636' : '#6e40c9', color: 'white', display: 'inline-block', marginBottom: '8px'
          }}>
            {envInfo.isAndroid ? '✅ Android' : '🌐 Web'} — FCM Web Push
          </div>

          {/* Note APK Base44 */}
          <div style={{ padding: '8px 12px', borderRadius: '8px', background: '#161b22', border: '1px solid #30363d', fontSize: '11px', marginBottom: '8px' }}>
            <p style={{ color: '#58a6ff', fontWeight: 'bold', marginBottom: '4px' }}>ℹ️ Architecture APK Base44</p>
            <p style={{ color: '#8b949e' }}>L'APK charge depuis une URL distante → window.Capacitor absent = <span style={{ color: '#3fb950' }}>NORMAL</span></p>
            <p style={{ color: '#8b949e' }}>Solution: <span style={{ color: '#3fb950' }}>Firebase Messaging Web (VAPID)</span> fonctionne dans toute WebView</p>
          </div>

          {/* Info rapide */}
          <div style={{ background: '#161b22', borderRadius: '8px', padding: '10px', border: '1px solid #30363d', fontSize: '11px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
              {[
                ['Android', String(envInfo.isAndroid)],
                ['WebView', String(envInfo.isWebView)],
                ['Capacitor', envInfo.hasCapacitor ? '⚠️ présent' : '✅ absent (normal)'],
                ['Notification API', String(envInfo.notifSupport)],
                ['Permission', envInfo.notifPerm],
                ['Service Worker', String(envInfo.swSupport)],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', gap: '4px' }}>
                  <span style={{ color: '#8b949e' }}>{k}:</span>
                  <span style={{ color: v === 'true' || v.includes('✅') ? '#3fb950' : v === 'false' ? '#f85149' : '#e6edf3' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Statut token */}
      {tokenSaved && (
        <div style={{ padding: '8px 12px', borderRadius: '8px', background: '#0d3321', border: '1px solid #238636', fontSize: '12px', marginBottom: '12px' }}>
          <p style={{ color: '#3fb950', fontWeight: 'bold' }}>✅ Token FCM sauvegardé en BDD — Prêt à recevoir des notifications !</p>
        </div>
      )}

      <button
        onClick={runDiagnostic}
        disabled={running}
        style={{
          width: '100%', padding: '14px',
          background: running ? '#21262d' : '#238636',
          color: running ? '#8b949e' : 'white',
          border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 'bold',
          cursor: running ? 'not-allowed' : 'pointer', marginBottom: '16px'
        }}
      >
        {running ? '⏳ Diagnostic en cours...' : '▶ Lancer diagnostic FCM Web Push'}
      </button>

      <div style={{ background: '#161b22', borderRadius: '8px', border: '1px solid #30363d', overflow: 'hidden' }}>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #30363d', fontSize: '11px', color: '#8b949e' }}>
          LOGS ({logs.length})
        </div>
        <div style={{ maxHeight: '55vh', overflowY: 'auto', padding: '8px' }}>
          {logs.length === 0 && (
            <p style={{ fontSize: '12px', color: '#8b949e', padding: '8px', textAlign: 'center' }}>
              Appuie sur "Lancer diagnostic" pour commencer
            </p>
          )}
          {logs.map((log, i) => (
            <div key={i} style={{
              fontSize: '11px', padding: '3px 8px', marginBottom: '2px', borderRadius: '4px',
              background: colorMap[log.type], color: textMap[log.type], wordBreak: 'break-all'
            }}>
              <span style={{ opacity: 0.6, marginRight: '6px' }}>{log.ts}</span>
              {log.msg}
            </div>
          ))}
        </div>
      </div>

      <p style={{ fontSize: '10px', color: '#8b949e', marginTop: '12px', textAlign: 'center' }}>
        /fcm-diagnostic — CDL FCM Web Push v3
      </p>
    </div>
  );
}