import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, AlertTriangle, CheckCircle2, Clock, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import moment from 'moment';

export default function HealthDashboard() {
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
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
    setLoading(true);
    try {
      const res = await base44.functions.invoke('systemHealthCheck', {});
      console.log('[HealthDashboard] Check result:', res.data);
      setLoading(false);
    } catch (err) {
      console.error('[HealthDashboard] Check failed:', err);
      setLoading(false);
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

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">Santé du système</h1>
      </div>

      {/* Bouton check rapide */}
      <Button 
        onClick={runHealthCheck}
        className="w-full bg-blue-600 hover:bg-blue-700"
      >
        <TrendingUp className="h-4 w-4 mr-2" />
        Lancer un check-up maintenant
      </Button>

      {/* Statut global */}
      {selectedReport && (
        <Card className={`border-2 ${getStatusColor(selectedReport.status)}`}>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              {getStatusIcon(selectedReport.status)}
              <span className="font-bold text-sm uppercase">
                {selectedReport.status === 'healthy' ? '✅ Système sain' : 
                 selectedReport.status === 'warning' ? '⚠️ Avertissements' : 
                 '🚨 Problèmes critiques'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Dernier check : {moment(selectedReport.date_check).format('DD/MM/YYYY HH:mm')}
            </p>
            <div className="grid grid-cols-4 gap-2 text-xs mt-2">
              <div className="text-center">
                <p className="font-bold">{selectedReport.errors_detected}</p>
                <p className="text-muted-foreground">Erreurs</p>
              </div>
              <div className="text-center">
                <p className="font-bold text-green-600">{selectedReport.errors_fixed}</p>
                <p className="text-muted-foreground">Corrigées</p>
              </div>
              <div className="text-center">
                <p className="font-bold text-red-600">{selectedReport.errors_critical}</p>
                <p className="text-muted-foreground">Critiques</p>
              </div>
              <div className="text-center">
                <p className="font-bold">{selectedReport.execution_time_ms}ms</p>
                <p className="text-muted-foreground">Temps</p>
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
          {selectedReport && (() => {
            const reportData = JSON.parse(selectedReport.report_json || '{}');
            return (
              <div className="space-y-4">
                {/* Modules vérifiés */}
                {reportData.modules_checked && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Modules vérifiés</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-1">
                        {reportData.modules_checked.map(m => (
                          <span key={m} className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                            {m}
                          </span>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Erreurs détectées */}
                {reportData.errors?.length > 0 && (
                  <Card className="border-amber-200">
                    <CardHeader>
                      <CardTitle className="text-sm text-amber-700">
                        ⚠️ Erreurs détectées ({reportData.errors.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1 text-xs">
                        {reportData.errors.map((err, idx) => (
                          <p key={idx} className="text-amber-700">{err}</p>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Corrections automatiques */}
                {reportData.fixed?.length > 0 && (
                  <Card className="border-green-200">
                    <CardHeader>
                      <CardTitle className="text-sm text-green-700">
                        ✅ Corrections automatiques ({reportData.fixed.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1 text-xs max-h-40 overflow-y-auto">
                        {reportData.fixed.map((fix, idx) => (
                          <p key={idx} className="text-green-700">{fix}</p>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Problèmes critiques */}
                {reportData.critical?.length > 0 && (
                  <Card className="border-red-200">
                    <CardHeader>
                      <CardTitle className="text-sm text-red-700">
                        🚨 Problèmes critiques ({reportData.critical.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1 text-xs">
                        {reportData.critical.map((crit, idx) => (
                          <p key={idx} className="text-red-700 font-semibold">{crit}</p>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            );
          })()}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {reports.map(report => (
              <Card
                key={report.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelectedReport(report)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1">
                      {getStatusIcon(report.status)}
                      <div>
                        <p className="text-xs font-semibold">
                          {moment(report.date_check).format('DD/MM/YYYY HH:mm')}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {report.errors_detected} erreurs · {report.errors_fixed} corrigées · {report.errors_critical} critiques
                        </p>
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-bold ${getStatusColor(report.status)}`}>
                      {report.status === 'healthy' ? '✅' : report.status === 'warning' ? '⚠️' : '🚨'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
            {reports.length === 0 && (
              <p className="text-center text-xs text-muted-foreground py-4">Aucun rapport disponible</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}