import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, Send, Loader2, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export default function TestNotifications() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState('');
  const [selectedRole, setSelectedRole] = useState('livreur');
  const [sending, setSending] = useState(false);
  const [testLogs, setTestLogs] = useState([]);
  const [lastResult, setLastResult] = useState(null);

  // Charger les utilisateurs
  useEffect(() => {
    const load = async () => {
      try {
        const admins = await base44.asServiceRole.entities.User.filter(
          { role: 'admin' },
          '-created_date',
          20
        );
        const profiles = await base44.asServiceRole.entities.UserProfile.filter(
          { status: 'actif' },
          '-created_date',
          50
        );
        const uniqueUsers = new Map();
        admins.forEach(u => {
          uniqueUsers.set(u.email, { email: u.email, role: 'admin', full_name: u.full_name });
        });
        profiles.forEach(p => {
          if (!uniqueUsers.has(p.user_email)) {
            uniqueUsers.set(p.user_email, {
              email: p.user_email,
              role: p.profile_type,
              full_name: p.user_nom || 'N/A',
            });
          }
        });
        setUsers(Array.from(uniqueUsers.values()));
        setLoading(false);
      } catch (err) {
        toast.error('Erreur chargement utilisateurs: ' + err.message);
        setLoading(false);
      }
    };
    load();
  }, []);

  // Charger les logs de test
  useEffect(() => {
    const loadLogs = async () => {
      try {
        const logs = await base44.asServiceRole.entities.NotificationTestLog.filter(
          {},
          '-created_date',
          10
        );
        setTestLogs(logs);
      } catch (_) {}
    };
    loadLogs();
  }, []);

  const sendTest = async () => {
    if (!selectedEmail) {
      toast.error('Sélectionne un utilisateur');
      return;
    }

    setSending(true);
    try {
      console.log('[TestNotifications] Envoi test vers', selectedEmail, selectedRole);
      const res = await base44.functions.invoke('testNotification', {
        recipient_email: selectedEmail,
        recipient_role: selectedRole,
      });

      console.log('[TestNotifications] Résultat:', res.data);

      if (res.data?.success) {
        toast.success(
          `✅ Notification envoyée!\n${res.data.details.sent}/${res.data.details.tokens_found} tokens reçus`
        );
        setLastResult({
          status: 'success',
          ...res.data.details,
        });
      } else {
        toast.error(
          `⚠️ Notification non envoyée\n${res.data?.details || res.data?.message}`
        );
        setLastResult({
          status: 'failed',
          message: res.data?.details || res.data?.message,
        });
      }

      // Recharger les logs
      setTimeout(async () => {
        const logs = await base44.asServiceRole.entities.NotificationTestLog.filter(
          {},
          '-created_date',
          10
        );
        setTestLogs(logs);
      }, 1000);
    } catch (err) {
      toast.error('Erreur: ' + err.message);
      setLastResult({
        status: 'error',
        message: err.message,
      });
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

  const livreurs = users.filter(u => u.role === 'livreur');
  const admins = users.filter(u => u.role === 'admin');
  const clients = users.filter(u => u.role === 'client');

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-bold">🧪 Test Notifications APK</h1>
      </div>

      {/* Guide */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="p-4 space-y-2 text-sm">
          <p className="font-semibold text-blue-900">📝 Comment tester :</p>
          <ol className="space-y-1 text-blue-800 ml-4 list-decimal">
            <li>Sélectionne un utilisateur (livreur/admin)</li>
            <li>L'utilisateur doit être connecté sur l'APK</li>
            <li>Clique "Envoyer test" — la notification doit arriver en <strong>5 sec max</strong></li>
            <li>Teste dans les 3 cas : app ouverte, background, fermée</li>
            <li>Vérifie les logs pour confirmer token → envoi → réception</li>
          </ol>
        </CardContent>
      </Card>

      {/* Formulaire test */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Envoyer une notification de test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Sélection rôle */}
          <div>
            <label className="text-sm font-medium mb-2 block">Catégorie</label>
            <div className="flex gap-2">
              {[
                { role: 'livreur', label: '🛵 Livreurs', count: livreurs.length },
                { role: 'admin', label: '🛡️ Admins', count: admins.length },
                { role: 'client', label: '👤 Clients', count: clients.length },
              ].map(cat => (
                <button
                  key={cat.role}
                  onClick={() => {
                    setSelectedRole(cat.role);
                    setSelectedEmail('');
                  }}
                  className={`px-3 py-2 rounded-lg border-2 text-xs font-medium transition-all ${
                    selectedRole === cat.role
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-foreground'
                  }`}
                >
                  {cat.label} ({cat.count})
                </button>
              ))}
            </div>
          </div>

          {/* Sélection utilisateur */}
          <div>
            <label className="text-sm font-medium mb-2 block">Utilisateur</label>
            <select
              value={selectedEmail}
              onChange={e => setSelectedEmail(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg bg-background text-foreground text-sm"
            >
              <option value="">— Sélectionne un utilisateur —</option>
              {users
                .filter(u => u.role === selectedRole)
                .map(u => (
                  <option key={u.email} value={u.email}>
                    {u.full_name} ({u.email})
                  </option>
                ))}
            </select>
          </div>

          {/* Bouton envoi */}
          <Button
            onClick={sendTest}
            disabled={!selectedEmail || sending}
            className="w-full bg-primary hover:bg-primary/90"
          >
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Envoi en cours...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Envoyer une notification de test
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Résultat du dernier test */}
      {lastResult && (
        <Card
          className={
            lastResult.status === 'success'
              ? 'border-green-200 bg-green-50'
              : 'border-red-200 bg-red-50'
          }
        >
          <CardContent className="p-4 space-y-2">
            <div className="flex items-start gap-3">
              {lastResult.status === 'success' ? (
                <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <p
                  className={`font-semibold text-sm ${
                    lastResult.status === 'success' ? 'text-green-900' : 'text-red-900'
                  }`}
                >
                  {lastResult.status === 'success'
                    ? `✅ Notification envoyée à ${lastResult.sent}/${lastResult.tokens_found} tokens`
                    : `❌ Erreur: ${lastResult.message}`}
                </p>
                {lastResult.status === 'success' && (
                  <>
                    <p className="text-xs text-muted-foreground mt-1">
                      Email: {lastResult.recipient_email}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Timestamp: {new Date(lastResult.timestamp).toLocaleString()}
                    </p>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Historique des tests */}
      {testLogs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              📋 Historique des tests ({testLogs.length})
              <button
                onClick={async () => {
                  const logs = await base44.asServiceRole.entities.NotificationTestLog.filter(
                    {},
                    '-created_date',
                    10
                  );
                  setTestLogs(logs);
                  toast.success('Actualisé');
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[400px] overflow-y-auto">
            {testLogs.map(log => {
              const details = (() => {
                try {
                  return JSON.parse(log.details || '{}');
                } catch {
                  return {};
                }
              })();
              return (
                <div
                  key={log.id}
                  className={`p-3 rounded-lg border text-xs space-y-1 ${
                    log.status === 'sent'
                      ? 'bg-green-50 border-green-200'
                      : 'bg-orange-50 border-orange-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium">
                      {log.status === 'sent' ? '✅' : '⚠️'} {log.recipient_email}
                    </p>
                    <p className="text-muted-foreground">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                  <p className="text-muted-foreground">
                    Admin: {log.admin_email} | Tokens: {log.tokens_count} | Envoyés: {log.sent_count}/{log.tokens_count}
                  </p>
                  {log.sent_count === 0 && (
                    <p className="text-orange-700">⚠️ Utilisateur doit se connecter + autoriser les notifications</p>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Info pratiques */}
      <Card className="border-muted bg-muted/30">
        <CardContent className="p-4 space-y-2 text-xs text-muted-foreground">
          <p>
            <strong>Token manquant?</strong> L'utilisateur doit se connecter sur l'APK + autoriser les
            notifications. Le token est auto-sauvegardé en BDD.
          </p>
          <p>
            <strong>Notif non reçue?</strong> Vérifie les logs de la console APK. Assure-toi que le canal
            "default" est créé avec importance=5.
          </p>
          <p>
            <strong>App fermée?</strong> Le payload FCM inclut la priorité HIGH + channel_id pour affichage
            en app fermée.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}