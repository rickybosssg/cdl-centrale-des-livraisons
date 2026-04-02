import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { AlertCircle, CheckCircle2, XCircle, Clock, ArrowUp, ArrowDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import moment from "moment";

export default function BeDouHistory({ userEmail, userRole }) {
  const [recharges, setRecharges] = useState([]);
  const [retraits, setRetraits] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const [rechargeListe, retraitListe, transactionListe] = await Promise.all([
        base44.entities.DemandeRecharge.filter({ user_email: userEmail }, "-created_date", 50),
        base44.entities.DemandeRetrait.filter({ user_email: userEmail }, "-created_date", 50),
        base44.entities.Transaction.filter({ user_email: userEmail }, "-created_date", 50),
      ]);
      setRecharges(rechargeListe);
      setRetraits(retraitListe);
      setTransactions(transactionListe);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Souscrire aux changements
    const unsub1 = base44.entities.DemandeRecharge.subscribe((event) => {
      if (event.data?.user_email === userEmail) {
        if (event.type === "create") {
          setRecharges(prev => [event.data, ...prev]);
        } else if (event.type === "update") {
          setRecharges(prev => prev.map(r => r.id === event.id ? event.data : r));
        }
      }
    });

    const unsub2 = base44.entities.DemandeRetrait.subscribe((event) => {
      if (event.data?.user_email === userEmail) {
        if (event.type === "create") {
          setRetraits(prev => [event.data, ...prev]);
        } else if (event.type === "update") {
          setRetraits(prev => prev.map(r => r.id === event.id ? event.data : r));
        }
      }
    });

    const unsub3 = base44.entities.Transaction.subscribe((event) => {
      if (event.data?.user_email === userEmail) {
        if (event.type === "create") {
          setTransactions(prev => [event.data, ...prev]);
        } else if (event.type === "update") {
          setTransactions(prev => prev.map(t => t.id === event.id ? event.data : t));
        }
      }
    });

    return () => { unsub1?.(); unsub2?.(); unsub3?.(); };
  }, [userEmail]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-6 h-6 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const allEvents = [
    ...recharges.map(r => ({ ...r, type: "recharge", date: r.created_date })),
    ...retraits.map(r => ({ ...r, type: "retrait", date: r.created_date })),
    ...transactions.map(t => ({ ...t, type: "transaction", date: t.created_date })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  const getStatusIcon = (statut) => {
    if (statut === "valide" || statut === "success") return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    if (statut === "refuse" || statut === "rejected") return <XCircle className="h-4 w-4 text-red-600" />;
    return <Clock className="h-4 w-4 text-amber-600" />;
  };

  const getStatusLabel = (statut) => {
    const labels = {
      "en_attente": "⏳ En attente",
      "valide": "✅ Validé",
      "refuse": "❌ Refusé",
      "success": "✅ Succès",
      "rejected": "❌ Refusé",
    };
    return labels[statut] || statut;
  };

  const getEventMessage = (event) => {
    if (event.type === "recharge") {
      if (event.statut === "en_attente") {
        return `💰 Recharge de ${event.montant?.toLocaleString()} FCFA - En attente`;
      } else if (event.statut === "valide") {
        return `✅ Recharge de ${event.montant?.toLocaleString()} FCFA - Validée`;
      } else {
        return `❌ Recharge de ${event.montant?.toLocaleString()} FCFA - Refusée`;
      }
    } else if (event.type === "retrait") {
      if (event.statut === "en_attente") {
        return `📤 Retrait de ${event.montant?.toLocaleString()} FCFA - En attente`;
      } else if (event.statut === "valide") {
        return `✅ Retrait de ${event.montant?.toLocaleString()} FCFA - Effectué`;
      } else {
        return `❌ Retrait de ${event.montant?.toLocaleString()} FCFA - Refusé`;
      }
    } else if (event.type === "transaction") {
      const sens = event.sens === "credit" ? "📥 Crédit" : "📤 Débit";
      const montant = event.montant?.toLocaleString() || 0;
      const typeLabel = {
        "recharge": "Recharge",
        "retrait": "Retrait",
        "commission": "Commission",
        "gain": "Gain",
        "bonus": "Bonus",
        "ajustement": "Ajustement",
      }[event.type] || event.type;
      return `${sens} de ${montant} FCFA - ${typeLabel}`;
    }
    return "Transaction";
  };

  return (
    <div className="space-y-3">
      {allEvents.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <p>Aucune transaction Bedou</p>
        </div>
      ) : (
        allEvents.map((event, idx) => (
          <Card key={`${event.type}-${event.id}`} className={
            event.statut === "valide" || event.statut === "success"
              ? "border-green-200 bg-green-50/30"
              : event.statut === "refuse" || event.statut === "rejected"
              ? "border-red-200 bg-red-50/30"
              : "border-amber-200 bg-amber-50/30"
          }>
            <CardContent className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-3 flex-1">
                  {getStatusIcon(event.statut || "en_attente")}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{getEventMessage(event)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {moment(event.date).fromNow()} • {moment(event.date).format("DD/MM/YYYY HH:mm")}
                    </p>
                  </div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap ${
                  event.statut === "valide" || event.statut === "success"
                    ? "bg-green-100 text-green-700"
                    : event.statut === "refuse" || event.statut === "rejected"
                    ? "bg-red-100 text-red-700"
                    : "bg-amber-100 text-amber-700"
                }`}>
                  {getStatusLabel(event.statut)}
                </span>
              </div>

              {/* Afficher le motif si refusé */}
              {(event.statut === "refuse" || event.statut === "rejected") && event.motif_refus && (
                <div className="p-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex gap-2">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                  <span><strong>Motif:</strong> {event.motif_refus}</span>
                </div>
              )}

              {/* Afficher la référence si disponible */}
              {(event.numero_reception || event.numero_transaction || event.reference_id) && (
                <p className="text-[10px] text-muted-foreground">
                  Réf: {event.numero_reception || event.numero_transaction || event.reference_id}
                </p>
              )}

              {/* Afficher le mode de paiement si disponible */}
              {event.methode && (
                <p className="text-[10px] text-muted-foreground">
                  Via: {event.methode}
                </p>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}