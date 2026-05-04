import { useState, useEffect } from "react";
import { ArrowLeft, Check, X, RefreshCw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import moment from "moment";
import BedouValidationDialog from "@/components/bedou/BedouValidationDialog";

export default function GestionBedou() {
  const navigate = useNavigate();
  const [recharges, setRecharges] = useState([]);
  const [retraits, setRetraits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [rechargeListe, retraitListe] = await Promise.all([
        base44.entities.DemandeRecharge.list("-created_date", 500),
        base44.entities.DemandeRetrait.list("-created_date", 500),
      ]);
      setRecharges(rechargeListe || []);
      setRetraits(retraitListe || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const unsub1 = base44.entities.DemandeRecharge.subscribe((event) => {
      if (event.type === "create") {
        setRecharges(prev => [event.data, ...prev]);
        toast.info("📌 Nouvelle demande de recharge Bedou");
      } else if (event.type === "update") {
        setRecharges(prev => prev.map(r => r.id === event.id ? event.data : r));
      } else if (event.type === "delete") {
        setRecharges(prev => prev.filter(r => r.id !== event.id));
      }
    });
    const unsub2 = base44.entities.DemandeRetrait.subscribe((event) => {
      if (event.type === "create") {
        setRetraits(prev => [event.data, ...prev]);
        toast.info("📌 Nouvelle demande de retrait Bedou");
      } else if (event.type === "update") {
        setRetraits(prev => prev.map(r => r.id === event.id ? event.data : r));
      } else if (event.type === "delete") {
        setRetraits(prev => prev.filter(r => r.id !== event.id));
      }
    });
    return () => { unsub1?.(); unsub2?.(); };
  }, []);

  const rechargesEnAttente = recharges.filter(r => r.statut === "en_attente");
  const retraitsEnAttente = retraits.filter(r => r.statut === "en_attente");
  const totalEnAttente = rechargesEnAttente.length + retraitsEnAttente.length;

  const stats = {
    rechargesValidees: recharges.filter(r => r.statut === "valide").length,
    retraitsValides: retraits.filter(r => r.statut === "valide").length,
    rechargesRefusees: recharges.filter(r => r.statut === "refuse").length,
    retraitsRefuses: retraits.filter(r => r.statut === "refuse").length,
    montantRecharges: recharges.filter(r => r.statut === "valide").reduce((s, r) => s + (r.montant || 0), 0),
    montantRetraits: retraits.filter(r => r.statut === "valide").reduce((s, r) => s + (r.montant || 0), 0),
  };

  const ouvrirDemande = (request, type) => {
    setSelectedRequest({ ...request, type });
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setSelectedRequest(null);
  };

  const handleValidationSuccess = () => {
    handleDialogClose();
    loadData();
  };

  const RequestCard = ({ request, type }) => {
    const statusConfig = {
      en_attente: { label: "⏳ En attente", bg: "bg-amber-100 text-amber-700" },
      valide:     { label: "✅ Validé",     bg: "bg-green-100 text-green-700" },
      refuse:     { label: "❌ Refusé",     bg: "bg-red-100 text-red-700" },
    };
    const cfg = statusConfig[request.statut] || statusConfig.en_attente;

    return (
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="font-semibold text-sm truncate">{request.user_nom || request.user_name}</p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${cfg.bg}`}>{cfg.label}</span>
              </div>
              <p className="text-xs font-medium">{request.user_email}</p>
              <p className="text-xs text-muted-foreground">{request.numero_reception || request.numero_transaction || "—"}</p>
              <p className="text-xs text-muted-foreground">
                {type === "recharge" ? "🔄 Recharge" : "💸 Retrait"} • {moment(request.created_date).fromNow()}
              </p>
            </div>
            <div className="text-right flex-shrink-0 space-y-1">
              <p className="text-lg font-bold text-primary">{request.montant?.toLocaleString()} F</p>
              {request.bonus > 0 && (
                <p className="text-xs text-amber-600 font-semibold">+{request.bonus?.toLocaleString()} F bonus</p>
              )}
              <p className="text-[10px] text-muted-foreground">{request.methode_paiement || request.methode || "—"}</p>
              {type === "recharge" && (request.preuve_paiement_url || request.preuve_paiement) && (
                <button
                  onClick={() => window.open(request.preuve_paiement_url || request.preuve_paiement, "_blank")}
                  className="text-[10px] text-blue-600 underline"
                >
                  📷 Voir preuve
                </button>
              )}
            </div>
          </div>

          {request.statut === "en_attente" && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 border-green-300 text-green-700 hover:bg-green-50 text-xs"
                onClick={() => ouvrirDemande(request, type)}
              >
                <Check className="h-3 w-3 mr-1" /> Valider
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 border-red-300 text-red-700 hover:bg-red-50 text-xs"
                onClick={() => ouvrirDemande(request, type)}
              >
                <X className="h-3 w-3 mr-1" /> Refuser
              </Button>
            </div>
          )}

          {request.statut === "refuse" && request.motif_refus && (
            <div className="p-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              <p className="font-medium">Motif :</p>
              <p>{request.motif_refus}</p>
            </div>
          )}
        </CardContent>
      </Card>
    );
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
        <h1 className="text-xl font-bold flex-1">Gestion Bedou & Transactions</h1>
        <Button variant="ghost" size="icon" onClick={loadData}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card className={totalEnAttente > 0 ? "border-amber-300 bg-amber-50" : ""}>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-amber-600">{totalEnAttente}</p>
            <p className="text-[10px] text-amber-700 font-semibold mt-1">EN ATTENTE</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-green-600">{stats.rechargesValidees + stats.retraitsValides}</p>
            <p className="text-[10px] text-green-700 font-semibold mt-1">TRAITÉS</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{rechargesEnAttente.length}</p>
            <p className="text-[10px] text-muted-foreground">Recharges en attente</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-purple-600">{retraitsEnAttente.length}</p>
            <p className="text-[10px] text-muted-foreground">Retraits en attente</p>
          </CardContent>
        </Card>
      </div>

      {/* Résumé financier */}
      <Card className="bg-gradient-to-r from-green-50 to-blue-50">
        <CardContent className="p-4 grid grid-cols-2 gap-4 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Recharges validées</p>
            <p className="text-2xl font-bold text-green-600">{stats.montantRecharges.toLocaleString()} F</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Retraits validés</p>
            <p className="text-2xl font-bold text-purple-600">{stats.montantRetraits.toLocaleString()} F</p>
          </div>
        </CardContent>
      </Card>

      {/* Listes */}
      <Tabs defaultValue="attente">
        <TabsList className="w-full">
          <TabsTrigger value="attente" className="flex-1">⏳ Attente ({totalEnAttente})</TabsTrigger>
          <TabsTrigger value="traites" className="flex-1">✅ Traités ({stats.rechargesValidees + stats.retraitsValides})</TabsTrigger>
          <TabsTrigger value="refuses" className="flex-1">❌ Refusés ({stats.rechargesRefusees + stats.retraitsRefuses})</TabsTrigger>
        </TabsList>

        <TabsContent value="attente" className="space-y-3 mt-4">
          {rechargesEnAttente.map(r => <RequestCard key={r.id} request={r} type="recharge" />)}
          {retraitsEnAttente.map(r => <RequestCard key={r.id} request={r} type="retrait" />)}
          {totalEnAttente === 0 && (
            <div className="text-center py-8 text-muted-foreground">✅ Aucune demande en attente</div>
          )}
        </TabsContent>

        <TabsContent value="traites" className="space-y-3 mt-4">
          {recharges.filter(r => r.statut === "valide").map(r => <RequestCard key={r.id} request={r} type="recharge" />)}
          {retraits.filter(r => r.statut === "valide").map(r => <RequestCard key={r.id} request={r} type="retrait" />)}
          {stats.rechargesValidees + stats.retraitsValides === 0 && (
            <p className="text-center py-8 text-muted-foreground">Aucune demande validée</p>
          )}
        </TabsContent>

        <TabsContent value="refuses" className="space-y-3 mt-4">
          {recharges.filter(r => r.statut === "refuse").map(r => <RequestCard key={r.id} request={r} type="recharge" />)}
          {retraits.filter(r => r.statut === "refuse").map(r => <RequestCard key={r.id} request={r} type="retrait" />)}
          {stats.rechargesRefusees + stats.retraitsRefuses === 0 && (
            <p className="text-center py-8 text-muted-foreground">Aucune demande refusée</p>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog isolé — monté seulement quand ouvert */}
      {dialogOpen && selectedRequest && (
        <BedouValidationDialog
          request={selectedRequest}
          onClose={handleDialogClose}
          onSuccess={handleValidationSuccess}
        />
      )}
    </div>
  );
}