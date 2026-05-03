/**
 * BedouFinancialDashboard — Dashboard financier Bedou
 * Source : entités Transaction (validation_admin) uniquement
 * ⚠️ READ ONLY — aucune modification de données
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, TrendingUp, Users, Zap, BarChart2, AlertTriangle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from "recharts";
import moment from "moment";

export default function BedouFinancialDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState({
    total_recharges_jour: 0,
    total_retrait_jour: 0,
    total_bonus_jour: 0,
    total_credit_jour: 0,
    nombre_transactions_jour: 0,
    delay_avg: 0,
  });
  const [chart7j, setChart7j] = useState([]);
  const [topClients, setTopClients] = useState([]);
  const [fraudLogs, setFraudLogs] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const [txs, frauds] = await Promise.allSettled([
        base44.entities.Transaction.filter({ source: "validation_admin" }, "-date_validation", 500),
        base44.entities.BedouFraudLog.list("-created_date", 20),
      ]);

      const allTx = txs.status === "fulfilled" ? (txs.value || []) : [];
      const allFraud = frauds.status === "fulfilled" ? (frauds.value || []) : [];
      setFraudLogs(allFraud);

      const today = moment().format("YYYY-MM-DD");

      // KPIs du jour
      const todayTxs = allTx.filter(t => t.date_validation?.startsWith(today));
      const rechargesJour = todayTxs.filter(t => t.type === "recharge" && t.statut === "valide");
      const retraitsJour = todayTxs.filter(t => t.type === "retrait" && t.statut === "valide");

      const total_recharges_jour = rechargesJour.reduce((s, t) => s + (t.montant || 0), 0);
      const total_retrait_jour = retraitsJour.reduce((s, t) => s + (t.montant || 0), 0);
      const total_bonus_jour = rechargesJour.reduce((s, t) => s + (t.bonus || 0), 0);
      const total_credit_jour = total_recharges_jour;

      setKpis({
        total_recharges_jour,
        total_retrait_jour,
        total_bonus_jour,
        total_credit_jour,
        nombre_transactions_jour: todayTxs.length,
        delay_avg: 0,
      });

      // Évolution 7 jours
      const days7 = [];
      for (let i = 6; i >= 0; i--) {
        const dayStr = moment().subtract(i, "days").format("YYYY-MM-DD");
        const dayLabel = moment().subtract(i, "days").format("DD/MM");
        const dayTxs = allTx.filter(t => t.date_validation?.startsWith(dayStr) && t.statut === "valide");
        const recharges = dayTxs.filter(t => t.type === "recharge").reduce((s, t) => s + (t.montant || 0), 0);
        const retraits = dayTxs.filter(t => t.type === "retrait").reduce((s, t) => s + (t.montant || 0), 0);
        days7.push({ day: dayLabel, Recharges: recharges, Retraits: retraits });
      }
      setChart7j(days7);

      // Top clients par montant total rechargé
      const clientMap = {};
      allTx.filter(t => t.type === "recharge" && t.statut === "valide").forEach(t => {
        const key = t.user_email || "?";
        clientMap[key] = (clientMap[key] || 0) + (t.montant || 0);
      });
      const sorted = Object.entries(clientMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([email, montant]) => ({ email, montant }));
      setTopClients(sorted);

    } catch (e) {
      console.error("[BedouFinancialDashboard] Erreur:", e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const niveauColor = {
    low: "bg-amber-100 text-amber-700",
    medium: "bg-orange-100 text-orange-700",
    high: "bg-red-100 text-red-700",
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">💹 Dashboard Financier Bedou</h1>
          <p className="text-xs text-muted-foreground">Aujourd'hui — {moment().format("DD/MM/YYYY")}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={load}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* KPIs du jour */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-green-600">{kpis.total_recharges_jour.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">F recharges validées</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-orange-600">{kpis.total_retrait_jour.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">F retraits validés</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-400">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-amber-600">{kpis.total_bonus_jour.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">F bonus distribués</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-blue-600">{kpis.nombre_transactions_jour}</p>
            <p className="text-xs text-muted-foreground mt-1">transactions du jour</p>
          </CardContent>
        </Card>
      </div>

      {/* Graphique 7 jours */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart2 className="h-4 w-4" />
            Évolution 7 jours (F CFA)
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-4">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chart7j} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => v >= 1000 ? `${Math.round(v / 1000)}k` : v} />
              <Tooltip formatter={(v) => `${v.toLocaleString()} F`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Recharges" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Retraits" fill="#f97316" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Top clients */}
      {topClients.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4" />
              Top clients (recharges cumulées)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {topClients.map((c, i) => (
              <div key={c.email} className="flex items-center justify-between py-1.5 border-b last:border-0">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center ${
                    i === 0 ? "bg-amber-400 text-white" :
                    i === 1 ? "bg-slate-400 text-white" :
                    i === 2 ? "bg-orange-400 text-white" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {i + 1}
                  </span>
                  <p className="text-xs truncate max-w-[160px]">{c.email}</p>
                </div>
                <p className="text-xs font-bold text-green-600">{c.montant.toLocaleString()} F</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Alertes fraude récentes */}
      {fraudLogs.length > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-amber-800 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Signaux anti-fraude récents ({fraudLogs.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {fraudLogs.slice(0, 5).map((f) => (
              <div key={f.id} className="flex items-start justify-between py-1.5 border-b border-amber-200 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-amber-800">{f.type?.replace(/_/g, " ")}</p>
                  <p className="text-[10px] text-amber-700 truncate">{f.client_id}</p>
                  <p className="text-[10px] text-muted-foreground">{moment(f.created_date).fromNow()}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ml-2 ${niveauColor[f.niveau] || niveauColor.low}`}>
                  {f.niveau?.toUpperCase()}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}