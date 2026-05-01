/**
 * FcmQuickTest — Test rapide FCM (simple et direct)
 * 
 * Montre :
 * 1. Permission FCM status
 * 2. Token enregistré en BDD
 * 3. Bouton pour envoyer notification test
 */
import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Bell, CheckCircle2, XCircle, RefreshCw, Send, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export default function FcmQuickTest() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tokens, setTokens] = useState([]);
  const [sending, setSending] = useState(false);

  const load = async () => {
    try {
      const me = await base44.auth.me();
      setUser(me);

      // Get tokens for this user
      const tokenList = await base44.entities.FcmToken.filter({ user_email: me.email });
      setTokens(Array.isArray(tokenList) ? tokenList : []);
    } catch (err) {
      console.error('[FcmQuickTest] Error:', err?.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const sendTest = async () => {
    if (tokens.length === 0) {
      toast.error('Aucun token enregistré');
      return;
    }

    setSending(true);
    try {
      const res = await base44.functions.invoke('testNotification', {
        user_email: user.email,
        user_role: 'test'
      });

      if (res?.data?.success) {
        toast.success('📬 Test envoyé! Check ton téléphone dans 5s.');
      } else {
        toast.error('Erreur: ' + (res?.data?.error || 'Unknown'));
      }
    } catch (err) {
      console.error('[FcmQuickTest] Send error:', err);
      toast.error('Erreur réseau: ' + err?.message);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-10">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold flex-1">Test FCM Rapide</h1>
      </div>

      {/* Status Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-5 w-5" /> État Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Email */}
          <div className="p-3 rounded-xl bg-muted/50">
            <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-0.5">Email</p>
            <p className="text-sm font-semibold">{user?.email}</p>
          </div>

          {/* Tokens */}
          <div className="p-3 rounded-xl bg-muted/50">
            <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-2">Tokens Enregistrés</p>
            {tokens.length === 0 ? (
              <div className="flex items-center gap-2 text-red-600">
                <XCircle className="h-4 w-4" />
                <span className="text-xs font-medium">Aucun token</span>
              </div>
            ) : (
              <div className="space-y-1.5">
                {tokens.map(t => (
                  <div key={t.id} className="text-xs">
                    <div className="flex items-center gap-2 text-green-600 mb-0.5">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span className="font-medium">{t.device_type}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground break-all">
                      {t.token.slice(0, 40)}...
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Enregistré: {new Date(t.registered_at).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Status Summary */}
          {tokens.length > 0 ? (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-200">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-xs font-bold text-green-700">✅ Prêt à recevoir</p>
                <p className="text-[10px] text-green-600">{tokens.length} token(s) actif(s)</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200">
              <XCircle className="h-5 w-5 text-red-600" />
              <div>
                <p className="text-xs font-bold text-red-700">❌ Non prêt</p>
                <p className="text-[10px] text-red-600">Demander permission dans Settings → Diagnostic</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="space-y-2">
        <Button
          onClick={load}
          disabled={loading}
          variant="outline"
          className="w-full gap-2"
        >
          <RefreshCw className="h-4 w-4" /> Actualiser
        </Button>

        <Button
          onClick={sendTest}
          disabled={tokens.length === 0 || sending}
          className="w-full gap-2 bg-green-600 hover:bg-green-700"
        >
          {sending ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Envoi...
            </>
          ) : (
            <>
              <Send className="h-4 w-4" /> Tester Maintenant
            </>
          )}
        </Button>
      </div>

      {/* Info */}
      <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-[11px] text-blue-700 space-y-1">
        <p className="font-bold">💡 Comment ça marche :</p>
        <ol className="space-y-1 ml-4 list-decimal">
          <li>Assure-toi que les permissions sont accordées (Settings → Diagnostic)</li>
          <li>Un token FCM doit s'afficher ici</li>
          <li>Clique sur "Tester" pour envoyer une notification</li>
          <li>Tu dois la recevoir sur ton téléphone en 5 secondes</li>
        </ol>
      </div>
    </div>
  );
}