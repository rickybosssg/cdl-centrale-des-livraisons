import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Search, TrendingUp, AlertTriangle, XCircle, CreditCard, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import moment from "moment";

const MODES_PAIEMENT = ["Espèces", "Orange Money", "Moov Money", "Telecel Money", "Virement", "Autre"];

export default function SuiviCommissions() {
  const navigate = useNavigate();
  const [livreurs, setLivreurs] = useState([]);
  const [courses, setCourses] = useState([]);
  const [paiements, setPaiements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState("tous");
  const [recherche, setRecherche] = useState("");
  const [selectedLivreur, setSelectedLivreur] = useState(null);
  const [dialogPaiement, setDialogPaiement] = useState(false);
  const [dialogHistorique, setDialogHistorique] = useState(false);
  const [formPaiement, setFormPaiement] = useState({ montant: "", date_paiement: "", mode_paiement: "", reference: "", commentaire: "" });
  const [saving, setSaving] = useState(false);
  const [admin, setAdmin] = useState(null);

  const loadData = async () => {
    const [livreursData, coursesData, paiementsData, me] = await Promise.all([
      base44.entities.User.filter({ user_type: "livreur" }),
      base44.entities.Course.filter({ $or: [{ statut: "livree" }, { moyen_transport: { $exists: true } }] }),
      base44.entities.PaiementCommission.list("-created_date", 200),
      base44.auth.me(),
    ]);
    setLivreurs(livreursData);
    setCourses(coursesData);
    setPaiements(paiementsData);
    setAdmin(me);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const getSolde = (livreur) => livreur.solde_commission_du || 0;
  const getStatut = (livreur) => {
    if (livreur.livreur_bloque) return "Bloqué";
    if (getSolde(livreur) > 0) return "Doit une commission";
    return "À jour";
  };

  const today = new Date().toDateString();
  const startOfWeek = new Date(); startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const startOfMonth = new Date(); startOfMonth.setDate(1);

  const totalGenAujourdhui = courses
    .filter(c => new Date(c.date_livraison).toDateString() === today)
    .reduce((s, c) => s + (c.commission_cdl || (c.prix * 0.2) || 0), 0);
  const totalGenMois = courses
    .filter(c => new Date(c.date_livraison) >= startOfMonth)
    .reduce((s, c) => s + (c.commission_cdl || (c.prix * 0.2) || 0), 0);
  const totalEncaisse = paiements.reduce((s, p) => s + (p.montant || 0), 0);
  const totalImpaye = livreurs.reduce((s, l) => s + getSolde(l), 0);

  const livreursFiltres = livreurs
    .filter(l => {
      const statut = getStatut(l);
      if (filtre === "a_jour") return statut === "À jour";
      if (filtre === "doit") return statut === "Doit une commission";
      if (filtre === "bloque") return statut === "Bloqué";
      return true;
    })
    .filter(l => !recherche || l.full_name?.toLowerCase().includes(recherche.toLowerCase()) || l.telephone?.includes(recherche));

  const enregistrerPaiement = async () => {
    if (!formPaiement.montant || !formPaiement.mode_paiement || !formPaiement.date_paiement) {
      toast.error("Veuillez remplir tous les champs obligatoires");
      return;
    }
    setSaving(true);
    const montant = parseFloat(formPaiement.montant);
    const soldePrecedent = getSolde(selectedLivreur);
    const nouveauSolde = Math.max(0, soldePrecedent - montant);

    await base44.entities.PaiementCommission.create({
      livreur_email: selectedLivreur.email,
      livreur_nom: selectedLivreur.full_name,
      montant,
      date_paiement: formPaiement.date_paiement,
      mode_paiement: formPaiement.mode_paiement,
      reference: formPaiement.reference,
      commentaire: formPaiement.commentaire,
      solde_avant: soldePrecedent,
      solde_apres: nouveauSolde,
      admin_email: admin?.email,
    });

    await base44.entities.User.update(selectedLivreur.id, {
      solde_commission_du: nouveauSolde,
      total_commissions_payees: (selectedLivreur.total_commissions_payees || 0) + montant,
      date_dernier_paiement: formPaiement.date_paiement,
      montant_dernier_paiement: montant,
      statut_financier_livreur: nouveauSolde === 0 ? "À jour" : "Doit une commission",
    });

    toast.success("Paiement enregistré avec succès !");
    setDialogPaiement(false);
    setFormPaiement({ montant: "", date_paiement: "", mode_paiement: "", reference: "", commentaire: "" });
    loadData();
    setSaving(false);
  };

  const bloquerLivreur = async (livreur, motif) => {
    await base44.entities.User.update(livreur.id, {
      livreur_bloque: true,
      statut_financier_livreur: "Bloqué",
      motif_blocage: motif,
    });
    toast.success("Livreur bloqué");
    loadData();
  };

  const reactiverLivreur = async (livreur) => {
    await base44.entities.User.update(livreur.id, {
      livreur_bloque: false,
      statut_financier_livreur: getSolde(livreur) > 0 ? "Doit une commission" : "À jour",
      motif_blocage: "",
    });
    toast.success("Livreur réactivé avec succès !");
    loadData();
  };

  const paiementsLivreur = selectedLivreur
    ? paiements.filter(p => p.livreur_email === selectedLivreur.email)
    : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const StatutBadge = ({ statut }) => {
    const cfg = {
      "À jour": "bg-green-100 text-green-700",
      "Doit une commission": "bg-amber-100 text-amber-700",
      "Bloqué": "bg-red-100 text-red-700",
    };
    return (
      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg[statut] || "bg-muted text-muted-foreground"}`}>
        {statut}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">Suivi des commissions</h1>
      </div>

      {/* Stats globales */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Générées ce mois</p>
            <p className="text-xl font-bold text-primary">{Math.round(totalGenMois).toLocaleString()} F</p>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Encaissées</p>
            <p className="text-xl font-bold text-green-600">{Math.round(totalEncaisse).toLocaleString()} F</p>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Impayées</p>
            <p className="text-xl font-bold text-amber-600">{Math.round(totalImpaye).toLocaleString()} F</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Aujourd'hui</p>
            <p className="text-xl font-bold">{Math.round(totalGenAujourdhui).toLocaleString()} F</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtres */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { val: "tous", label: "Tous" },
          { val: "a_jour", label: "À jour" },
          { val: "doit", label: "Doit" },
          { val: "bloque", label: "Bloqués" },
        ].map(f => (
          <button
            key={f.val}
            onClick={() => setFiltre(f.val)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-all ${
              filtre === f.val ? "bg-primary text-primary-foreground border-primary" : "border-border"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher un livreur..."
          className="pl-9"
          value={recherche}
          onChange={e => setRecherche(e.target.value)}
        />
      </div>

      {/* Liste livreurs */}
      <div className="space-y-3">
        {livreursFiltres.map(livreur => (
          <Card key={livreur.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{livreur.full_name}</p>
                    <StatutBadge statut={getStatut(livreur)} />
                  </div>
                  <p className="text-xs text-muted-foreground">{livreur.telephone} • {livreur.quartier}</p>
                  <div className="flex gap-3 mt-2 text-xs flex-wrap">
                    <span className="text-muted-foreground">Livrées: <strong>{livreur.total_courses_livrees || 0}</strong></span>
                    <span className="text-muted-foreground">Trajets: <strong>{courses.filter(c => c.livreur_email === livreur.email && c.moyen_transport).length}</strong></span>
                    <span className="text-muted-foreground">Généré: <strong>{Math.round(livreur.total_commissions_generees || 0).toLocaleString()} F</strong></span>
                  </div>
                  {getSolde(livreur) > 0 && (
                    <p className="text-sm font-bold text-amber-600 mt-1">
                      Solde dû : {Math.round(getSolde(livreur)).toLocaleString()} FCFA
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => { setSelectedLivreur(livreur); setDialogPaiement(true); }}
                  >
                    <CreditCard className="h-3 w-3 mr-1" />
                    Payer
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => { setSelectedLivreur(livreur); setDialogHistorique(true); }}
                  >
                    <History className="h-3 w-3 mr-1" />
                    Historique
                  </Button>
                  {livreur.livreur_bloque ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs text-green-600 border-green-300"
                      onClick={() => reactiverLivreur(livreur)}
                    >
                      Réactiver
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs text-red-600 border-red-300"
                      onClick={() => bloquerLivreur(livreur, "Commission impayée")}
                    >
                      Bloquer
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {livreursFiltres.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">Aucun livreur trouvé</p>
        )}
      </div>

      {/* Dialog paiement */}
      <Dialog open={dialogPaiement} onOpenChange={setDialogPaiement}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enregistrer un paiement</DialogTitle>
          </DialogHeader>
          {selectedLivreur && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted text-sm">
                <p className="font-medium">{selectedLivreur.full_name}</p>
                <p className="text-muted-foreground">Solde dû : <strong className="text-amber-600">{Math.round(getSolde(selectedLivreur)).toLocaleString()} FCFA</strong></p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Montant payé (FCFA) *</Label>
                  <Input type="number" placeholder="Ex: 1500" value={formPaiement.montant} onChange={e => setFormPaiement({ ...formPaiement, montant: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Date *</Label>
                  <Input type="date" value={formPaiement.date_paiement} onChange={e => setFormPaiement({ ...formPaiement, date_paiement: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Mode de paiement *</Label>
                <Select value={formPaiement.mode_paiement} onValueChange={v => setFormPaiement({ ...formPaiement, mode_paiement: v })}>
                  <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
                  <SelectContent>
                    {MODES_PAIEMENT.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Référence</Label>
                <Input placeholder="Numéro de transaction..." value={formPaiement.reference} onChange={e => setFormPaiement({ ...formPaiement, reference: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Commentaire</Label>
                <Input placeholder="Note..." value={formPaiement.commentaire} onChange={e => setFormPaiement({ ...formPaiement, commentaire: e.target.value })} />
              </div>
              <Button className="w-full" onClick={enregistrerPaiement} disabled={saving}>
                {saving ? "Enregistrement..." : "Confirmer le paiement"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog historique */}
      <Dialog open={dialogHistorique} onOpenChange={setDialogHistorique}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Historique des paiements</DialogTitle>
          </DialogHeader>
          {selectedLivreur && (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              <p className="text-sm font-medium">{selectedLivreur.full_name}</p>
              {paiementsLivreur.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Aucun paiement enregistré</p>
              ) : (
                paiementsLivreur.map(p => (
                  <div key={p.id} className="p-3 rounded-lg border text-sm">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-bold text-green-600">+{p.montant?.toLocaleString()} FCFA</p>
                        <p className="text-xs text-muted-foreground">{p.mode_paiement}</p>
                        {p.reference && <p className="text-xs text-muted-foreground">Réf: {p.reference}</p>}
                      </div>
                      <p className="text-xs text-muted-foreground">{moment(p.date_paiement).format("DD/MM/YYYY")}</p>
                    </div>
                    <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                      <span>Avant: {Math.round(p.solde_avant || 0).toLocaleString()} F</span>
                      <span>→</span>
                      <span>Après: {Math.round(p.solde_apres || 0).toLocaleString()} F</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}