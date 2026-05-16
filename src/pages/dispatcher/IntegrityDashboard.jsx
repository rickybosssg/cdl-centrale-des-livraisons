/**
 * IntegrityDashboard — Tableau de bord anti-régression CDL
 * Route : /integrity-dashboard
 *
 * Affiche :
 * - Statut global intégrité (OK / WARNING / CRITICAL)
 * - Violations détectées (double settlement, double push, legacy fields, etc.)
 * - Historique des rapports IntegrityGuard
 * - Bouton "Lancer vérification maintenant"
 */
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, ShieldCheck, ShieldAlert, ShieldX,
  RefreshCw, AlertTriangle, CheckCircle2, XCircle,
  Zap, Clock, Database, Activity
} from "lucide-react";
import moment from "moment";

// ── Config violations ─────────────────────────────────────────────────────────
const VIOLATION_CFG = {
  DOUBLE_SETTLEMENT: { icon: "💸", label: "Double settlement", desc: "Deux transactions paiement pour la même course" },
  DOUBLE_PUSH: { icon: "📣", label: "Double push FCM", desc: "Même notification envoyée 2x en < 2 min" },
  DOUBLE_DISPATCH: { icon: "📡", label: "Double dispatch", desc: "Course proposée 2x au même livreur" },
  LEGACY_ROLE_FIELD: { icon: "🚫", label: "Champ legacy role", desc: "user_type / current_role utilisés au lieu de active_profile_type" },
  DISPATCH_CONFIG_LEGACY: { icon: "⚙️", label: "DispatchConfig legacy", desc: "DispatchConfig encore présente — source unique = DispatchModeState" },
  NEGATIVE_BEDOU_BALANCE: { icon: "💰", label: "Solde Bedou négatif", desc: "Wallet avec solde < 0" },
  SETTLEMENT_STUCK: { icon: "⏳", label: "Settlement bloqué", desc: "Course en settlement_status=pending depuis > 2h" },
  RACE_DOUBLE_ASSIGN: { icon: "⚡", label: "Race condition dispatch", desc: "Course proposée simultanément à plusieurs livreurs" },
};

const STATUS_CFG = {
  OK: { color: "text-green-700 bg-green-50 border-green-400", icon: <ShieldCheck className="h-6 w-6 text-green-600" />, label: "Système sain" },
  WARNING: { color: "text-amber-700 bg-amber-50 border-amber-400", icon: <ShieldAlert className="h-6 w-6 text-amber-600" />, label: "Avertissements" },
  CRITICAL: { color: "text-red-700 bg-red-50 border-red-400", icon: <ShieldX className="h-6 w-6 text-red-600" />, label: "Violations critiques" },
};

// ── Composant violation ───────────────────────────────────────────────────────
function ViolationCard({ violation }) {
  const cfg = VIOLATION_CFG[violation.type] || { icon: "⚠️", label: violation.type, desc: "" };
  const isCritical = violation.severity === 'CRITICAL';
  return (
    <div className={`rounded-xl border-2 p-3 space-y-1 ${isCritical ? 'border-red-300 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
      <div className="flex items-center gap-2">
        <span className="text-base flex-shrink-0">{cfg.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`text-xs font-bold ${isCritical ? 'text-red-800' : 'text-amber-800'}`}>{cfg.label}</p>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${isCritical ? 'border-red-400 text-red-700' : 'border-amber-400 text-amber-700'}`}>
              {violation.severity}
            </Badge>
          </div>
          <p className="text-[10px] text-muted-foreground">{cfg.desc}</p>
        </div>
      </div>
      <p className="text-[10px] font-mono bg-white/70 rounded p-1.5 break-words">{violation.detail}</p>
      {violation.affected_ids?.length > 0 && (
        <p className="text-[10px] text-muted-foreground font-mono">IDs: {violation.affected_ids.slice(0, 3).join(', ')}{violation.affected_ids.length > 3 ? ` +${violation.affected_ids.length - 3}` : ''}</p>
      )}
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function IntegrityDashboard() {
  const navigate = useNavigate();
  const [running, setRunning] = useState(false);
  const [lastReport, setLastReport] = useState(null);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const reports = await base44.entities.SystemHealthReport.list('-created_date', 20);
      setHistory(reports || []);
      if (reports?.length > 0) {
        const latest = reports[0];
        try {
          const parsed = JSON.parse(latest.report_json || '{}');
          setLastReport({ ...latest, parsed });
        } catch (_) {
          setLastReport(latest);
        }
      }
    } catch (e) {
      console.error('[IntegrityDashboard] Error:', e);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => { loadHistory(); }, []);

  const runNow = async () => {
    setRunning(true);
    try {
      const res = await base44.functions.invoke('integrityGuard', {});
      const data = res?.data || {};
      setLastReport({ parsed: data, created_date: new Date().toISOString(), status: data.status?.toLowerCase() || 'ok' });
      await loadHistory();
    } catch (e) {
      console.error('[IntegrityDashboard] runNow error:', e);
    } finally {
      setRunning(false);
    }
  };

  const parsed = lastReport?.parsed || {};
  const status = (parsed.status || lastReport?.status || 'OK').toUpperCase();
  const statusCfg = STATUS_CFG[status] || STATUS_CFG.OK;
  const violations = parsed.violations || [];
  const criticals = violations.filter(v => v.severity === 'CRITICAL');
  const warnings = violations.filter(v => v.severity === 'WARNING');
  const checksPassed = parsed.checks_passed || [];
  const checksFailed = parsed.checks_failed || [];

  return (
    <div className="space-y-4 pb-20 px-3 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 py-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">🛡️ Intégrité Système</h1>
          <p className="text-xs text-muted-foreground">Anti-régression CDL — vérification automatique toutes les heures</p>
        </div>
        <Button variant="outline" size="icon" onClick={loadHistory} disabled={loadingHistory}>
          <RefreshCw className={`h-4 w-4 ${loadingHistory ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* STATUS GLOBAL */}
      <div className={`rounded-2xl border-2 p-5 ${statusCfg.color}`}>
        <div className="flex items-center gap-3">
          {statusCfg.icon}
          <div className="flex-1">
            <p className="font-bold text-base">{statusCfg.label}</p>
            {lastReport?.created_date && (
              <p className="text-xs opacity-70">Dernière vérification : {moment(lastReport.created_date).fromNow()}</p>
            )}
          </div>
          {parsed.elapsed_ms && (
            <p className="text-xs opacity-60 flex-shrink-0">⏱ {parsed.elapsed_ms}ms</p>
          )}
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          <div className="text-center bg-white/60 rounded-xl p-2">
            <p className="text-xl font-black text-red-700">{parsed.critical_count ?? 0}</p>
            <p className="text-[10px] font-semibold">Critiques</p>
          </div>
          <div className="text-center bg-white/60 rounded-xl p-2">
            <p className="text-xl font-black text-amber-700">{parsed.warning_count ?? 0}</p>
            <p className="text-[10px] font-semibold">Avertissements</p>
          </div>
          <div className="text-center bg-white/60 rounded-xl p-2">
            <p className="text-xl font-black text-green-700">{parsed.checks_passed ?? 0}</p>
            <p className="text-[10px] font-semibold">Checks OK</p>
          </div>
        </div>

        <Button
          className="mt-4 w-full bg-primary/90 hover:bg-primary"
          onClick={runNow}
          disabled={running}
        >
          {running ? (
            <><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />Vérification en cours...</>
          ) : (
            <><Zap className="h-4 w-4 mr-2" />Lancer vérification maintenant</>
          )}
        </Button>
      </div>

      {/* CHECKS PASSÉS */}
      {checksPassed.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Checks réussis ({checksPassed.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {checksPassed.map(c => (
                <span key={c} className="text-[10px] font-bold px-2 py-1 rounded-full bg-green-50 border border-green-300 text-green-700">
                  ✅ {c}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* VIOLATIONS CRITIQUES */}
      {criticals.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-red-600" />
            <p className="text-sm font-bold text-red-700">Violations critiques ({criticals.length})</p>
          </div>
          {criticals.map((v, i) => <ViolationCard key={i} violation={v} />)}
        </div>
      )}

      {/* AVERTISSEMENTS */}
      {warnings.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <p className="text-sm font-bold text-amber-700">Avertissements ({warnings.length})</p>
          </div>
          {warnings.map((v, i) => <ViolationCard key={i} violation={v} />)}
        </div>
      )}

      {/* STATUS OK — aucune violation */}
      {violations.length === 0 && !loadingHistory && lastReport && (
        <Card className="border-green-300">
          <CardContent className="py-8 text-center space-y-2">
            <ShieldCheck className="h-12 w-12 text-green-500 mx-auto" />
            <p className="font-bold text-green-700">Aucune violation détectée</p>
            <p className="text-xs text-muted-foreground">Tous les moteurs respectent les sources uniques de vérité.</p>
          </CardContent>
        </Card>
      )}

      {/* RÈGLES VERROUILLÉES */}
      <Card className="border-primary/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            Règles anti-régression verrouillées
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {[
            ["❌ DispatchConfig", "Remplacé par DispatchModeState + DispatchModeContext"],
            ["❌ current_role / user_type", "Remplacé par user.active_profile_type (source unique)"],
            ["❌ activeRole / role_actuel", "Idem — uniquement active_profile_type autorisé"],
            ["❌ Settlement inline", "Toutes les opérations Bedou passent par bedouEngine.finaliser_course"],
            ["❌ Double transaction paiement", "Anti-doublon : settlement_status + Transaction.reference_id"],
            ["❌ Double push FCM", "Anti-doublon : notification_key (fenêtre 60s)"],
            ["❌ Double dispatch", "Anti-doublon : SmartDispatchLog + settlement_status"],
            ["❌ Listeners subscribe() en fuite", "Chaque composant doit unsubscribe au cleanup"],
          ].map(([rule, desc], i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className="flex-shrink-0 font-bold text-red-600 w-44">{rule}</span>
              <span className="text-muted-foreground">{desc}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* HISTORIQUE */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Historique ({history.length} rapports)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingHistory ? (
            <div className="flex justify-center py-4">
              <div className="w-5 h-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-xs text-center text-muted-foreground py-3">Aucun rapport disponible. Lancez une vérification.</p>
          ) : (
            <div className="space-y-1.5">
              {history.map((r, i) => {
                const s = (r.status || 'ok').toUpperCase();
                const dotColor = s === 'OK' ? 'bg-green-500' : s === 'WARNING' ? 'bg-amber-500' : 'bg-red-500';
                return (
                  <div key={r.id || i} className="flex items-center gap-3 px-2 py-1.5 rounded-lg bg-muted/40 text-xs">
                    <div className={`h-2 w-2 rounded-full flex-shrink-0 ${dotColor}`} />
                    <span className="text-muted-foreground flex-shrink-0">{moment(r.date_check || r.created_date).format("DD/MM HH:mm")}</span>
                    <span className={`font-bold flex-shrink-0 ${s === 'OK' ? 'text-green-700' : s === 'WARNING' ? 'text-amber-700' : 'text-red-700'}`}>{s}</span>
                    <span className="text-muted-foreground">{r.errors_detected ?? 0} violation(s) · {r.errors_critical ?? 0} critique(s)</span>
                    {r.execution_time_ms && <span className="ml-auto text-muted-foreground flex-shrink-0">{r.execution_time_ms}ms</span>}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-center text-[10px] text-muted-foreground font-mono pt-2 pb-4">
        integrity_guard_v1.0 · Vérification auto toutes les heures · {new Date().toLocaleDateString()}
      </div>
    </div>
  );
}