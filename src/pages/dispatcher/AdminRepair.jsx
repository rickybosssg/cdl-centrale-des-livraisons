import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Shield, CheckCircle2, AlertCircle, Loader2, RefreshCw, User, Key, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import moment from "moment";

export default function AdminRepair() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [repairing, setRepairing] = useState(false);
  const [logs, setLogs] = useState([]);
  const [diagnostics, setDiagnostics] = useState({
    isAuthenticated: false,
    hasUserRecord: false,
    currentRole: null,
    userType: null,
    activeProfile: null,
    adminProfileExists: false,
    backendFunctionsEnabled: false,
  });

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString('fr-FR', { hour12: false });
    setLogs(prev => [`[${timestamp}] ${message}`, ...prev].slice(0, 100));
  };

  const runDiagnostics = async () => {
    addLog('🔍 Démarrage diagnostics...');
    try {
      // 1. Auth check
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setDiagnostics(prev => ({ ...prev, isAuthenticated: !!currentUser }));
      addLog(`✅ Auth: ${currentUser ? currentUser.email : 'NON CONNECTÉ'}`);

      if (!currentUser) {
        addLog('❌ ERREUR: Aucun utilisateur connecté');
        return;
      }

      // 2. User record check (via backend function)
      addLog('📡 Appel adminAuthDiagnostics...');
      const userRes = await base44.functions.invoke('adminAuthDiagnostics', { email: currentUser.email, _t: Date.now() });
      const userRecord = userRes.data?.user;
      
      if (!userRes.data?.success) {
        addLog(`❌ adminAuthDiagnostics échec: ${userRes.data?.error}`);
        return;
      }
      
      setDiagnostics(prev => ({ 
        ...prev, 
        hasUserRecord: !!userRecord,
        currentRole: userRecord?.role,
        userType: userRecord?.user_type,
        activeProfile: userRecord?.active_profile_type,
      }));
      addLog(`✅ User Record: role=${userRecord?.role} | user_type=${userRecord?.user_type}`);

      // 3. Admin profile check (via backend function)
      setDiagnostics(prev => ({ ...prev, adminProfileExists: userRecord?.has_admin_profile || false }));
      addLog(`✅ Admin Profile: ${userRecord?.has_admin_profile ? 'EXISTS' : 'MISSING'}`);

      // 4. Backend functions check (test simple)
      try {
        await base44.functions.invoke('getDispatchMode', { _t: Date.now() });
        setDiagnostics(prev => ({ ...prev, backendFunctionsEnabled: true }));
        addLog('✅ Backend Functions: ENABLED');
      } catch (err) {
        addLog(`⚠️ Backend Functions: ${err.message}`);
      }

      // 5. Résumé complet
      addLog('📊 DIAGNOSTIC COMPLET:');
      addLog(`   - Rôle: ${userRecord?.role}`);
      addLog(`   - user_type: ${userRecord?.user_type}`);
      addLog(`   - active_profile_type: ${userRecord?.active_profile_type}`);
      addLog(`   - is_admin: ${userRecord?.is_admin}`);
      addLog(`   - admin_status: ${userRecord?.admin_status}`);
      addLog(`   - has_admin_profile: ${userRecord?.has_admin_profile}`);
      addLog(`   - backend_enabled: ${userRes.data?.backend?.functions_enabled}`);
      
      if (userRecord?.role === 'admin' && userRecord?.has_admin_profile) {
        addLog('🎉 COMPTE ADMIN VALIDE ET OPÉRATIONNEL');
      } else {
        addLog('⚠️ COMPTE NON ADMIN - Réparation recommandée');
      }

    } catch (error) {
      addLog(`❌ Diagnostic error: ${error.message}`);
      console.error('[AdminRepair] Diagnostic error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRepair = async () => {
    if (!user) {
      toast.error('Aucun utilisateur connecté');
      return;
    }

    setRepairing(true);
    addLog('🔧 Démarrage réparation admin...');

    try {
      // ÉTAPE 1 : repairAdminAccess (auto-réparation)
      addLog('📡 Étape 1: repairAdminAccess...');
      const res1 = await base44.functions.invoke('repairAdminAccess', { _t: Date.now() });
      addLog(`✅ repairAdminAccess: ${res1.data?.success ? 'SUCCÈS' : 'ÉCHEC'}`);
      
      if (res1.data?.success) {
        toast.success('✅ Accès admin réparé avec succès !');
        addLog('🎉 RÉPARATION TERMINÉE - Redémarrez l\'application');
        
        // Refresh diagnostics
        setTimeout(() => runDiagnostics(), 1000);
      } else {
        throw new Error(res1.data?.error || 'Échec repairAdminAccess');
      }

    } catch (error) {
      addLog(`❌ Échec réparation: ${error.message}`);
      toast.error(`Erreur: ${error.message}`);
      console.error('[AdminRepair] Repair error:', error);
    } finally {
      setRepairing(false);
    }
  };

  const handleForceAdmin = async () => {
    if (!user) return;

    setRepairing(true);
    addLog('🔧 ForceAdminRole en cours...');

    try {
      const res = await base44.functions.invoke('forceAdminRole', { 
        target_email: user.email,
        _t: Date.now() 
      });

      if (res.data?.success) {
        toast.success('✅ Rôle admin forcé avec succès !');
        addLog('✅ forceAdminRole: SUCCÈS');
        setTimeout(() => runDiagnostics(), 1000);
      } else {
        throw new Error(res.data?.error || 'Échec');
      }
    } catch (error) {
      toast.error(`Erreur: ${error.message}`);
      addLog(`❌ forceAdminRole: ${error.message}`);
    } finally {
      setRepairing(false);
    }
  };

  useEffect(() => {
    runDiagnostics();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-16">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">🔧 Réparation Admin</h1>
          <p className="text-xs text-muted-foreground">
            Correctif global des accès administrateur
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={runDiagnostics}>
          <RefreshCw className="h-4 w-4 mr-1" />
          Refresh
        </Button>
      </div>

      {/* Utilisateur connecté */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <User className="h-4 w-4" />
            Utilisateur connecté
          </CardTitle>
        </CardHeader>
        <CardContent>
          {user ? (
            <div className="space-y-1">
              <p className="text-sm font-semibold">{user.email}</p>
              <p className="text-xs text-muted-foreground">
                Rôle actuel: <strong className={diagnostics.currentRole === 'admin' ? 'text-green-600' : 'text-red-600'}>
                  {diagnostics.currentRole || 'NON DÉFINI'}
                </strong>
              </p>
              <p className="text-xs text-muted-foreground">
                User Type: <strong>{diagnostics.userType || 'NON DÉFINI'}</strong>
              </p>
              <p className="text-xs text-muted-foreground">
                Profil Actif: <strong>{diagnostics.activeProfile || 'NON DÉFINI'}</strong>
              </p>
            </div>
          ) : (
            <p className="text-sm text-red-600">❌ Aucun utilisateur connecté</p>
          )}
        </CardContent>
      </Card>

      {/* Diagnostics */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Diagnostics
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span>Authentifié</span>
            {diagnostics.isAuthenticated ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-600" />
            )}
          </div>
          <div className="flex items-center justify-between text-xs">
            <span>User Record Exists</span>
            {diagnostics.hasUserRecord ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-600" />
            )}
          </div>
          <div className="flex items-center justify-between text-xs">
            <span>Rôle Admin</span>
            {diagnostics.currentRole === 'admin' ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-600" />
            )}
          </div>
          <div className="flex items-center justify-between text-xs">
            <span>Admin Profile Exists</span>
            {diagnostics.adminProfileExists ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-600" />
            )}
          </div>
          <div className="flex items-center justify-between text-xs">
            <span>Backend Functions</span>
            {diagnostics.backendFunctionsEnabled ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <AlertCircle className="h-4 w-4 text-amber-600" />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Actions de réparation */}
      <div className="space-y-2">
        <Button 
          className="w-full h-12 text-base font-bold" 
          onClick={handleRepair}
          disabled={repairing || !user}
        >
          {repairing ? (
            <><Loader2 className="h-5 w-5 mr-2 animate-spin" />Réparation en cours...</>
          ) : (
            <><Shield className="h-5 w-5 mr-2" />🔧 Réparer l'accès Admin (RECOMMANDÉ)</>
          )}
        </Button>

        <Button 
          variant="outline" 
          className="w-full"
          onClick={handleForceAdmin}
          disabled={repairing || !user}
        >
          <Key className="h-4 w-4 mr-2" />
          Forcer rôle Admin (forceAdminRole)
        </Button>

        <Button 
          variant="outline" 
          className="w-full"
          onClick={() => {
            base44.auth.logout();
            window.location.href = '/connexion';
          }}
        >
          🚪 Logout et Reconnect
        </Button>
      </div>

      {/* Logs */}
      <Card className="bg-black text-green-400 font-mono text-xs">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs flex items-center gap-2">
            <Database className="h-3 w-3" />
            Logs en temps réel ({logs.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="max-h-64 overflow-y-auto space-y-1">
          {logs.length === 0 ? (
            <p className="text-muted-foreground">Aucun log pour le moment</p>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="border-l-2 border-green-600 pl-2 py-0.5">
                {log}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card className="bg-muted/50">
        <CardContent className="p-4 text-xs space-y-2">
          <p className="font-semibold">📋 Instructions :</p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>Cliquez sur "🔧 Réparer l'accès Admin"</li>
            <li>Attendez la confirmation de succès</li>
            <li>Déconnectez-vous et reconnectez-vous</li>
            <li>Accédez au dashboard admin (/admin-pro)</li>
          </ol>
          <p className="text-amber-600 font-semibold mt-2">⚠️ Important :</p>
          <p className="text-xs text-muted-foreground">
            Les Backend Functions doivent être activées dans le dashboard Base44.
            Si ce n'est pas le cas, allez dans Dashboard → Code → Backend Functions → Enable.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}