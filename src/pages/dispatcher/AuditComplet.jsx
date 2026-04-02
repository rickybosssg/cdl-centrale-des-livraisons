import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Play, ArrowLeft, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

const PHASES = [
  { key: 'auth', label: '🔐 Authentification', color: 'blue' },
  { key: 'profiles', label: '👤 Profils', color: 'purple' },
  { key: 'courses', label: '🛵 Courses', color: 'orange' },
  { key: 'notifications', label: '🔔 Notifications', color: 'yellow' },
  { key: 'bedou', label: '💰 Bedou/Wallets', color: 'green' },
  { key: 'geolocation', label: '📍 Géolocation', color: 'red' },
  { key: 'partners', label: '🏪 Partenaires', color: 'indigo' },
  { key: 'database', label: '🗄️ Base de données', color: 'cyan' },
  { key: 'sync', label: '🔄 Synchronisation', color: 'pink' },
];

const getPhaseColor = (color) => {
  const colors = {
    blue: 'border-blue-200 bg-blue-50',
    purple: 'border-purple-200 bg-purple-50',
    orange: 'border-orange-200 bg-orange-50',
    yellow: 'border-yellow-200 bg-yellow-50',
    green: 'border-green-200 bg-green-50',
    red: 'border-red-200 bg-red-50',
    indigo: 'border-indigo-200 bg-indigo-50',
    cyan: 'border-cyan-200 bg-cyan-50',
    pink: 'border-pink-200 bg-pink-50',
  };
  return colors[color] || 'border-gray-200 bg-gray-50';
};

export default function AuditComplet() {
  const navigate = useNavigate();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

  const runAudit = async () => {
    setRunning(true);
    try {
      const res = await base44.functions.invoke('comprehensiveAudit', {});
      setResult(res.data);
      
      if (res.data.status === 'critical') {
        toast.error(`🚨 ${res.data.audit.critical_issues.length} problèmes critiques détectés`);
      } else if (res.data.summary.total_issues > 0) {
        toast.warning(`⚠️ ${res.data.summary.total_issues} problèmes détectés et corrigés`);
      } else {
        toast.success('✅ Audit complet : Système sain');
      }
    } catch (err) {
      toast.error(`Erreur audit: ${err.message}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">Audit Complet CDL</h1>
      </div>

      <Card className="border-2 border-primary">
        <CardHeader>
          <CardTitle className="text-lg">Diagnostic & Correction Système</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Analyse complète de 9 modules critiques + corrections automatiques
          </p>
          <Button
            onClick={runAudit}
            disabled={running}
            className="w-full bg-primary hover:bg-primary/90 h-10"
          >
            <Play className="h-4 w-4 mr-2" />
            {running ? 'Audit en cours...' : 'Lancer l\'audit complet'}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <>
          {/* Résumé */}
          <Card className={`border-2 ${
            result.status === 'critical' ? 'border-red-300 bg-red-50' :
            result.status === 'warning' ? 'border-yellow-300 bg-yellow-50' :
            'border-green-300 bg-green-50'
          }`}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                {result.status === 'healthy' ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                )}
                <span className="font-bold">
                  {result.status === 'healthy' ? '✅ Système sain' :
                   result.status === 'warning' ? '⚠️ Problèmes détectés et corrigés' :
                   '🚨 Problèmes critiques'}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-xs mt-2">
                <div className="text-center">
                  <p className="font-bold">{result.summary.total_issues}</p>
                  <p className="text-muted-foreground">Détectés</p>
                </div>
                <div className="text-center">
                  <p className="font-bold text-green-600">{result.summary.total_fixed}</p>
                  <p className="text-muted-foreground">Corrigés</p>
                </div>
                <div className="text-center">
                  <p className="font-bold text-red-600">{result.summary.critical_issues}</p>
                  <p className="text-muted-foreground">Critiques</p>
                </div>
                <div className="text-center">
                  <p className="font-bold">{result.summary.execution_time_ms}ms</p>
                  <p className="text-muted-foreground">Temps</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Phases */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm">Détail par module</h3>
            {PHASES.map(phase => {
              const phaseData = result.audit.phases[phase.key];
              const isOk = phaseData.issues.length === 0;
              return (
                <Card key={phase.key} className={`border-2 ${getPhaseColor(phase.color)}`}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{phase.label}</span>
                      <span className="text-xs px-2 py-1 rounded-full bg-white/50 font-bold">
                        {isOk ? '✅' : phaseData.issues.length > 0 ? '⚠️' : '?'}
                      </span>
                    </div>
                    
                    {phaseData.issues.length > 0 && (
                      <div className="text-xs space-y-1">
                        {phaseData.issues.map((issue, idx) => (
                          <p key={idx} className="text-red-700">{issue}</p>
                        ))}
                      </div>
                    )}
                    
                    {phaseData.fixed.length > 0 && (
                      <div className="text-xs space-y-1 bg-green-100/50 p-2 rounded">
                        {phaseData.fixed.slice(0, 3).map((fix, idx) => (
                          <p key={idx} className="text-green-700 text-[10px]">{fix}</p>
                        ))}
                        {phaseData.fixed.length > 3 && (
                          <p className="text-green-600 text-[10px]">+{phaseData.fixed.length - 3} corrections</p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Critiques */}
          {result.audit.critical_issues.length > 0 && (
            <Card className="border-red-300 bg-red-50">
              <CardHeader>
                <CardTitle className="text-sm text-red-700">
                  🚨 Problèmes critiques ({result.audit.critical_issues.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-xs">
                  {result.audit.critical_issues.map((issue, idx) => (
                    <p key={idx} className="text-red-700 font-semibold">{issue}</p>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recommandations */}
          {result.audit.recommendations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Recommandations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-xs">
                  {result.audit.recommendations.map((rec, idx) => (
                    <p key={idx}>{rec}</p>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}