import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, CheckCircle2, XCircle, User, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import moment from "moment";

export default function ValidationLivreurs() {
  const navigate = useNavigate();
  const [livreurs, setLivreurs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLivreur, setSelectedLivreur] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [motifRefus, setMotifRefus] = useState("");
  const [processing, setProcessing] = useState(false);

  const loadData = async () => {
    const data = await base44.entities.User.filter({ user_type: "livreur" });
    setLivreurs(data);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    const unsub = base44.entities.User.subscribe((event) => {
      if (event.data?.user_type !== 'livreur') return;
      if (event.type === 'create') {
        setLivreurs(prev => [...prev, event.data]);
        toast.info('Nouveau livreur en attente de validation !');
      } else if (event.type === 'update') {
        setLivreurs(prev => prev.map(l => l.id === event.id ? event.data : l));
      } else if (event.type === 'delete') {
        setLivreurs(prev => prev.filter(l => l.id !== event.id));
      }
    });
    return unsub;
  }, []);

  const valider = async (livreur) => {
    setProcessing(true);
    await base44.entities.User.update(livreur.id, {
      statut_validation_livreur: "valide",
      profil_valide: true,
      actif: true,
      date_validation: new Date().toISOString(),
    });
    toast.success("Le livreur a été validé avec succès !");
    setDialogOpen(false);
    loadData();
    setProcessing(false);
  };

  const refuser = async (livreur) => {
    setProcessing(true);
    await base44.entities.User.update(livreur.id, {
      statut_validation_livreur: "refuse",
      profil_valide: false,
      motif_refus: motifRefus || "Documents insuffisants",
    });
    toast.success("Le livreur a été refusé");
    setDialogOpen(false);
    setMotifRefus("");
    loadData();
    setProcessing(false);
  };

  const enAttente = livreurs.filter(l => !l.statut_validation_livreur || l.statut_validation_livreur === "en_attente");
  const valides = livreurs.filter(l => l.statut_validation_livreur === "valide");
  const refuses = livreurs.filter(l => l.statut_validation_livreur === "refuse");

  const StatutBadge = ({ statut }) => {
    const cfg = {
      "en_attente": "bg-amber-100 text-amber-700",
      "valide": "bg-green-100 text-green-700",
      "refuse": "bg-red-100 text-red-700",
    };
    const labels = { en_attente: "En attente", valide: "Validé", refuse: "Refusé" };
    const key = statut || "en_attente";
    return (
      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg[key]}`}>
        {labels[key]}
      </span>
    );
  };

  const LivreurCard = ({ livreur }) => (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {livreur.photo_profil ? (
            <img src={livreur.photo_profil} alt="Photo" className="h-12 w-12 rounded-full object-cover border" />
          ) : (
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-6 w-6 text-primary" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm">{livreur.full_name}</p>
              <StatutBadge statut={livreur.statut_validation_livreur} />
            </div>
            <p className="text-xs text-muted-foreground">{livreur.telephone}</p>
            <p className="text-xs text-muted-foreground">{livreur.quartier}</p>
            <p className="text-xs text-muted-foreground">Inscrit le {moment(livreur.created_date).format("DD/MM/YYYY")}</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs flex-shrink-0"
            onClick={() => { setSelectedLivreur(livreur); setDialogOpen(true); }}
          >
            <Eye className="h-3 w-3 mr-1" />
            Voir
          </Button>
        </div>
      </CardContent>
    </Card>
  );

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
        <h1 className="text-xl font-bold">Validation des livreurs</h1>
      </div>

      <Tabs defaultValue="attente">
        <TabsList className="w-full">
          <TabsTrigger value="attente" className="flex-1 text-xs">
            En attente ({enAttente.length})
          </TabsTrigger>
          <TabsTrigger value="valides" className="flex-1 text-xs">
            Validés ({valides.length})
          </TabsTrigger>
          <TabsTrigger value="refuses" className="flex-1 text-xs">
            Refusés ({refuses.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="attente" className="space-y-3 mt-3">
          {enAttente.map(l => <LivreurCard key={l.id} livreur={l} />)}
          {enAttente.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Aucun livreur en attente de validation</p>}
        </TabsContent>

        <TabsContent value="valides" className="space-y-3 mt-3">
          {valides.map(l => <LivreurCard key={l.id} livreur={l} />)}
          {valides.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Aucun livreur validé</p>}
        </TabsContent>

        <TabsContent value="refuses" className="space-y-3 mt-3">
          {refuses.map(l => <LivreurCard key={l.id} livreur={l} />)}
          {refuses.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Aucun livreur refusé</p>}
        </TabsContent>
      </Tabs>

      {/* Dialog détail livreur */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Dossier livreur</DialogTitle>
          </DialogHeader>
          {selectedLivreur && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                {selectedLivreur.photo_profil ? (
                  <img src={selectedLivreur.photo_profil} alt="Photo" className="h-16 w-16 rounded-full object-cover border-2 border-primary" />
                ) : (
                  <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-8 w-8 text-primary" />
                  </div>
                )}
                <div>
                  <p className="font-bold">{selectedLivreur.full_name}</p>
                  <p className="text-sm text-muted-foreground">{selectedLivreur.telephone}</p>
                  <p className="text-sm text-muted-foreground">{selectedLivreur.quartier}</p>
                  <StatutBadge statut={selectedLivreur.statut_validation_livreur} />
                </div>
              </div>

              {/* Documents */}
              <div className="space-y-2">
                <p className="text-sm font-semibold">Documents fournis</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "CNI Recto", url: selectedLivreur.photo_identite_recto },
                    { label: "CNI Verso", url: selectedLivreur.photo_identite_verso },
                    { label: "Photo moto", url: selectedLivreur.photo_moto },
                  ].map(doc => (
                    <div key={doc.label} className="border rounded-lg overflow-hidden">
                      {doc.url ? (
                        <a href={doc.url} target="_blank" rel="noreferrer">
                          <img src={doc.url} alt={doc.label} className="w-full h-20 object-cover hover:opacity-80 transition-opacity" />
                        </a>
                      ) : (
                        <div className="h-20 bg-muted flex items-center justify-center">
                          <p className="text-xs text-muted-foreground">Non fourni</p>
                        </div>
                      )}
                      <p className="text-[10px] text-center py-1 text-muted-foreground">{doc.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {(!selectedLivreur.statut_validation_livreur || selectedLivreur.statut_validation_livreur === "en_attente") && (
                <>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Motif de refus (optionnel)</p>
                    <input
                      className="w-full border rounded-md px-3 py-1.5 text-sm"
                      placeholder="Ex: Documents illisibles..."
                      value={motifRefus}
                      onChange={e => setMotifRefus(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 border-red-300 text-red-600 hover:bg-red-50"
                      onClick={() => refuser(selectedLivreur)}
                      disabled={processing}
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Refuser
                    </Button>
                    <Button
                      className="flex-1 bg-green-600 hover:bg-green-700"
                      onClick={() => valider(selectedLivreur)}
                      disabled={processing}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Valider
                    </Button>
                  </div>
                </>
              )}

              {selectedLivreur.statut_validation_livreur === "valide" && (
                <Button
                  variant="outline"
                  className="w-full border-red-300 text-red-600"
                  onClick={() => refuser(selectedLivreur)}
                  disabled={processing}
                >
                  Révoquer la validation
                </Button>
              )}

              {selectedLivreur.motif_refus && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  <p className="font-medium">Motif de refus :</p>
                  <p>{selectedLivreur.motif_refus}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}