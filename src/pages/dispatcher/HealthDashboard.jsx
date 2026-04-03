import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, AlertTriangle, CheckCircle2, Clock, TrendingUp, RefreshCw, Info, Wrench, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import moment from 'moment';

export default function HealthDashboard() {
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);

  useEffect(() => {
    const loadReports = async () => {
      try {
        const data = await base44.entities.SystemHealthReport.list('-created_date', 30);
        setReports(data);
        if (data.length > 0) setSelectedReport(data[0]);
      } catch (err) {
        console.error('[HealthDashboard] Error:', err);
      } finally {
        setLoading(false);
      }
    };

    loadReports();
    const unsub = base44.entities.SystemHealthReport.subscribe((event) => {
      if (event.type === 'create') {
        setReports(prev => [event.data, ...prev]);
      }
    });
    return unsub;
  }, []);

  const runHealthCheck = async () => {
    setRunning(true);
    try {
      await base44.functions.invoke('systemHealthCheck', {});
      // Le nouveau rapport sera reçu via subscribe
    } catch (err) {
      console.error('[HealthDashboard] Check failed:', err);
    } finally {
      setRunning(false);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      healthy: 'text-green-600 bg-green-50 border-green-200',
      warning: 'text-amber-600 bg-amber-50 border-amber-200',
      critical: 'text-red-600 bg-red-50 border-red-200',
    };
    return colors[status] || 'text-gray-600 bg-gray-50 border-gray-200';
  };

  const getStatusIcon = (status) => {
    if (status === 'healthy') return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    if (status === 'critical') return <AlertTriangle className="h-5 w-5 text-red-600" />;
    return <Clock className="h-5 w-5 text-amber-600" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const lastReport = reports[0];

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Journal des check-ups</h1>
          <p className="text-xs text-muted-foreground">Check-up automatique chaque nuit à minuit</p>
        </div>
        <Button size="sm" onClick={runHealthCheck} disabled={running} className="bg-blue-600 hover:bg-blue-700">
          {running ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-1 hidden sm:inline">{running ? 'En cours...' : 'Lancer'}</span>
        </Button>
      </div>

      {/* Note périmètre */}
      <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 flex gap-2">
        <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-blue-800">
          <p className="font-semibold">Périmètre du check-up automatique :</p>
          <p className="mt-0.5">Base de données · Courses bloquées · Profils orphelins · Notifications dupliquées · Tokens FCM · Portefeuilles</p>
          <p className="mt-1 text-blue-600 font-medium">⚠️ Les problèmes d'affichage UI (bannières, composants) ne sont pas dans le périmètre — ils relèvent du déploiement frontend.</p>
        </div>
      </div>

      {/* Dernier résultat synthétique */}
      {lastReport && (
        <Card className={`border-2 ${getStatusColor(lastReport.status)}`}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                {getStatusIcon(lastReport.status)}
                <div>
                  <p className="font-bold text-sm">
                    {lastReport.status === 'healthy' ? '✅ Système sain' :
                     lastReport.status === 'warning' ? '⚠️ Avertissements détectés' :
                     '🚨 Problèmes critiques'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Exécuté le <strong>{moment(lastReport.date_check).format('DD/MM/YYYY')}</strong> à <strong>{moment(lastReport.date_check).format('HH:mm:ss')}</strong>
                  </p>
                </div>
              </div>
              <span className="text-xs text-muted-foreground">{lastReport.execution_time_ms}ms</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center p-2 rounded-lg bg-amber-50 border border-amber-200">
                <p className="text-lg font-bold text-amber-700">{lastReport.errors_detected}</p>
                <p className="text-[10px] text-amber-600">Anomalies</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-green-50 border border-green-200">
                <p className="text-lg font-bold text-green-700">{lastReport.errors_fixed}</p>
                <p className="text-[10px] text-green-600">Corrigées</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-red-50 border border-red-200">
                <p className="text-lg font-bold text-red-700">{lastReport.errors_critical}</p>
                <p className="text-[10px] text-red-600">Critiques</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Onglets : Rapport / Historique */}
      <Tabs defaultValue="report">
        <TabsList className="w-full">
          <TabsTrigger value="report" className="flex-1">Dernier rapport</TabsTrigger>
          <TabsTrigger value="history" className="flex-1">Historique</TabsTrigger>
        </TabsList>

        <TabsContent value="report" className="mt-4">
          {selectedReport ? (() => {
            let reportData = {};
            try { reportData = JSON.parse(selectedReport.report_json || '{}'); } catch {}
            return (
              <div className="space-y-3">
                {/* En-tête rapport sélectionné */}
                <div className="p-3 rounded-xl bg-muted/50 border text-xs space-y-1">
                  <p><span className="font-semibold">📅 Date :</span> {moment(selectedReport.date_check).format('dddd DD MMMM YYYY')}</p>
                  <p><span className="font-semibold">🕐 Heure :</span> {moment(selectedReport.date_check).format('HH:mm:ss')} (heure locale Ouagadougou)</p>
                  <p><span className="font-semibold">📊 Statut :</span> <span className={selectedReport.status === 'healthy' ? 'text-green-600' : selectedReport.status === 'warning' ? 'text-amber-600' : 'text-red-600'}>{selectedReport.status.toUpperCase()}</span></p>
                  <p><span className="font-semibold">⏱️ Durée :</span> {selectedReport.execution_time_ms}ms</p>
                </div>

                {/* Modules vérifiés */}
                {reportData.modules_checked && (
                  <Card>
                    <CardContent className="p-3">
                      <p className="text-xs font-semibold mb-2 flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> Modules vérifiés</p>
                      <div className="flex flex-wrap gap-1">
                        {reportData.modules_checked.map(m => (
                          <span key={m} className="text-[11px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">{m}</span>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Anomalies détectées */}
                {reportData.errors?.length > 0 ? (
                  <Card className="border-amber-200 bg-amber-50/50">
                    <CardContent className="p-3">
                      <p className="text-xs font-semibold text-amber-700 mb-2">⚠️ Anomalies détectées ({reportData.errors.length})</p>
                      <div className="space-y-1">
                        {reportData.errors.map((err, idx) => (
                          <div key={idx} className="flex items-start gap-1.5 text-xs text-amber-800">
                            <span className="mt-0.5">•</span><span>{err}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="border-green-200 bg-green-50/50">
                    <CardContent className="p-3 text-xs text-green-700 font-medium">✅ Aucune anomalie détectée</CardContent>
                  </Card>
                )}

                {/* Actions correctives */}
                {reportData.fixed?.length > 0 && (
                  <Card className="border-green-200">
                    <CardContent className="p-3">
                      <p className="text-xs font-semibold text-green-700 mb-2 flex items-center gap-1"><Wrench className="h-3.5 w-3.5" /> Actions correctives ({reportData.fixed.length})</p>
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {reportData.fixed.map((fix, idx) => (
                          <div key={idx} className="flex items-start gap-1.5 text-xs text-green-800">
                            <span className="mt-0.5">•</span><span>{fix}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Critiques */}
                {reportData.critical?.length > 0 && (
                  <Card className="border-red-300 bg-red-50">
                    <CardContent className="p-3">
                      <p className="text-xs font-semibold text-red-700 mb-2">🚨 Problèmes critiques non résolus ({reportData.critical.length})</p>
                      <div className="space-y-1">
                        {reportData.critical.map((crit, idx) => (
                          <div key={idx} className="flex items-start gap-1.5 text-xs text-red-800 font-medium">
                            <span className="mt-0.5">•</span><span>{crit}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            );
          })() : <p className="text-center text-xs text-muted-foreground py-6">Sélectionnez un rapport dans l'historique</p>}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {reports.map((report, idx) => {
              const isSelected = selectedReport?.id === report.id;
              return (
                <Card
                  key={report.id}
                  className={`cursor-pointer transition-all ${isSelected ? 'border-primary shadow-md' : 'hover:shadow-sm'}`}
                  onClick={() => setSelectedReport(report)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      <div className={`h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                        report.status === 'healthy' ? 'bg-green-100' :
                        report.status === 'warning' ? 'bg-amber-100' : 'bg-red-100'
                      }`}>
                        {getStatusIcon(report.status)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold">
                            {moment(report.date_check).format('DD/MM/YYYY')} à {moment(report.date_check).format('HH:mm:ss')}
                          </p>
                          {idx === 0 && <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">DERNIER</span>}
                        </div>
                        <div className="flex gap-3 mt-0.5">
                          <span className="text-[10px] text-amber-600">⚠️ {report.errors_detected} anomalie{report.errors_detected > 1 ? 's' : ''}</span>
                          <span className="text-[10px] text-green-600">✅ {report.errors_fixed} corrigée{report.errors_fixed > 1 ? 's' : ''}</span>
                          {report.errors_critical > 0 && <span className="text-[10px] text-red-600">🚨 {report.errors_critical} critique{report.errors_critical > 1 ? 's' : ''}</span>}
                          <span className="text-[10px] text-muted-foreground">{report.execution_time_ms}ms</span>
                        </div>
                      </div>
                      <span className={`text-[10px] px-2 py-1 rounded-full font-bold border ${getStatusColor(report.status)}`}>
                        {report.status}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {reports.length === 0 && (
              <div className="text-center py-10">
                <Clock className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Aucun rapport disponible</p>
                <p className="text-[11px] text-muted-foreground mt-1">Le premier check-up s'exécutera à minuit</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}