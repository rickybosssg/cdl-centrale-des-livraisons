import { useState, useEffect } from "react";
import { ArrowLeft, Check, X, Eye, MessageCircle, History, AlertCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import moment from "moment";

export default function GestionBedou() {
  const navigate = useNavigate();
  const [recharges, setRecharges] = useState([]);
  const [retraits, setRetraits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState("attente");
  const [admin, setAdmin] = useState(null);

  const loadData = async () => {
    try {
      const me = await base44.auth.me();
      setAdmin(me);
      const [rechargeListe, retraitListe] = await Promise.all([
        base44.entities.DemandeRecharge.list("-created_date", 500),
        base44.entities.DemandeRetrait.list("-created_date", 500),
      ]);
      setRecharges(rechargeListe);
      setRetraits(retraitListe);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Souscrire aux mises à jour en temps réel
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

  // Stats
  const stats = {
    rechargesEnAttente: rechargesEnAttente.length,
    retraitsEnAttente: retraitsEnAttente.length,
    rechargesValidees: recharges.filter(r => r.statut === "valide").length,
    retraitsValides: retraits.filter(r => r.statut === "valide").length,
    rechargesRefusees: recharges.filter(r => r.statut === "refuse").length,
    retraitsRefuses: retraits.filter(r => r.statut === "refuse").length,
    montantRecharges: recharges.filter(r => r.statut === "valide").reduce((s, r) => s + (r.montant || 0), 0),
    montantRetraits: retraits.filter(r => r.statut === "valide").reduce((s, r) => s + (r.montant || 0), 0),
  };

  const handleValider = async (request, type) => {
    // ANTI-DOUBLE-CLIC : vérifier statut localement avant d'appeler le backend
    if (request.statut !== "en_attente") {
      toast.error("Cette demande a déjà été traitée.");
      setDialogOpen(false);
      return;
    }

    setProcessing(true);
    console.log('[BEDOU_VALIDATE] START | request_id:', request.id, '| type:', type, '| user:', request.user_email);

    try {
      const res = await base44.functions.invoke('validateBedouRequest', {
        request_id: request.id,
        type,
        action: 'valider',
      });

      const d = res.data;
      console.log('[BEDOU_VALIDATE] RESULT |', JSON.stringify({
        recharge_id: d?.recharge_id,
        user_email: d?.user_email,
        montant_credite: d?.montant_credite,
        ancien_solde: d?.ancien_solde,
        nouveau_solde: d?.nouveau_solde,
        notification_client_sent: d?.notification_client_sent,
        elapsed_ms: d?.elapsed_ms,
      }));

      if (d?.already_processed) {
        toast.warning("⚠️ Demande déjà traitée — aucun double crédit.");
        setDialogOpen(false);
        loadData();
        return;
      }

      toast.success(`✅ Solde crédité de ${d?.montant_credite?.toLocaleString()} F CFA | Notification: ${d?.notification_client_sent ? '✅' : '⚠️ en attente'}`);
      setDialogOpen(false);
      setComment("");
      loadData();
    } catch (err) {
      console.error('[BEDOU_VALIDATE] ERROR:', err?.message);
      toast.error("❌ " + (err?.message || "Erreur inconnue"));
    } finally {
      setProcessing(false);
    }
  };

  const handleRefuser = async (request, type) => {
    if (!comment.trim()) {
      toast.error("Veuillez indiquer un motif de refus");
      return;
    }

    setProcessing(true);
    try {
      const res = await base44.functions.invoke('validateBedouRequest', {
        request_id: request.id,
        type,
        action: 'refuser',
        motif_refus: comment.trim(),
      });

      if (res.data?.already_processed) {
        toast.warning("⚠️ Demande déjà traitée.");
        setDialogOpen(false);
        loadData();
        return;
      }

      toast.success("Demande refusée — client notifié");
      setDialogOpen(false);
      setComment("");
      loadData();
    } catch (err) {
      console.error('[GestionBedou] handleRefuser error:', err?.message);
      toast.error("Erreur lors du refus : " + err?.message);
    } finally {
      setProcessing(false);
    }
  };

  const ouvrirDemande = (request, type) => {
    setSelectedRequest({ ...request, type });
    setComment(request.motif_refus || "");
    setDialogOpen(true);
  };

  const RequestCard = ({ request, type }) => {
    const statusConfig = {
      "en_attente": { label: "⏳ En attente", bg: "bg-amber-100 text-amber-700" },
      "valide": { label: "✅ Validé", bg: "bg-green-100 text-green-700" },
      "refuse": { label: "❌ Refusé", bg: "bg-red-100 text-red-700" },
    };
    const cfg = statusConfig[request.statut] || statusConfig["en_attente"];

    return (
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="font-semibold text-sm truncate">{request.user_nom}</p>              
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${cfg.bg}`}>
                  {cfg.label}
                </span>
              </div>
              <p className="text-xs font-medium">{request.user_email}</p>
              <p className="text-xs text-muted-foreground">{request.numero_reception || request.numero_transaction || "—"}</p>
              <p className="text-xs text-muted-foreground">
                {type === "recharge" ? "🔄 Recharge" : "💸 Retrait"} • {moment(request.created_date).fromNow()}
              </p>
            </div>
            <div className="text-right flex-shrink-0 space-y-1">
              <p className="text-lg font-bold text-primary">{request.montant?.toLocaleString()} F</p>
              <p className="text-[10px] text-muted-foreground">{request.methode || "—"}</p>
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
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold flex-1">Gestion Bedou & Transactions</h1>
      </div>

      {/* Stats principales */}
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
            <p className="text-2xl font-bold text-blue-600">{stats.rechargesEnAttente}</p>
            <p className="text-[10px] text-muted-foreground">Recharges en attente</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-purple-600">{stats.retraitsEnAttente}</p>
            <p className="text-[10px] text-muted-foreground">Retraits en attente</p>
          </CardContent>
        </Card>
      </div>

      {/* Résumé financier */}
      <Card className="bg-gradient-to-r from-green-50 to-blue-50">
        <CardContent className="p-4 grid grid-cols-2 gap-4 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Montant recharges validées</p>
            <p className="text-2xl font-bold text-green-600">{stats.montantRecharges.toLocaleString()} F</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Montant retraits validés</p>
            <p className="text-2xl font-bold text-purple-600">{stats.montantRetraits.toLocaleString()} F</p>
          </div>
        </CardContent>
      </Card>

      {/* Listes par statut */}
      <Tabs defaultValue="attente" onValueChange={setActiveTab}>
        <TabsList className="w-full">
          <TabsTrigger value="attente" className="flex-1">
            ⏳ En attente ({totalEnAttente})
          </TabsTrigger>
          <TabsTrigger value="traites" className="flex-1">
            ✅ Traités ({stats.rechargesValidees + stats.retraitsValides})
          </TabsTrigger>
          <TabsTrigger value="refuses" className="flex-1">
            ❌ Refusés ({stats.rechargesRefusees + stats.retraitsRefuses})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="attente" className="space-y-3 mt-4">
          {rechargesEnAttente.map(r => <RequestCard key={r.id} request={r} type="recharge" />)}
          {retraitsEnAttente.map(r => <RequestCard key={r.id} request={r} type="retrait" />)}
          {totalEnAttente === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <p>✅ Aucune demande en attente</p>
            </div>
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

      {/* Dialog traitement */}
      <Dialog open={dialogOpen} onOpenChange={v => {
        setDialogOpen(v);
        if (!v) setComment("");
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Traiter la demande Bedou</DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50 space-y-1 text-sm">
                <p><strong>{selectedRequest.user_nom}</strong></p>
                <p className="text-xs text-muted-foreground">{selectedRequest.user_email}</p>
                <p className="text-lg font-bold text-primary mt-2">{selectedRequest.montant?.toLocaleString()} FCFA</p>
                <p className="text-xs text-muted-foreground">
                  {selectedRequest.type === "recharge" ? "🔄 Recharge" : "💸 Retrait"} • {moment(selectedRequest.created_date).format("DD/MM/YYYY HH:mm")}
                </p>
              </div>

              {/* Preuve de paiement */}
              {selectedRequest?.type === "recharge" && (selectedRequest?.preuve_paiement_url || selectedRequest?.preuve_paiement) && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Preuve de paiement</label>
                  <div
                    className="rounded-xl overflow-hidden border-2 border-blue-200 cursor-pointer"
                    onClick={() => window.open(selectedRequest.preuve_paiement_url || selectedRequest.preuve_paiement, "_blank")}
                  >
                    <img
                      src={selectedRequest.preuve_paiement_url || selectedRequest.preuve_paiement}
                      alt="Preuve de paiement"
                      className="w-full max-h-48 object-contain bg-gray-50"
                    />
                    <div className="bg-blue-50 text-blue-700 text-xs py-1.5 text-center font-medium">
                      🔍 Cliquer pour agrandir
                    </div>
                  </div>
                </div>
              )}
              {/* Afficher aussi le bonus si recharge */}
              {selectedRequest?.type === "recharge" && selectedRequest?.bonus > 0 && (
                <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                  🎁 Bonus inclus : +{selectedRequest.bonus?.toLocaleString()} F → Total à créditer : <strong>{selectedRequest.montant_total?.toLocaleString()} F</strong>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-semibold">Commentaire (refus obligatoire)</label>
                <Textarea
                  placeholder="Motif de refus ou note..."
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setDialogOpen(false)}
                >
                  Annuler
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => handleRefuser(selectedRequest, selectedRequest.type)}
                  disabled={processing}
                >
                  ❌ Refuser
                </Button>
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-700"
                  onClick={() => handleValider(selectedRequest, selectedRequest.type)}
                  disabled={processing}
                >
                  ✅ Valider
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}