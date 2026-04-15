import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, Search, RefreshCw, AlertCircle, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

export default function AdminAuthDiagnostics() {
  const navigate = useNavigate();
  const [searchEmail, setSearchEmail] = useState('');
  const [searchPhone, setSearchPhone] = useState('');
  const [diagnosis, setDiagnosis] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchEmail && !searchPhone) {
      toast.error('Entrez un email ou un téléphone');
      return;
    }

    setLoading(true);
    try {
      const res = await base44.functions.invoke('adminAuthDiagnostics', {
        search_email: searchEmail,
        search_phone: searchPhone,
      });

      if (res.data?.found) {
        setDiagnosis(res.data.diagnosis);
      } else {
        setDiagnosis(null);
        toast.info('Utilisateur non trouvé');
      }
    } catch (err) {
      toast.error('Erreur: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-bold">Diagnostic Authentification</h1>
      </div>

      {/* Formulaire de recherche */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Rechercher un utilisateur</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSearch} className="space-y-3">
            <Input
              placeholder="Email utilisateur..."
              value={searchEmail}
              onChange={(e) => setSearchEmail(e.target.value)}
              className="text-sm"
            />
            <Input
              placeholder="Ou téléphone (+226...)"
              value={searchPhone}
              onChange={(e) => setSearchPhone(e.target.value)}
              className="text-sm"
            />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Recherche...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Rechercher
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Résultats */}
      {diagnosis && (
        <div className="space-y-4">
          {/* Identité */}
          <Card className="border-blue-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">👤 Identité</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">User ID</span>
                <code className="bg-muted px-2 py-1 rounded text-xs">{diagnosis.user_id}</code>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email</span>
                <span className="font-medium">{diagnosis.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Téléphone</span>
                <span className="font-medium">{diagnosis.phone || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Nom</span>
                <span className="font-medium">{diagnosis.full_name || '—'}</span>
              </div>
            </CardContent>
          </Card>

          {/* Authentification */}
          <Card className="border-purple-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">🔐 Authentification</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Méthode inscription</span>
                <span className="font-medium">
                  {diagnosis.signup_method === 'phone'
                    ? '📱 Téléphone'
                    : diagnosis.signup_method === 'google'
                      ? '🔵 Google'
                      : '✉️ Email'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email vérifié</span>
                <span className={diagnosis.email_verified ? 'text-green-600 font-bold' : 'text-red-600'}>
                  {diagnosis.email_verified ? '✅ Oui' : '❌ Non'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Téléphone vérifié</span>
                <span
                  className={
                    diagnosis.phone_verified ? 'text-green-600 font-bold' : 'text-red-600'
                  }
                >
                  {diagnosis.phone_verified ? '✅ Oui' : '❌ Non'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Onboarding</span>
                <span
                  className={
                    diagnosis.onboarding_completed ? 'text-green-600 font-bold' : 'text-red-600'
                  }
                >
                  {diagnosis.onboarding_completed ? '✅ Complété' : '❌ Incomplet'}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Rôles & Profils */}
          <Card className="border-green-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">👥 Rôles & Profils</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Rôle actuel</span>
                <span className="font-medium">{diagnosis.current_role}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Profil actif</span>
                <span className="font-medium">{diagnosis.current_profile_type || '—'}</span>
              </div>

              {diagnosis.profiles.length > 0 ? (
                <div className="space-y-2 mt-3 border-t pt-3">
                  <p className="font-semibold text-xs">Profils CDL ({diagnosis.profiles_count})</p>
                  {diagnosis.profiles.map((p) => (
                    <div key={p.id} className="p-2 rounded bg-muted/50 space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold">{p.type}</span>
                        <span
                          className={
                            p.status === 'actif'
                              ? 'text-green-600 font-bold'
                              : 'text-amber-600 font-bold'
                          }
                        >
                          {p.status}
                        </span>
                      </div>
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Complétude: {p.completion}%</span>
                        <span>Actif: {p.is_active ? 'Oui' : 'Non'}</span>
                      </div>
                      {p.refusal_reason && (
                        <p className="text-[10px] text-red-600">Motif: {p.refusal_reason}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-xs font-semibold mt-3">
                  ⚠️ Aucun profil CDL
                </div>
              )}
            </CardContent>
          </Card>

          {/* Chronologie */}
          <Card className="border-orange-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">📅 Chronologie</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Compte créé</span>
                <span className="text-xs">{new Date(diagnosis.account_created).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Dernière connexion</span>
                <span className="text-xs">
                  {diagnosis.last_login
                    ? new Date(diagnosis.last_login).toLocaleString()
                    : 'Jamais'}
                </span>
              </div>
              {diagnosis.last_login_method && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Via</span>
                  <span className="text-xs">{diagnosis.last_login_method}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Problèmes détectés */}
          {diagnosis.issues.length > 0 && (
            <Card className="border-red-200 bg-red-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  Problèmes détectés ({diagnosis.issues.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {diagnosis.issues.map((issue, i) => (
                  <p key={i} className="text-sm text-red-700">
                    {issue}
                  </p>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Recommandations */}
          {diagnosis.recommendations.length > 0 && (
            <Card className="border-blue-200 bg-blue-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-600" />
                  Recommandations
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {diagnosis.recommendations.map((rec, i) => (
                  <div key={i} className="text-sm text-blue-700 flex items-start gap-2">
                    <span className="text-blue-600 font-bold flex-shrink-0">→</span>
                    <span>{rec}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Historique de connexion */}
          {diagnosis.login_history.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">📊 Historique connexion</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-48 overflow-y-auto">
                {diagnosis.login_history.map((log, i) => (
                  <div key={i} className="p-2 rounded bg-muted/50 text-xs space-y-0.5">
                    <div className="flex justify-between">
                      <span className="font-semibold">{log.step}</span>
                      <span className="text-muted-foreground">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Méthode: {log.method}</span>
                      {log.error_code && <span className="text-red-600">⚠️ {log.error_code}</span>}
                    </div>
                    {log.error_message && (
                      <p className="text-red-600 text-[10px]">{log.error_message}</p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Logs de réparation */}
          {diagnosis.repair_history.length > 0 && (
            <Card className="border-green-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">🔧 Logs de réparation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-32 overflow-y-auto">
                {diagnosis.repair_history.map((log, i) => (
                  <div key={i} className="p-2 rounded bg-green-50 text-xs">
                    <p className="font-semibold text-green-800">{log.correction}</p>
                    <p className="text-green-700">{log.detail}</p>
                    <p className="text-muted-foreground text-[10px]">
                      {new Date(log.timestamp).toLocaleString()}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}