/**
 * BedouHistory — Historique BEDOU_AUDIT (READ ONLY)
 * Source : logs console BEDOU_AUDIT + entités Transaction
 * ⚠️ NE MODIFIE AUCUNE DONNÉE — lecture seule
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Search, RefreshCw, Download, TrendingUp, Users, Clock } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import moment from "moment";

const PAGE_SIZE = 20;

export default function BedouHistory() {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filterDate, setFilterDate] = useState("");
  const [filterClient, setFilterClient] = useState("");
  const [filterAdmin, setFilterAdmin] = useState("");
  const [filterAction, setFilterAction] = useState("all");
  const [stats, setStats] = useState({ total_montant: 0, total_bonus: 0, count: 0, avg_delay: 0 });

  const load = async () => {
    setLoading(true);
    try {
      // Source : entité Transaction (source=validation_admin, type=recharge|retrait)
      const txs = await base44.entities.Transaction.filter(
        { source: "validation_admin" },
        "-date_validation",
        500
      );
      setTransactions(txs || []);
    } catch (e) {
      console.error("[BedouHistory] Erreur:", e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Filtres
  useEffect(() => {
    let data = [...transactions];

    if (filterDate) {
      data = data.filter(t => t.date_validation?.startsWith(filterDate));
    }
    if (filterClient) {
      const q = filterClient.toLowerCase();
      data = data.filter(t => t.user_email?.toLowerCase().includes(q) || t.user_nom?.toLowerCase().includes(q));
    }
    if (filterAdmin) {
      const q = filterAdmin.toLowerCase();
      data = data.filter(t => t.valide_par?.toLowerCase().includes(q));
    }
    if (filterAction !== "all") {
      data = data.filter(t => t.type === filterAction);
    }

    // Stats
    const montantTotal = data.reduce((s, t) => s + (t.montant || 0), 0);
    const bonusTotal = data.reduce((s, t) => s + (t.bonus || 0), 0);
    setStats({
      total_montant: montantTotal,
      total_bonus: bonusTotal,
      count: data.length,
      avg_delay: 0,
    });

    setFiltered(data);
    setPage(1);
  }, [transactions, filterDate, filterClient, filterAdmin, filterAction]);

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const resetFilters = () => {
    setFilterDate("");
    setFilterClient("");
    setFilterAdmin("");
    setFilterAction("all");
  };

  const exportCSV = () => {
    const rows = [
      ["date_validation", "admin_email", "client_email", "type", "montant", "statut"],
      ...filtered.map(t => [
        t.date_validation || "",
        t.valide_par || "",
        t.user_email || "",
        t.type || "",
        t.montant || 0,
        t.statut || "",
      ]),
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bedou_history_${moment().format("YYYYMMDD")}.csv`;
    a.click();
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
      {/* Header */}
      <div className="flex items-center gap-3 px-1">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">📋 Historique Bedou</h1>
          <p className="text-xs text-muted-foreground">READ ONLY — {transactions.length} transactions</p>
        </div>
        <Button variant="ghost" size="icon" onClick={load}>
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={exportCSV} className="text-xs">
          <Download className="h-3.5 w-3.5 mr-1" /> CSV
        </Button>
      </div>

      {/* Stats du filtre actif */}
      <div className="grid grid-cols-3 gap-2">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold text-green-600">{stats.total_montant.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">F CFA crédités</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold text-amber-600">{stats.total_bonus.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">F bonus</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold text-blue-600">{stats.count}</p>
            <p className="text-[10px] text-muted-foreground">transactions</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtres */}
      <Card>
        <CardContent className="p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Date (YYYY-MM-DD)</label>
              <Input
                type="date"
                value={filterDate}
                onChange={e => setFilterDate(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Type</label>
              <select
                value={filterAction}
                onChange={e => setFilterAction(e.target.value)}
                className="w-full h-8 text-xs border rounded-md px-2 bg-background"
              >
                <option value="all">Tous</option>
                <option value="recharge">Recharges</option>
                <option value="retrait">Retraits</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="🔍 Filtrer par client..."
              value={filterClient}
              onChange={e => setFilterClient(e.target.value)}
              className="h-8 text-xs"
            />
            <Input
              placeholder="🔍 Filtrer par admin..."
              value={filterAdmin}
              onChange={e => setFilterAdmin(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          {(filterDate || filterClient || filterAdmin || filterAction !== "all") && (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="text-xs w-full">
              ✕ Réinitialiser filtres
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Résultats */}
      <p className="text-xs text-muted-foreground px-1">
        {filtered.length} résultats — Page {page}/{totalPages || 1}
      </p>

      <div className="space-y-2">
        {paginated.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Aucune transaction trouvée avec ces filtres
          </div>
        ) : (
          paginated.map((t) => (
            <Card key={t.id} className="border-l-4 border-l-blue-400">
              <CardContent className="p-3 space-y-1.5">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        t.type === "recharge" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
                      }`}>
                        {t.type === "recharge" ? "🔄 Recharge" : "💸 Retrait"}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        t.statut === "valide" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                      }`}>
                        {t.statut === "valide" ? "✅ Validé" : "❌ Refusé"}
                      </span>
                    </div>
                    <p className="text-sm font-semibold mt-1 truncate">{t.user_email}</p>
                    <p className="text-xs text-muted-foreground">
                      Admin : {t.valide_par || "—"}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-base font-bold text-primary">{(t.montant || 0).toLocaleString()} F</p>
                    <p className="text-[10px] text-muted-foreground">
                      {t.date_validation ? moment(t.date_validation).format("DD/MM HH:mm") : "—"}
                    </p>
                  </div>
                </div>
                {t.reference_id && (
                  <p className="text-[10px] text-muted-foreground font-mono">
                    ref: {t.reference_id}
                  </p>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
          >
            ← Précédent
          </Button>
          <span className="text-xs text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
          >
            Suivant →
          </Button>
        </div>
      )}
    </div>
  );
}