/**
 * AdminLogs — Historiques visibles admin
 * Onglets : Dispatch · Settlement · Bedou · Notifications · Erreurs
 */
import { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, RefreshCw, Package, Wallet, Bell, AlertTriangle, Zap, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import moment from "moment";

// ── Helpers ────────────────────────────────────────────────────────────────────
function ago(d) { return d ? moment(d).fromNow() : "—"; }
function fmt(d) { return d ? moment(d).format("DD/MM HH:mm") : "—"; }
function money(n) { return n != null ? `${Number(n).toLocaleString()} F` : "—"; }

function StatusPill({ status }) {
  const cfg = {
    completed: { bg: "bg-green-100 text-green-800", icon: <CheckCircle2 className="h-3 w-3" />, label: "OK" },
    valide:    { bg: "bg-green-100 text-green-800", icon: <CheckCircle2 className="h-3 w-3" />, label: "Validé" },
    paye:      { bg: "bg-green-100 text-green-800", icon: <CheckCircle2 className="h-3 w-3" />, label: "Payé" },
    sent:      { bg: "bg-green-100 text-green-800", icon: <CheckCircle2 className="h-3 w-3" />, label: "Envoyé" },
    success:   { bg: "bg-green-100 text-green-800", icon: <CheckCircle2 className="h-3 w-3" />, label: "OK" },
    pending:   { bg: "bg-amber-100 text-amber-800", icon: <Clock className="h-3 w-3" />,        label: "Pend." },
    en_attente:{ bg: "bg-amber-100 text-amber-800", icon: <Clock className="h-3 w-3" />,        label: "Attente" },
    partial:   { bg: "bg-amber-100 text-amber-800", icon: <AlertTriangle className="h-3 w-3" />, label: "Partiel" },
    failed:    { bg: "bg-red-100 text-red-800",     icon: <XCircle className="h-3 w-3" />,      label: "Échec" },
    refuse:    { bg: "bg-red-100 text-red-800",     icon: <XCircle className="h-3 w-3" />,      label: "Refusé" },
  }[status] || { bg: "bg-gray-100 text-gray-700", icon: null, label: status || "—" };
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${cfg.bg}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

// ── Onglet Dispatch ────────────────────────────────────────────────────────────
function DispatchTab() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await base44.entities.SmartDispatchLog.list("-created_date", 100);
      setLogs(data || []);
    } catch (e) {
      console.error("[AdminLogs/dispatch]", e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loader />;
  if (logs.length === 0) return <Empty label="Aucun log de dispatch" />;

  // Stats rapides
  const accepted = logs.filter(l => l.accepted).length;
  const refused  = logs.filter(l => l.refused).length;
  const timeout  = logs.filter(l => l.status === "timeout").length;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <StatMini label="Acceptées" value={accepted} color="text-green-600" bg="bg-green-50" />
        <StatMini label="Refusées" value={refused} color="text-red-600" bg="bg-red-50" />
        <StatMini label="Timeout" value={timeout} color="text-amber-600" bg="bg-amber-50" />
      </div>
      <div className="space-y-1.5 max-h-[480px] overflow-y-auto">
        {logs.map(l => (
          <div key={l.id} className="flex items-start gap-2 p-2.5 rounded-xl border bg-card text-xs">
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{l.driver_name || l.driver_email}</p>
              <p className="text-muted-foreground truncate">Course {l.course_id?.slice(0, 8)}… · score={l.score ?? "—"} · {l.distance_km != null ? `${l.distance_km}km` : ""}</p>
              <p className="text-muted-foreground">{fmt(l.sent_at)}</p>
            </div>
            <StatusPill status={l.accepted ? "completed" : l.refused ? "refuse" : l.status} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Onglet Settlement ─────────────────────────────────────────────────────────
function SettlementTab() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await base44.entities.CourseSettlementLog.list("-created_date", 100);
      setLogs(data || []);
    } catch (e) {
      console.error("[AdminLogs/settlement]", e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loader />;
  if (logs.length === 0) return <Empty label="Aucun settlement" />;

  const completed = logs.filter(l => l.settlement_status === "completed").length;
  const failed    = logs.filter(l => l.settlement_status === "failed").length;
  const pending   = logs.filter(l => l.settlement_status === "pending").length;
  const totalComm = logs.filter(l => l.settlement_status === "completed")
    .reduce((s, l) => s + (l.cdl_commission || 0), 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-1.5">
        <StatMini label="Complétés" value={completed} color="text-green-600" bg="bg-green-50" />
        <StatMini label="Échoués"   value={failed}    color="text-red-600"   bg="bg-red-50" />
        <StatMini label="En cours"  value={pending}   color="text-amber-600" bg="bg-amber-50" />
        <StatMini label="Commission" value={`${Math.round(totalComm / 1000)}k F`} color="text-primary" bg="bg-primary/5" />
      </div>
      <div className="space-y-1.5 max-h-[480px] overflow-y-auto">
        {logs.map(l => (
          <div key={l.id} className={`p-2.5 rounded-xl border text-xs space-y-0.5 ${l.settlement_status === "failed" ? "border-red-200 bg-red-50/40" : "bg-card"}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold truncate">Course {l.course_id?.slice(0, 8)}…</p>
              <StatusPill status={l.settlement_status} />
            </div>
            <p className="text-muted-foreground">Client: {l.client_nom || l.client_email} · Livreur: {l.driver_nom || l.driver_email}</p>
            <div className="flex gap-3 text-muted-foreground">
              <span>Total: {money(l.course_amount)}</span>
              <span>Livreur: {money(l.driver_credit)}</span>
              <span>CDL: {money(l.cdl_commission)}</span>
            </div>
            {l.error_message && <p className="text-red-700 font-medium">⚠️ {l.error_message}</p>}
            <p className="text-muted-foreground">{fmt(l.settled_at || l.created_date)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Onglet Bedou ──────────────────────────────────────────────────────────────
function BedouTab() {
  const [txs, setTxs] = useState([]);
  const [recharges, setRecharges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("transactions");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [txRes, rchRes] = await Promise.allSettled([
        base44.entities.Transaction.list("-created_date", 100),
        base44.entities.DemandeRecharge.list("-created_date", 100),
      ]);
      if (txRes.status === "fulfilled") setTxs(txRes.value || []);
      if (rchRes.status === "fulfilled") setRecharges(rchRes.value || []);
    } catch (e) {
      console.error("[AdminLogs/bedou]", e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loader />;

  const totalCredits = txs.filter(t => t.sens === "credit").reduce((s, t) => s + (t.montant || 0), 0);
  const totalDebits  = txs.filter(t => t.sens === "debit").reduce((s, t) => s + (t.montant || 0), 0);
  const pendingRch   = recharges.filter(r => r.statut === "en_attente").length;

  const TYPE_COLORS = {
    recharge:    "bg-blue-100 text-blue-800",
    gain:        "bg-green-100 text-green-800",
    bonus:       "bg-yellow-100 text-yellow-800",
    paiement:    "bg-orange-100 text-orange-800",
    retrait:     "bg-red-100 text-red-800",
    commission:  "bg-purple-100 text-purple-800",
    ajustement:  "bg-gray-100 text-gray-700",
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1.5">
        <StatMini label="Crédits" value={`${Math.round(totalCredits / 1000)}k F`} color="text-green-600" bg="bg-green-50" />
        <StatMini label="Débits"  value={`${Math.round(totalDebits / 1000)}k F`}  color="text-red-600"   bg="bg-red-50" />
        <StatMini label="Recharges pend." value={pendingRch} color="text-amber-600" bg="bg-amber-50" />
      </div>

      {/* Mini-onglets internes */}
      <div className="flex gap-2">
        <button onClick={() => setTab("transactions")} className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all ${tab === "transactions" ? "bg-primary text-white border-primary" : "border-border"}`}>
          Transactions ({txs.length})
        </button>
        <button onClick={() => setTab("recharges")} className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all ${tab === "recharges" ? "bg-primary text-white border-primary" : "border-border"}`}>
          Recharges ({recharges.length})
        </button>
      </div>

      {tab === "transactions" && (
        <div className="space-y-1.5 max-h-[440px] overflow-y-auto">
          {txs.length === 0 ? <Empty label="Aucune transaction" /> : txs.map(t => (
            <div key={t.id} className="flex items-start gap-2 p-2.5 rounded-xl border bg-card text-xs">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="font-semibold">{t.user_nom || t.user_email}</p>
                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${TYPE_COLORS[t.type] || "bg-gray-100 text-gray-700"}`}>{t.type}</span>
                </div>
                <p className="text-muted-foreground truncate">{t.description}</p>
                <p className="text-muted-foreground">{fmt(t.created_date)}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className={`font-extrabold ${t.sens === "credit" ? "text-green-700" : "text-red-600"}`}>
                  {t.sens === "credit" ? "+" : "-"}{money(t.montant)}
                </p>
                <StatusPill status={t.statut} />
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "recharges" && (
        <div className="space-y-1.5 max-h-[440px] overflow-y-auto">
          {recharges.length === 0 ? <Empty label="Aucune recharge" /> : recharges.map(r => (
            <div key={r.id} className={`p-2.5 rounded-xl border text-xs space-y-0.5 ${r.statut === "en_attente" ? "border-amber-200 bg-amber-50/40" : "bg-card"}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{r.user_nom || r.user_email}</p>
                <StatusPill status={r.statut} />
              </div>
              <p className="text-muted-foreground">{money(r.montant)} via {r.methode_paiement || r.methode}</p>
              {r.bonus_applique > 0 && <p className="text-green-700">+{money(r.bonus_applique)} bonus</p>}
              <p className="text-muted-foreground">{fmt(r.created_date)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Onglet Notifications ──────────────────────────────────────────────────────
function NotifTab() {
  const [notifs, setNotifs] = useState([]);
  const [testLogs, setTestLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("notifs");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nRes, tRes] = await Promise.allSettled([
        base44.entities.Notification.list("-created_date", 100),
        base44.entities.NotificationTestLog.list("-created_date", 50),
      ]);
      if (nRes.status === "fulfilled") setNotifs(nRes.value || []);
      if (tRes.status === "fulfilled") setTestLogs(tRes.value || []);
    } catch (e) {
      console.error("[AdminLogs/notif]", e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loader />;

  const unread = notifs.filter(n => !n.lue).length;

  const TYPE_ICON = { success: "✅", danger: "❌", warning: "⚠️", info: "ℹ️" };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1.5">
        <StatMini label="Total" value={notifs.length} color="text-primary" bg="bg-primary/5" />
        <StatMini label="Non lues" value={unread} color="text-amber-600" bg="bg-amber-50" />
        <StatMini label="Tests push" value={testLogs.length} color="text-blue-600" bg="bg-blue-50" />
      </div>

      <div className="flex gap-2">
        <button onClick={() => setTab("notifs")} className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all ${tab === "notifs" ? "bg-primary text-white border-primary" : "border-border"}`}>
          Notifications ({notifs.length})
        </button>
        <button onClick={() => setTab("push")} className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all ${tab === "push" ? "bg-primary text-white border-primary" : "border-border"}`}>
          Logs Push ({testLogs.length})
        </button>
      </div>

      {tab === "notifs" && (
        <div className="space-y-1.5 max-h-[440px] overflow-y-auto">
          {notifs.length === 0 ? <Empty label="Aucune notification" /> : notifs.map(n => (
            <div key={n.id} className={`flex items-start gap-2 p-2.5 rounded-xl border text-xs ${!n.lue ? "border-primary/30 bg-primary/5" : "bg-card"}`}>
              <span className="text-base flex-shrink-0">{TYPE_ICON[n.type] || "📢"}</span>
              <div className="flex-1 min-w-0">
                <p className={`font-semibold truncate ${!n.lue ? "text-foreground" : "text-muted-foreground"}`}>{n.titre}</p>
                <p className="text-muted-foreground truncate">{n.destinataire_email}</p>
                <p className="text-muted-foreground">{fmt(n.created_date)} {!n.lue && <span className="text-primary font-bold">· Non lue</span>}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "push" && (
        <div className="space-y-1.5 max-h-[440px] overflow-y-auto">
          {testLogs.length === 0 ? <Empty label="Aucun log push" /> : testLogs.map(l => (
            <div key={l.id} className={`p-2.5 rounded-xl border text-xs space-y-0.5 ${l.status === "failed" ? "border-red-200 bg-red-50/40" : "bg-card"}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{l.recipient_email}</p>
                <StatusPill status={l.status} />
              </div>
              <p className="text-muted-foreground">Tokens: {l.tokens_count} · Envoyés: {l.sent_count} · Échecs: {l.failed_count}</p>
              <p className="text-muted-foreground">{fmt(l.timestamp)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Onglet Erreurs système ────────────────────────────────────────────────────
function ErrorsTab() {
  const [adminLogs, setAdminLogs] = useState([]);
  const [repairLogs, setRepairLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("admin");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [aRes, rRes] = await Promise.allSettled([
        base44.entities.AdminActionLog.list("-created_date", 100),
        base44.entities.RepairLog.list("-created_date", 50),
      ]);
      if (aRes.status === "fulfilled") setAdminLogs(aRes.value || []);
      if (rRes.status === "fulfilled") setRepairLogs(rRes.value || []);
    } catch (e) {
      console.error("[AdminLogs/errors]", e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loader />;

  const ACTION_COLORS = {
    COURSE_CANCELLED: "bg-red-100 text-red-800",
    COURSE_DELETED:   "bg-red-100 text-red-800",
    PROFILE_VALIDATED:"bg-green-100 text-green-800",
    PROFILE_REFUSED:  "bg-red-100 text-red-800",
    PROFILE_SUSPENDED:"bg-amber-100 text-amber-800",
    AD_VALIDATED:     "bg-green-100 text-green-800",
    AD_REFUSED:       "bg-red-100 text-red-800",
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button onClick={() => setTab("admin")} className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all ${tab === "admin" ? "bg-primary text-white border-primary" : "border-border"}`}>
          Actions admin ({adminLogs.length})
        </button>
        <button onClick={() => setTab("repair")} className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all ${tab === "repair" ? "bg-primary text-white border-primary" : "border-border"}`}>
          Réparations ({repairLogs.length})
        </button>
      </div>

      {tab === "admin" && (
        <div className="space-y-1.5 max-h-[480px] overflow-y-auto">
          {adminLogs.length === 0 ? <Empty label="Aucune action admin" /> : adminLogs.map(l => (
            <div key={l.id} className="p-2.5 rounded-xl border bg-card text-xs space-y-0.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${ACTION_COLORS[l.action_type] || "bg-gray-100 text-gray-700"}`}>{l.action_type}</span>
                <p className="text-muted-foreground">{fmt(l.created_date)}</p>
              </div>
              <p className="font-semibold">{l.admin_name || l.admin_email}</p>
              <p className="text-muted-foreground truncate">{l.details}</p>
            </div>
          ))}
        </div>
      )}

      {tab === "repair" && (
        <div className="space-y-1.5 max-h-[480px] overflow-y-auto">
          {repairLogs.length === 0 ? <Empty label="Aucun log de réparation" /> : repairLogs.map(l => (
            <div key={l.id} className={`p-2.5 rounded-xl border text-xs space-y-0.5 ${l.status === "error" ? "border-red-200 bg-red-50/40" : "bg-card"}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{l.module || "—"}</p>
                <StatusPill status={l.status === "error" ? "failed" : "completed"} />
              </div>
              <p className="text-muted-foreground truncate">{l.message}</p>
              <p className="text-muted-foreground">{fmt(l.created_date)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sous-composants ────────────────────────────────────────────────────────────
function StatMini({ label, value, color, bg }) {
  return (
    <div className={`p-2 rounded-xl border text-center ${bg || "bg-card"}`}>
      <p className={`text-base font-extrabold leading-none ${color}`}>{value ?? "—"}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{label}</p>
    </div>
  );
}
function Loader() {
  return (
    <div className="flex justify-center py-10">
      <div className="w-6 h-6 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );
}
function Empty({ label }) {
  return <p className="text-center text-xs text-muted-foreground py-8">{label}</p>;
}

// ── Composant principal ────────────────────────────────────────────────────────
export default function AdminLogs() {
  const navigate = useNavigate();

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Historiques Admin</h1>
          <p className="text-xs text-muted-foreground">Dispatch · Settlement · Bedou · Notifications · Erreurs</p>
        </div>
      </div>

      <Tabs defaultValue="dispatch">
        <TabsList className="w-full grid grid-cols-5 h-auto">
          <TabsTrigger value="dispatch"  className="text-[10px] py-1.5 flex-col gap-0.5 h-auto"><Zap className="h-3.5 w-3.5" />Dispatch</TabsTrigger>
          <TabsTrigger value="settlement" className="text-[10px] py-1.5 flex-col gap-0.5 h-auto"><Package className="h-3.5 w-3.5" />Settlement</TabsTrigger>
          <TabsTrigger value="bedou"     className="text-[10px] py-1.5 flex-col gap-0.5 h-auto"><Wallet className="h-3.5 w-3.5" />Bedou</TabsTrigger>
          <TabsTrigger value="notifs"    className="text-[10px] py-1.5 flex-col gap-0.5 h-auto"><Bell className="h-3.5 w-3.5" />Notifs</TabsTrigger>
          <TabsTrigger value="errors"    className="text-[10px] py-1.5 flex-col gap-0.5 h-auto"><AlertTriangle className="h-3.5 w-3.5" />Erreurs</TabsTrigger>
        </TabsList>

        <TabsContent value="dispatch"   className="mt-3"><DispatchTab /></TabsContent>
        <TabsContent value="settlement" className="mt-3"><SettlementTab /></TabsContent>
        <TabsContent value="bedou"      className="mt-3"><BedouTab /></TabsContent>
        <TabsContent value="notifs"     className="mt-3"><NotifTab /></TabsContent>
        <TabsContent value="errors"     className="mt-3"><ErrorsTab /></TabsContent>
      </Tabs>
    </div>
  );
}