/**
 * FcmStatusPanel — Panneau de statut FCM verrouillé
 * Affiche : token actuel, token en base, channelId, dernier envoi, dernier délai
 *
 * 🔒 NE PAS SUPPRIMER — utilisé par /fcm-diagnostic pour vérifier
 *    les notifications après chaque rebuild.
 */
import { Shield, CheckCircle2, XCircle, Clock, Cpu } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const LOCKED_CHANNEL = 'cdl_critical_alerts_v2'; // ← VERROUILLÉ

function Row({ label, value, ok, mono }) {
  return (
    <div className="flex items-start justify-between gap-2 py-1.5 border-b last:border-0">
      <span className="text-xs text-muted-foreground flex-shrink-0">{label}</span>
      <span className={`text-xs font-semibold text-right break-all ${mono ? 'font-mono' : ''} ${ok === true ? 'text-green-700' : ok === false ? 'text-red-600' : 'text-foreground'}`}>
        {value ?? '—'}
      </span>
    </div>
  );
}

export default function FcmStatusPanel({ fcmTokens = [], lastSendResult = null, lastDelayMs = null }) {
  const activeToken = fcmTokens.find(t => t.device_type === 'android_native') || fcmTokens[0];
  const tokenShort = activeToken?.token ? activeToken.token.slice(0, 28) + '...' : null;
  const tokenInDb = fcmTokens.length > 0;
  const channelOk = LOCKED_CHANNEL === 'cdl_critical_alerts_v2';

  return (
    <Card className="border-2 border-blue-300 bg-blue-50">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-sm text-blue-900 flex items-center gap-2">
          <Shield className="h-4 w-4" />
          État FCM — Canal verrouillé
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-0">

        {/* Canal verrouillé */}
        <div className="flex items-center gap-2 py-2 border-b">
          {channelOk
            ? <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
            : <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
          }
          <div className="flex-1">
            <p className="text-xs font-bold text-blue-900">Canal FCM verrouillé</p>
            <p className="text-[11px] font-mono text-blue-700">{LOCKED_CHANNEL}</p>
          </div>
          <span className="text-[10px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">LOCKED</span>
        </div>

        {/* Token actuel */}
        <Row
          label="Token appareil"
          value={tokenShort || 'Aucun token enregistré'}
          ok={tokenInDb}
          mono
        />

        {/* Token en base */}
        <Row
          label="Tokens en BDD"
          value={tokenInDb ? `${fcmTokens.length} actif(s) ✅` : '0 — enregistrer d\'abord'}
          ok={tokenInDb}
        />

        {/* Type d'appareil */}
        {activeToken && (
          <Row
            label="Type appareil"
            value={activeToken.device_type === 'android_native' ? '📱 Android natif' : '🌐 Web'}
            ok={true}
          />
        )}

        {/* Dernier envoi */}
        <Row
          label="Dernier envoi"
          value={
            lastSendResult == null ? 'Pas encore testé' :
            lastSendResult.ok ? `✅ ${lastSendResult.sent}/${lastSendResult.total} envoyé(s)` :
            `❌ ${lastSendResult.error || 'Échec'}`
          }
          ok={lastSendResult?.ok ?? null}
        />

        {/* Délai dernier envoi */}
        <Row
          label="Dernier délai"
          value={lastDelayMs != null ? `${lastDelayMs} ms` : '—'}
          ok={lastDelayMs != null && lastDelayMs < 3000 ? true : lastDelayMs != null ? false : null}
        />

        {/* Payload standard */}
        <div className="mt-2 pt-2 border-t">
          <p className="text-[10px] font-bold text-blue-800 mb-1">Payload standard verrouillé :</p>
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
            {['notification.title', 'notification.body', 'android.priority=HIGH', `channel=${LOCKED_CHANNEL}`, 'sound=default', 'data.type', 'data.screen', 'data.user_id'].map(f => (
              <div key={f} className="flex items-center gap-1">
                <CheckCircle2 className="h-2.5 w-2.5 text-green-500 flex-shrink-0" />
                <span className="text-[10px] font-mono text-slate-600">{f}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}