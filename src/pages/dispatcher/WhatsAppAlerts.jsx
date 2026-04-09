import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, RefreshCw, Send, CheckCircle2, XCircle, Clock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import moment from "moment";

const STATUS_CONFIG = {
  sent:    { label: "Envoyé",    color: "bg-green-100 text-green-700",  icon: CheckCircle2 },
  pending: { label: "En attente", color: "bg-amber-100 text-amber-700", icon: Clock },
  failed:  { label: "Échec",     color: "bg-red-100 text-red-700",      icon: XCircle },
  skipped: { label: "Ignoré",    color: "bg-gray-100 text-gray-600",    icon: AlertCircle },
};

const PRIORITY_COLORS = {
  urgent: "text-red-600 font-bold",
  high:   "text-orange-600 font-semibold",
  normal: "text-muted-foreground",
};

export default function WhatsAppAlerts() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("tous");
  const [filterEvent, setFilterEvent] = useState("tous");
  const [resending, setResending] = useState(null);

  const load = async () => {
    setLoading(true);
    const data = await base44.entities.WhatsAppNotificationLog.list("-created_date", 200);
    setLogs(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleResend = async (logId) => {
    setResending(logId);
    try {
      const res = await base44.functions.invoke('resendWhatsAppAlert', { logId });
      if (res.data?.success) {
        toast.success("Message renvoyé !");
        load();
      } else {
        toast.error("Échec du renvoi");
      }
    } catch (err) {
      toast.error("Erreur : " + err.message);
    }
    setResending(null);
  };

  const eventTypes = [...new Set(logs.map(l => l.event_type).filter(Boolean))];

  const filtered = logs.filter(l => {
    const matchStatus = filterStatus === "tous" || l.status === filterStatus;
    const matchEvent  = filterEvent  === "tous" || l.event_type === filterEvent;
    return matchStatus && matchEvent;
  });

  const stats = {
    sent:    logs.filter(l => l.status === "sent").length,
    failed:  logs.filter(l => l.status === "failed").length,
    pending: logs.filter(l => l.status === "pending").length,
    skipped: logs.filter(l => l.status === "skipped").length,
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Alertes WhatsApp</h1>
          <p className="text-xs text-muted-foreground">Historique des notifications envoyées</p>
        </div>
        <Button variant="outline" size="icon" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { key: "sent",    label: "Envoyés",    color: "text-green-600" },
          { key: "failed",  label: "Échoués",    color: "text-red-600" },
          { key: "pending", label: "En attente", color: "text-amber-600" },
          { key: "skipped", label: "Ignorés",    color: "text-gray-500" },
        ].map(s => (
          <Card key={s.key} className="cursor-pointer hover:shadow-md" onClick={() => setFilterStatus(s.key)}>
            <CardContent className="p-3 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{stats[s.key]}</p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filtres */}
      <div className="flex gap-2 flex-wrap">
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 rounded-xl border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="tous">Tous les statuts</option>
          <option value="sent">Envoyés</option>
          <option value="failed">Échoués</option>
          <option value="pending">En attente</option>
          <option value="skipped">Ignorés</option>
        </select>
        <select
          value={filterEvent}
          onChange={e => setFilterEvent(e.target.value)}
          className="px-3 py-2 rounded-xl border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="tous">Tous les événements</option>
          {eventTypes.map(et => (
            <option key={et} value={et}>{et}</option>
          ))}
        </select>
        {(filterStatus !== "tous" || filterEvent !== "tous") && (
          <Button variant="outline" size="sm" onClick={() => { setFilterStatus("tous"); setFilterEvent("tous"); }}>
            Réinitialiser
          </Button>
        )}
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Aucune alerte trouvée</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(log => {
            const sc = STATUS_CONFIG[log.status] || STATUS_CONFIG.pending;
            const Icon = sc.icon;
            return (
              <Card key={log.id} className="overflow-hidden">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${sc.color} flex items-center gap-1`}>
                          <Icon className="h-3 w-3" />
                          {sc.label}
                        </span>
                        <span className={`text-xs ${PRIORITY_COLORS[log.priority] || ""}`}>
                          {log.priority}
                        </span>
                        <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                          {log.event_type}
                        </span>
                      </div>
                      <p className="text-sm font-semibold mt-1">
                        {log.recipient_name || log.recipient_phone}
                        {log.recipient_role && <span className="text-xs text-muted-foreground ml-1">({log.recipient_role})</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">{log.recipient_phone}</p>
                    </div>
                    <div className="text-right flex-shrink-0 text-xs text-muted-foreground">
                      {moment(log.created_date).format("DD/MM HH:mm")}
                    </div>
                  </div>

                  {/* Message */}
                  <div className="bg-muted/50 rounded-lg p-2 text-xs whitespace-pre-wrap text-foreground">
                    {log.message_text}
                  </div>

                  {/* Erreur */}
                  {log.error_message && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700">
                      ⚠️ {log.error_message}
                      {log.retry_count > 0 && <span className="ml-2">({log.retry_count} tentative{log.retry_count > 1 ? "s" : ""})</span>}
                    </div>
                  )}

                  {/* Bouton renvoi */}
                  {log.status === "failed" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full border-primary/30 text-primary"
                      onClick={() => handleResend(log.id)}
                      disabled={resending === log.id}
                    >
                      {resending === log.id ? (
                        <><RefreshCw className="h-3 w-3 mr-1 animate-spin" />Renvoi en cours...</>
                      ) : (
                        <><Send className="h-3 w-3 mr-1" />Renvoyer ce message</>
                      )}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}