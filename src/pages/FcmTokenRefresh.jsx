/**
 * FcmTokenRefresh — Diagnostic complet + Bouton "Rafraîchir token"
 * Affiche l'état complet du FCM et permet de forcer la récupération du token
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, RefreshCw, CheckCircle2, XCircle, AlertCircle, Loader2, Copy, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

function isNativeAndroid() {
  if (window.location?.protocol === 'capacitor:') return true;
  if (window.Capacitor?.getPlatform?.() === 'android') return true;
  return false;
}

export default function FcmTokenRefresh() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isNative] = useState(() => isNativeAndroid());
  const [tokenData, setTokenData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [permission, setPermission] = useState('unknown');
  const [deviceId, setDeviceId] = useState('unknown');
  const [logs, setLogs] = useState([]);
  const logRef = useRef([]);

  const addLog = (msg, type = 'info') => {
    const ts = new Date().toLocaleTimeString('fr-FR');
    logRef.current.push({ ts, msg, type });
    setLogs([...logRef.current.slice(-20)]);
  };

  useEffect(() => {
    const load = async () => {
      try {
        const me = await base44.auth.me();
        setUser(me);
        addLog(`User: ${me.email}`);

        // Device info (native only)
        if (isNative) {
          setDeviceId('android_native');
          addLog('Device Type: android_native');

          // Check permission
          try {
            const { PushNotifications } = await import('@capacitor/push-notifications');
            const perm = await PushNotifications.checkPermissions();
            setPermission(perm.receive || 'unknown');
            addLog(`Android Permission: ${perm.receive || 'unknown'}`);
          } catch (e) {
            addLog('Could not check permission: ' + e?.message, 'error');
          }
        } else {
          addLog('Platform: Web/PWA (not Android native)');
        }

        // Get current token
        const tokenRes = await base44.functions.invoke('getCurrentFcmToken', { device_type: 'android_native' });
        const td = tokenRes.data;
        setTokenData(td);
        addLog(`Token status: ${td.token ? 'REGISTERED' : 'NONE'}`);
        if (td.token) {
          addLog(`Token: ${td.token.slice(0, 50)}...`);
          addLog(`Token ID: ${td.token_id}`);
          addLog(`Last used: ${td.last_used}`);
        }
      } catch (e) {
        addLog('Load error: ' + e?.message, 'error');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [isNative]);

  const handleRefreshToken = async () => {
    setRefreshing(true);
    addLog('▶ Refresh token START');

    try {
      if (!isNative) {
        addLog('Not on Android native platform', 'warn');
        setRefreshing(false);
        return;
      }

      let PushNotifications;
      try {
        const mod = await import('@capacitor/push-notifications');
        PushNotifications = mod.PushNotifications;
        addLog('✅ Plugin loaded');
      } catch (e) {
        addLog('❌ Plugin unavailable: ' + e?.message, 'error');
        setRefreshing(false);
        return;
      }

      let token = null;
      const tokenPromise = new Promise((resolve) => {
        (async () => {
          try {
            const handle = await PushNotifications.addListener('registration', (data) => {
              token = data?.value;
              addLog(`✅ registration callback: token received (len=${token?.length})`);
              resolve(token);
            });
            const errHandle = await PushNotifications.addListener('registrationError', (err) => {
              addLog(`❌ registrationError: ${JSON.stringify(err)}`, 'error');
              resolve(null);
            });
            addLog('Listeners attached, calling register()...');
            await PushNotifications.register();
            // Timeout if no callback in 15s
            setTimeout(() => {
              resolve(token);
            }, 15000);
          } catch (e) {
            addLog('Error in refresh: ' + e?.message, 'error');
            resolve(null);
          }
        })();
      });

      const receivedToken = await tokenPromise;

      if (!receivedToken) {
        addLog('❌ No token received after register()', 'error');
        setRefreshing(false);
        toast.error('No token received');
        return;
      }

      addLog(`🔑 Token ready: ${receivedToken.slice(0, 50)}...`);

      // Register/cleanup
      addLog('Registering token via cleanupAndRegisterFcmToken...');
      const cleanupRes = await base44.functions.invoke('cleanupAndRegisterFcmToken', {
        token: receivedToken,
        device_type: 'android_native',
        device_id: deviceId,
      });

      const cleanupData = cleanupRes.data;
      if (cleanupData?.success) {
        addLog(`✅ Token registered: ${cleanupData.token_id}`);
        if (cleanupData.old_token_removed) {
          addLog(`🔄 Old token removed: ${cleanupData.old_token_id}`);
        }

        // Reload token data
        const tokenRes = await base44.functions.invoke('getCurrentFcmToken', { device_type: 'android_native' });
        setTokenData(tokenRes.data);
        addLog('✅ Refresh COMPLETE');
        toast.success('Token refreshed successfully');
      } else {
        addLog(`❌ Token registration failed: ${cleanupData?.error}`, 'error');
      }
    } catch (e) {
      addLog(`❌ Error: ${e?.message}`, 'error');
      toast.error('Error: ' + e?.message);
    } finally {
      setRefreshing(false);
    }
  };

  const copyToken = () => {
    if (tokenData?.token) {
      navigator.clipboard?.writeText(tokenData.token);
      toast.success('Token copied');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const hasToken = !!tokenData?.token;
  const permGranted = permission === 'granted';

  return (
    <div className="space-y-4 pb-20 max-w-lg mx-auto px-2">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">🔔 FCM Token Manager</h1>
          <p className="text-xs text-muted-foreground">Manage and refresh FCM tokens</p>
        </div>
      </div>

      {/* Platform Info */}
      {isNative && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-3 space-y-1">
            <div className="flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-blue-600" />
              <span className="text-xs font-bold text-blue-900">Android Native (Capacitor)</span>
            </div>
            <p className="text-xs text-blue-700">Device ID: <strong>{deviceId}</strong></p>
          </CardContent>
        </Card>
      )}

      {/* Status Cards */}
      <div className="grid grid-cols-2 gap-2">
        {/* Token */}
        <Card className={hasToken ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}>
          <CardContent className="p-3 text-center space-y-1">
            <div className="flex items-center justify-center">
              {hasToken ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
            </div>
            <p className={`text-sm font-bold ${hasToken ? 'text-green-800' : 'text-red-800'}`}>
              {hasToken ? 'Token' : 'No Token'}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {tokenData?.all_tokens_count || 0} total
            </p>
          </CardContent>
        </Card>

        {/* Permission */}
        <Card className={permGranted ? 'border-green-300 bg-green-50' : 'border-amber-300 bg-amber-50'}>
          <CardContent className="p-3 text-center space-y-1">
            <div className="flex items-center justify-center">
              {permGranted ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-amber-600" />
              )}
            </div>
            <p className={`text-sm font-bold ${permGranted ? 'text-green-800' : 'text-amber-800'}`}>
              {permGranted ? 'Permission' : 'Pending'}
            </p>
            <p className="text-[10px] text-muted-foreground">{permission}</p>
          </CardContent>
        </Card>
      </div>

      {/* Token Display */}
      {hasToken && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Current Token</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="bg-slate-100 rounded-lg p-2 break-all font-mono text-[10px] text-slate-700">
              {tokenData.token.slice(0, 100)}...
            </div>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p>ID: {tokenData.token_id}</p>
              <p>Registered: {new Date(tokenData.registered_at).toLocaleString()}</p>
              <p>Last used: {new Date(tokenData.last_used).toLocaleString()}</p>
            </div>
            <Button size="sm" variant="outline" onClick={copyToken} className="w-full text-xs">
              <Copy className="h-3 w-3 mr-1" /> Copy Token
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Refresh Button */}
      {isNative && (
        <Button
          onClick={handleRefreshToken}
          disabled={refreshing}
          className="w-full"
          size="lg"
        >
          {refreshing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Refreshing...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              Force Refresh Token
            </>
          )}
        </Button>
      )}

      {/* Logs */}
      {logs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Live Logs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-slate-900 rounded-lg p-3 max-h-48 overflow-y-auto space-y-0.5 font-mono text-[10px]">
              {logs.map((l, i) => (
                <p
                  key={i}
                  className={
                    l.type === 'error'
                      ? 'text-red-400'
                      : l.type === 'warn'
                      ? 'text-amber-400'
                      : l.type === 'info'
                      ? 'text-blue-400'
                      : 'text-green-400'
                  }
                >
                  <span className="text-slate-500">{l.ts}</span> {l.msg}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Guide */}
      <Card className="bg-amber-50 border-amber-200">
        <CardContent className="p-3 text-xs text-amber-800 space-y-1.5">
          <p className="font-bold">📋 Checklist</p>
          <ul className="space-y-1 ml-2 list-disc">
            <li>Platform: {isNative ? '✅ Android Native' : '⚠️ Web (not supported)'}</li>
            <li>Permission: {permGranted ? '✅ Granted' : '⚠️ ' + permission}</li>
            <li>Token: {hasToken ? '✅ Registered' : '❌ None'}</li>
          </ul>
          <p className="font-bold mt-2">If no token, tap "Force Refresh Token"</p>
        </CardContent>
      </Card>
    </div>
  );
}