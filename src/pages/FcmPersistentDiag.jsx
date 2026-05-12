/**
 * FcmPersistentDiag — Diagnostic FCM permanent
 * Affiche : token appareil, token BDD, état actif, dernier push, firebase_message_id
 * Accessible via /fcm-persistent-diag
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { isNativeApp, requestNativePushToken } from '@/lib/nativePush';
import { saveFcmTokenRemote } from '@/components/FcmBootstrap';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, RefreshCw, ShieldCheck, ShieldX, AlertTriangle, Zap, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

function StatusPill({ ok, label }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      {label}
    </span>
  );
}

function InfoRow({ label, value, mono = false }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 border-b last:border-b-0">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</span>
      <span className={`text-sm break-all ${mono ? 'font-mono text-xs' : 'font-medium'}`}>{value ?? '—'}</span>
    </div>
  );
}

export default function FcmPersistentDiag() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [deviceToken, setDeviceToken] = useState(null);
  const [bddTokens, setBddTokens] = useState([]);
  const [lastPush, setLastPush] = useState(null);
  const [lastSave, setLastSave] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);
  const native = isNativeApp();

  const loadDiag = useCallback(async () => {
    setLoading(true);
    try {
      const me = await base44.auth.me();
      setUser(me);

      // Token local stocké par FcmBootstrap
      try {
        setDeviceToken(localStorage.getItem('cdl_fcm_current_token'));
        setLastSave(localStorage.getItem('cdl_fcm_last_save'));
        setLastPush(localStorage.getItem('cdl_last_push_received'));
      } catch (_) {}

      // Tokens en BDD
      if (me?.email) {
        const tokens = await base44.entities.FcmToken.filter({ user_email: me.email });
        setBddTokens(tokens || []);
      }
    } catch (e) {
      toast.error('Erreur chargement: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDiag(); }, [loadDiag]);

  const handleAutoRecovery = async () => {
    if (!user?.email) return;
    setRecovering(true);
    console.log(`[FCM_AUTO_RECOVERY_START] Manuel depuis diagnostic | user=${user.email}`);
    try {
      let token = null;
      if (native) {
        toast.info('Régénération du token FCM...');
        token = await requestNativePushToken();
      } else {
        const { requestWebPushToken } = await import('@/lib/webPush');
        const res = await requestWebPushToken();
        token = res?.token;
      }

      if (!token) {
        console.error('[FCM_AUTO_RECOVERY_START] Aucun token obtenu');
        toast.error('Token non obtenu — vérifiez les permissions');
        return;
      }

      console.log(`[FCM_TOKEN_REGENERATED] token obtenu | user=${user.email}`);
      const result = await saveFcmTokenRemote({
        user_email: user.email,
        token,
        device_type: native ? 'android_native' : 'web',
      });

      if (result?.success) {
        console.log(`[FCM_TOKEN_SAVED] action=${result.action} | id=${result.token_id}`);
        console.log(`[FCM_AUTO_RECOVERY_SUCCESS] user=${user.email}`);
        try { localStorage.setItem('cdl_fcm_current_token', token.slice(0, 60)); } catch (_) {}
        try { localStorage.setItem('cdl_fcm_last_save', new Date().toISOString()); } catch (_) {}
        toast.success('✅ Token FCM régénéré et sauvegardé en BDD !');
        await loadDiag();
      } else {
        toast.error('Échec sauvegarde: ' + (result?.error || 'inconnu'));
      }
    } catch (e) {
      toast.error('Erreur recovery: ' + e.message);
    } finally {
      setRecovering(false);
    }
  };

  const handleDeleteAll = async () => {
    if (!window.confirm('Supprimer tous les tokens BDD de ce compte ?')) return;
    for (const t of bddTokens) {
      await base44.entities.FcmToken.delete(t.id).catch(() => {});
    }
    toast.success('Tokens supprimés');
    await loadDiag();
  };

  const activeTokens = bddTokens.filter(t => t.is_active);
  const tokenAlert = activeTokens.length === 0;

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4 pb-16 max-w-lg mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">Diagnostic FCM</h1>
          <p className="text-xs text-muted-foreground">Token · BDD · Push · Recovery</p>
        </div>
        <Button variant="outline" size="icon" onClick={loadDiag}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Alerte critique si aucun token actif */}
      {tokenAlert && (
        <div className="rounded-2xl border-2 border-red-400 bg-red-50 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldX className="h-5 w-5 text-red-600 flex-shrink-0" />
            <p className="font-bold text-red-800">⚠️ AUCUN TOKEN FCM ACTIF</p>
          </div>
          <p className="text-xs text-red-700">
            Les push notifications sont impossibles. Aucune recharge Bedou ni alerte ne sera reçue sur cet appareil.
          </p>
          <Button
            className="w-full bg-red-600 hover:bg-red-700 text-white"
            onClick={handleAutoRecovery}
            disabled={recovering}
          >
            {recovering
              ? <><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />Régénération...</>
              : <><Zap className="h-4 w-4 mr-2" />Régénérer le token maintenant</>
            }
          </Button>
        </div>
      )}

      {/* Statut général */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            {activeTokens.length > 0
              ? <ShieldCheck className="h-4 w-4 text-green-600" />
              : <ShieldX className="h-4 w-4 text-red-600" />
            }
            État FCM — {user?.email}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <div className="flex flex-wrap gap-2 mb-3">
            <StatusPill ok={activeTokens.length > 0} label={`${activeTokens.length} token(s) actif(s)`} />
            <StatusPill ok={!!deviceToken} label={deviceToken ? 'Token local présent' : 'Token local absent'} />
            <StatusPill ok={native} label={native ? 'APK natif' : 'Web/PWA'} />
          </div>
          <InfoRow label="Utilisateur" value={user?.email} />
          <InfoRow label="Rôle" value={user?.role} />
          <InfoRow label="Plateforme" value={native ? '📱 APK Android natif' : '🌐 Web / PWA'} />
        </CardContent>
      </Card>

      {/* Token appareil */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">📱 Token appareil actuel</CardTitle>
        </CardHeader>
        <CardContent>
          {deviceToken
            ? <InfoRow label="Token (preview 60 car.)" value={deviceToken + '...'} mono />
            : <p className="text-xs text-red-600 font-medium">Token non capturé sur cet appareil — relancez l'app ou utilisez Recovery</p>
          }
          <InfoRow label="Dernière sauvegarde" value={lastSave ? new Date(lastSave).toLocaleString('fr-FR') : 'Jamais'} />
          <InfoRow label="Dernier push reçu" value={lastPush ? new Date(lastPush).toLocaleString('fr-FR') : 'Jamais'} />
        </CardContent>
      </Card>

      {/* Tokens en BDD */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">🗃️ Tokens en BDD ({bddTokens.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {bddTokens.length === 0 && (
            <p className="text-xs text-red-600 font-medium">Aucun token enregistré en BDD pour ce compte</p>
          )}
          {bddTokens.map((t, i) => (
            <div key={t.id} className={`rounded-xl border p-3 text-xs space-y-1 ${t.is_active ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs"># {i + 1} — {t.device_type}</span>
                <StatusPill ok={t.is_active} label={t.is_active ? 'Actif' : 'Inactif'} />
              </div>
              <p className="font-mono text-[10px] break-all text-muted-foreground">{t.token?.slice(0, 50)}...</p>
              <p className="text-[10px] text-muted-foreground">
                Enregistré : {t.registered_at ? new Date(t.registered_at).toLocaleString('fr-FR') : '—'}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Dernière utilisation : {t.last_used ? new Date(t.last_used).toLocaleString('fr-FR') : '—'}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="space-y-2">
        <Button className="w-full" onClick={handleAutoRecovery} disabled={recovering}>
          {recovering
            ? <><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />Régénération en cours...</>
            : <><Zap className="h-4 w-4 mr-2" />Forcer régénération du token</>
          }
        </Button>
        <Button variant="outline" className="w-full" onClick={loadDiag}>
          <RefreshCw className="h-4 w-4 mr-2" />Rafraîchir le diagnostic
        </Button>
        {bddTokens.length > 0 && (
          <Button variant="outline" className="w-full border-red-200 text-red-600" onClick={handleDeleteAll}>
            Supprimer tous les tokens BDD
          </Button>
        )}
      </div>

      {/* Guide rapide */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">📋 Guide rapide</CardTitle></CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1">
          <p>• Si token_count = 0 → appuyer "Forcer régénération"</p>
          <p>• Si token présent mais push non reçu → vérifier canal <strong>cdl_critical_alerts_v3</strong></p>
          <p>• Le heartbeat re-vérifie le token automatiquement toutes les 10 min</p>
          <p>• Après mise à jour APK → rouvrir l'app → le token se re-enregistre automatiquement</p>
          <p>• Logs à surveiller : <strong>[FCM_AUTO_RECOVERY_START]</strong> · <strong>[FCM_TOKEN_SAVED]</strong></p>
        </CardContent>
      </Card>
    </div>
  );
}