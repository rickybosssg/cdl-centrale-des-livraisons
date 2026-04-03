import { useState, useEffect } from "react";
import { Check, X, Eye } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import moment from "moment";

const TARIF = 5000;

export default function GererPublicites() {
  const [pubs, setPubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPub, setSelectedPub] = useState(null);
  const [motifRefus, setMotifRefus] = useState("");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await base44.entities.Publicite.list("-created_date", 100);
        setPubs(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error("[GererPublicites] Error:", e);
      } finally {
        setLoading(false);
      }
    };
    load();

    try {
      const unsub = base44.entities.Publicite.subscribe(load);
      return unsub;
    } catch (e) {
      console.error('[GererPublicites] Subscribe error:', e);
      return () => {};
    }
  }, []);

  const safePubs = Array.isArray(pubs) ? pubs : [];
  const pubsEnAttente = safePubs.filter(p => p && p.statut === "en_attente");
  const pubsValidees = safePubs.filter(p => p && p.statut === "validée");
  const pubsRefusees = safePubs.filter(p => p && p.statut === "refusée");

  const validerPub = async (pub) => {
    setProcessing(true);
    try {
      // FIX #5: Utiliser fonction atomique pour validation + débit
      const res = await base44.functions.invoke('validateAndChargeAdAtomic', {
        pub_id: pub.id,
        pub_title: pub.titre,
        advertiser_email: pub.created_by,
        amount: TARIF,
      });
      
      if (!res.data?.success) {
        toast.error(res.data?.error || 'Erreur validation');
        setProcessing(false);
        return;
      }

      toast.success(`Publicité "${pub.titre}" validée et débitée (${TARIF.toLocaleString()}F)`);
      setPubs(prev => prev.map(p => p.id === pub.id ? { ...p, statut: "validée", active: true } : p));
      setSelectedPub(null);
    } catch (e) {
      console.error("[GererPublicites] Validation error:", e);
      toast.error("Erreur lors de la validation");
    } finally {
      setProcessing(false);
    }
  };

  const refuserPub = async (pub) => {
    if (!motifRefus.trim()) {
      toast.error("Veuillez entrer un motif de refus");
      return;
    }

    setProcessing(true);
    try {
      // FIX #4: Rembourser automatiquement si pub refusée
      await base44.functions.invoke("bedouEngine", {
        action: "credit",
        user_email: pub.created_by,
        montant: TARIF,
        raison: `Remboursement publicité refusée: ${pub.titre}`,
      });

      await base44.entities.Publicite.update(pub.id, {
        statut: "refusée",
        motif_refus: motifRefus,
        active: false,
      });

      await base44.entities.Notification.create({
        destinataire_email: pub.created_by,
        destinataire_role: "annonceur",
        titre: "❌ Publicité refusée (remboursée)",
        message: `Votre publicité "${pub.titre}" a été refusée. Motif: ${motifRefus}. ${TARIF.toLocaleString()}F remboursés.`,
        type: "warning",
        lue: false,
      });

      toast.success("Publicité refusée et remboursée");
      setPubs(prev => prev.map(p => p.id === pub.id ? { ...p, statut: "refusée" } : p));
      setSelectedPub(null);
      setMotifRefus("");
    } catch (e) {
      console.error("[GererPublicites] Refusal error:", e);
      toast.error("Erreur lors du refus");
    } finally {
      setProcessing(false);
    }
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
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Eye className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Gestion des publicités</h1>
          <p className="text-xs text-muted-foreground">Valider ou refuser les demandes</p>
        </div>
      </div>

      <Tabs defaultValue="attente">
        <TabsList className="w-full grid grid-cols-3 text-[10px]">
          <TabsTrigger value="attente">En attente ({pubsEnAttente.length})</TabsTrigger>
          <TabsTrigger value="validees">Validées ({pubsValidees.length})</TabsTrigger>
          <TabsTrigger value="refusees">Refusées ({pubsRefusees.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="attente" className="mt-4 space-y-2">
          {pubsEnAttente.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Aucune demande en attente</div>
          ) : (
            pubsEnAttente.map(pub => <PubCard key={pub.id} pub={pub} onSelect={setSelectedPub} />)
          )}
        </TabsContent>

        <TabsContent value="validees" className="mt-4 space-y-2">
          {pubsValidees.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Aucune pub validée</div>
          ) : (
            pubsValidees.map(pub => <PubCard key={pub.id} pub={pub} />)
          )}
        </TabsContent>

        <TabsContent value="refusees" className="mt-4 space-y-2">
          {pubsRefusees.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Aucune pub refusée</div>
          ) : (
            pubsRefusees.map(pub => <PubCard key={pub.id} pub={pub} />)
          )}
        </TabsContent>
      </Tabs>

      {/* Modal détails pub */}
      {selectedPub && (
        <Dialog open={!!selectedPub} onOpenChange={() => setSelectedPub(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Détails de la publicité</DialogTitle>
            </DialogHeader>

            <div className="space-y-3">
              {selectedPub.image_url && (
                <img src={selectedPub.image_url} alt="" className="w-full h-32 rounded-lg object-cover" />
              )}

              <div className="space-y-1.5 text-sm">
                <p>
                  <strong>Titre:</strong> {selectedPub.titre}
                </p>
                <p>
                  <strong>Annonceur:</strong> {selectedPub.created_by}
                </p>
                <p>
                  <strong>Placement:</strong> {selectedPub.placement}
                </p>
                <p>
                  <strong>Coût:</strong> {TARIF.toLocaleString()}F
                </p>
                <p>
                  <strong>Durée:</strong> 7 jours
                </p>
              </div>

              {selectedPub.statut === "en_attente" && (
                <div className="space-y-2">
                  <textarea
                    placeholder="Motif de refus (si applicable)"
                    value={motifRefus}
                    onChange={e => setMotifRefus(e.target.value)}
                    className="w-full border rounded-md px-3 py-2 text-sm resize-none"
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 text-red-600 border-red-300"
                      onClick={() => refuserPub(selectedPub)}
                      disabled={processing}
                    >
                      <X className="h-4 w-4 mr-1" /> Refuser
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={() => validerPub(selectedPub)}
                      disabled={processing}
                    >
                      <Check className="h-4 w-4 mr-1" /> Valider
                    </Button>
                  </div>
                </div>
              )}

              {selectedPub.statut === "refusée" && selectedPub.motif_refus && (
                <div className="p-2 rounded-lg bg-red-50 border border-red-200">
                  <p className="text-xs text-red-700">
                    <strong>Motif:</strong> {selectedPub.motif_refus}
                  </p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function PubCard({ pub, onSelect }) {
  const statusColors = {
    "en_attente": "bg-amber-100 text-amber-700",
    "validée": "bg-green-100 text-green-700",
    "refusée": "bg-red-100 text-red-700",
  };

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-all"
      onClick={() => onSelect?.(pub)}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{pub.titre}</p>
            <p className="text-[10px] text-muted-foreground">{pub.created_by}</p>
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 whitespace-nowrap ${statusColors[pub.statut]}`}>
            {pub.statut}
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground">
          📍 {pub.placement} · {TARIF.toLocaleString()}F
        </p>
      </CardContent>
    </Card>
  );
}