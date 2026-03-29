import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, MapPin, Phone, Shield, ShieldOff, CheckCircle2, XCircle, CreditCard, History, Lock, Unlock, Eye, Star, Trash2, MessageCircle } from "lucide-react";
import ChatLivreur from "@/components/ChatLivreur";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import moment from "moment";

const MOTIFS_BLOCAGE = [
  "Commission impayée",
  "Suspension administrative",
  "Documents non conformes",
  "Comportement inapproprié",
  "Autre",
];

const MODES_PAIEMENT = ["Espèces", "Orange Money", "Moov Money", "Telecel Money", "Virement", "Autre"];

function StatutValidationBadge({ statut }) {
  const cfg = {
    valide: "bg-green-100 text-green-700",
    en_attente: "bg-amber-100 text-amber-700",
    refuse: "bg-red-100 text-red-700",
  };
  const labels = { valide: "Validé", en_attente: "En attente", refuse: "Refusé" };
  const key = statut || "en_attente";
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg[key] || "bg-muted text-muted-foreground"}`}>
      {labels[key] || key}
    </span>
  );
}

function StatutFinancierBadge({ statut }) {
  const cfg = {
    "À jour": "bg-green-100 text-green-700",
    "Doit une commission": "bg-amber-100 text-amber-700",
    "Bloqué": "bg-red-100 text-red-700",
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg[statut] || "bg-muted text-muted-foreground"}`}>
      {statut || "À jour"}
    </span>
  );
}

export default function GererLivreurs() {
  const navigate = useNavigate();
  const [livreurs, setLivreurs] = useState([]);
  const [paiements, setPaiements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [admin, setAdmin] = useState(null);
  const [selectedLivreur, setSelectedLivreur] = useState(null);
  const [dialogProfil, setDialogProfil] = useState(false);
  const [dialogPaiement, setDialogPaiement] = useState(false);
  const [dialogHistorique, setDialogHistorique] = useState(false);
  const [dialogBlocage, setDialogBlocage] = useState(false);
  const [motifBlocage, setMotifBlocage] = useState("");
  const [formPaiement, setFormPaiement] = useState({ montant: "", date_paiement: new Date().toISOString().split("T")[0], mode_paiement: "", reference: "", commentaire: "" });
  const [saving, setSaving] = useState(false);
  const [filtre, setFiltre] = useState("tous");
  const [coursesLivreur, setCoursesLivreur] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [activeTab, setActiveTab] = useState("profil");

  const loadData = async () => {
    const [livreursPurs, livreursAttente, livreursValides, livreursRefuses, paiementsData, me] = await Promise.all([
      base44.entities.User.filter({ user_type: "livreur" }),
      base44.entities.User.filter({ statut_validation_livreur: "en_attente" }),
      base44.entities.User.filter({ statut_validation_livreur: "valide" }),
      base44.entities.User.filter({ statut_validation_livreur: "refuse" }),
      base44.entities.PaiementCommission.list("-created_date", 200),
      base44.auth.me(),
    ]);
    const map = new Map();
    [...livreursPurs, ...livreursAttente, ...livreursValides, ...livreursRefuses].forEach(u => map.set(u.id, u));
    // Ne garder que les vrais livreurs (user_type livreur ou user_roles contient livreur)
    const tousLivreurs = Array.from(map.values()).filter(u => {
      if (u.user_type === 'livreur') return true;
      if (u.user_roles) {
        try { return JSON.parse(u.user_roles).includes('livreur'); } catch (_) {}
      }
      return false;
    });
    setLivreurs(tousLivreurs);
    setPaiements(paiementsData);
    setAdmin(me);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    // Rafraîchissement automatique toutes les 30 secondes
    const interval = setInterval(loadData, 30000);
    const unsubUser = base44.entities.User.subscribe((event) => {
      if (event.type === 'update') {
        // Toujours mettre à jour si le livreur est déjà dans la liste
        setLivreurs(prev => {
          const exists = prev.find(l => l.id === event.id);
          if (exists) return prev.map(l => l.id === event.id ? event.data : l);
          // Sinon, ajouter seulement si c'est un livreur
          const isLivreur = event.data?.user_type === 'livreur' || (event.data?.user_roles && (() => { try { return JSON.parse(event.data.user_roles).includes('livreur'); } catch(_) { return false; } })());
          return isLivreur ? [...prev, event.data] : prev;
        });
      } else if (event.type === 'create') {
        const isLivreur = event.data?.user_type === 'livreur' || (event.data?.user_roles && (() => { try { return JSON.parse(event.data.user_roles).includes('livreur'); } catch(_) { return false; } })());
        if (isLivreur) setLivreurs(prev => [...prev, event.data]);
      } else if (event.type === 'delete') {
        setLivreurs(prev => prev.filter(l => l.id !== event.id));
      }
    });
    return () => { unsubUser(); clearInterval(interval); };
  }, []);

  const valider = async (livreur) => {
    await base44.entities.User.update(livreur.id, {
      statut_validation_livreur: "valide",
      profil_valide: true,
      actif: true,
      date_validation: new Date().toISOString(),
    });
    toast.success("Livreur validé !");
    setDialogProfil(false);
    loadData();
  };

  const refuser = async (livreur) => {
    await base44.entities.User.update(livreur.id, {
      statut_validation_livreur: "refuse",
      profil_valide: false,
    });
    toast.success("Livreur refusé");
    setDialogProfil(false);
    loadData();
  };

  const bloquer = async () => {
    if (!motifBlocage) { toast.error("Veuillez choisir un motif"); return; }
    await base44.entities.User.update(selectedLivreur.id, {
      livreur_bloque: true,
      disponible: false,
      statut_financier_livreur: "Bloqué",
      motif_blocage: motifBlocage,
    });
    toast.success("Livreur bloqué");
    setDialogBlocage(false);
    setMotifBlocage("");
    loadData();
  };

  const supprimerLivreur = async (livreur) => {
    if (!window.confirm(`Supprimer définitivement ${livreur.full_name} ? Cette action est irréversible.`)) return;
    await base44.entities.User.delete(livreur.id);
    toast.success("Livreur supprimé");
    loadData();
  };

  const reactiver = async (livreur) => {
    const solde = livreur.solde_commission_du || 0;
    await base44.entities.User.update(livreur.id, {
      livreur_bloque: false,
      statut_financier_livreur: solde > 0 ? "Doit une commission" : "À jour",
      motif_blocage: "",
    });
    toast.success("Livreur réactivé !");
    loadData();
  };

  const enregistrerPaiement = async () => {
    if (!formPaiement.montant || !formPaiement.mode_paiement) {
      toast.error("Veuillez remplir les champs obligatoires");
      return;
    }
    setSaving(true);
    const montant = parseFloat(formPaiement.montant);
    const soldePrecedent = selectedLivreur.solde_commission_du || 0;
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
      statut_financier_livreur: nouveauSolde === 0 ? "À jour" : "Doit une commission",
    });

    toast.success("Paiement enregistré !");
    setDialogPaiement(false);
    setFormPaiement({ montant: "", date_paiement: new Date().toISOString().split("T")[0], mode_paiement: "", reference: "", commentaire: "" });
    loadData();
    setSaving(false);
  };

  const livreursFiltres = livreurs.filter(l => {
    if (filtre === "en_ligne") return l.disponible;
    if (filtre === "hors_ligne") return !l.disponible;
    if (filtre === "bloques") return l.livreur_bloque;
    if (filtre === "en_attente") return !l.statut_validation_livreur || l.statut_validation_livreur === "en_attente";
    return true;
  });

  const paiementsLivreur = selectedLivreur ? paiements.filter(p => p.livreur_email === selectedLivreur.email) : [];

  const ouvrirProfil = async (livreur) => {
    setSelectedLivreur(livreur);
    setActiveTab("profil");
    setDialogProfil(true);
    setLoadingCourses(true);
    const courses = await base44.entities.Course.filter({ livreur_email: livreur.email }, "-created_date", 100);
    setCoursesLivreur(courses);
    setLoadingCourses(false);
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
        <h1 className="text-xl font-bold">Gérer les livreurs</h1>
      </div>

      {/* Résumé */}
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="font-medium">{livreurs.length} total</span>
        <span>•</span>
        <span className="text-green-600">{livreurs.filter(l => l.disponible).length} en ligne</span>
        <span>•</span>
        <span className="text-amber-600">{livreurs.filter(l => !l.statut_validation_livreur || l.statut_validation_livreur === "en_attente").length} en attente</span>
        <span>•</span>
        <span className="text-red-600">{livreurs.filter(l => l.livreur_bloque).length} bloqués</span>
      </div>

      {/* Filtres */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { val: "tous", label: "Tous" },
          { val: "en_ligne", label: "En ligne" },
          { val: "hors_ligne", label: "Hors ligne" },
          { val: "en_attente", label: "À valider" },
          { val: "bloques", label: "Bloqués" },
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

      {/* Liste */}
      <div className="space-y-3">
        {livreursFiltres.map((livreur) => (
          <Card key={livreur.id} className={livreur.livreur_bloque ? "border-red-200 bg-red-50/30" : ""}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="relative flex-shrink-0">
                  {livreur.photo_profil ? (
                    <img src={livreur.photo_profil} alt="" className="h-12 w-12 rounded-full object-cover border" />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">
                      {livreur.full_name?.charAt(0) || "?"}
                    </div>
                  )}
                  <div className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card ${livreur.disponible ? "bg-green-500" : "bg-muted-foreground"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{livreur.full_name}</p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Phone className="h-3 w-3" />
                    <span>{livreur.telephone || "—"}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    <span>{livreur.quartier || "—"}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1 items-end">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${livreur.disponible ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                    {livreur.disponible ? "En ligne" : "Hors ligne"}
                  </span>
                  <StatutValidationBadge statut={livreur.statut_validation_livreur} />
                  <StatutFinancierBadge statut={livreur.statut_financier_livreur || "À jour"} />
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-4 gap-2 text-center text-xs bg-muted/50 rounded-lg p-2">
              <div>
                <p className="font-bold">{livreur.total_courses_livrees || 0}</p>
                <p className="text-muted-foreground">Livrées</p>
              </div>
              <div>
                <p className="font-bold">{livreur.nombre_courses_actives || 0}</p>
                <p className="text-muted-foreground">Actives</p>
              </div>
              <div>
                <p className={`font-bold ${(livreur.solde_commission_du || 0) > 0 ? "text-amber-600" : "text-green-600"}`}>
                  {Math.round(livreur.solde_commission_du || 0).toLocaleString()} F
                </p>
                <p className="text-muted-foreground">Dû CDL</p>
              </div>
              <div>
                {livreur.note_semaine != null ? (
                  <>
                    <p className={`font-bold flex items-center justify-center gap-0.5 ${livreur.note_semaine < 3 ? 'text-red-600' : 'text-amber-600'}`}>
                      <Star className={`h-3 w-3 ${livreur.note_semaine < 3 ? 'text-red-500 fill-red-500' : 'text-amber-400 fill-amber-400'}`} />
                      {livreur.note_semaine.toFixed(1)}
                    </p>
                    <p className={`text-[9px] font-medium ${livreur.note_semaine < 3 ? 'text-red-500' : 'text-muted-foreground'}`}>
                      {livreur.note_semaine < 3 ? '⚠️ Faible' : '7 jours'}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-bold flex items-center justify-center gap-0.5">
                      <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                      {livreur.note_moyenne ? livreur.note_moyenne.toFixed(1) : "—"}
                    </p>
                    <p className="text-muted-foreground">Note ({livreur.total_notes || 0})</p>
                  </>
                )}
              </div>
              </div>

              {/* Actions rapides */}
              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs flex-1"
                  onClick={() => ouvrirProfil(livreur)}
                >
                  <Eye className="h-3 w-3 mr-1" />
                  Profil
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs flex-1"
                  onClick={() => { setSelectedLivreur(livreur); setDialogPaiement(true); setFormPaiement(prev => ({ ...prev, montant: "" })); }}
                >
                  <CreditCard className="h-3 w-3 mr-1" />
                  Payer
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs flex-1"
                  onClick={() => { setSelectedLivreur(livreur); setDialogHistorique(true); }}
                >
                  <History className="h-3 w-3 mr-1" />
                  Historique
                </Button>
                {livreur.livreur_bloque ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs flex-1 text-green-600 border-green-300"
                    onClick={() => reactiver(livreur)}
                  >
                    <Unlock className="h-3 w-3 mr-1" />
                    Réactiver
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs flex-1 text-red-600 border-red-300"
                    onClick={() => { setSelectedLivreur(livreur); setDialogBlocage(true); }}
                  >
                    <Lock className="h-3 w-3 mr-1" />
                    Bloquer
                  </Button>
                )}
                {admin?.role === 'admin' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs text-red-700 border-red-400 hover:bg-red-50"
                    onClick={() => supprimerLivreur(livreur)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}

        {livreursFiltres.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-sm">Aucun livreur trouvé</p>
          </div>
        )}
      </div>

      {/* Dialog Profil */}
      <Dialog open={dialogProfil} onOpenChange={setDialogProfil}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Dossier livreur</DialogTitle>
          </DialogHeader>
          {selectedLivreur && (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full">
                <TabsTrigger value="profil" className="flex-1 text-xs">Profil</TabsTrigger>
                <TabsTrigger value="messages" className="flex-1 text-xs">
                  <MessageCircle className="h-3.5 w-3.5 mr-1" />Messages
                </TabsTrigger>
                {admin?.role === "admin" && (
                  <TabsTrigger value="courses" className="flex-1 text-xs">Courses ({loadingCourses ? "..." : coursesLivreur.length})</TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="profil" className="space-y-4 mt-4">
                <div className="flex items-center gap-3">
                  {selectedLivreur.photo_profil ? (
                    <img src={selectedLivreur.photo_profil} alt="" className="h-16 w-16 rounded-full object-cover border-2 border-primary" />
                  ) : (
                    <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
                      {selectedLivreur.full_name?.charAt(0)}
                    </div>
                  )}
                  <div>
                    <p className="font-bold">{selectedLivreur.full_name}</p>
                    <p className="text-sm text-muted-foreground">{selectedLivreur.telephone}</p>
                    <p className="text-sm text-muted-foreground">{selectedLivreur.quartier}</p>
                    <p className="text-xs text-muted-foreground">Inscrit le {moment(selectedLivreur.created_date).format("DD/MM/YYYY")}</p>
                  </div>
                </div>

                <div className="flex gap-2 flex-wrap">
                  <StatutValidationBadge statut={selectedLivreur.statut_validation_livreur} />
                  <StatutFinancierBadge statut={selectedLivreur.statut_financier_livreur} />
                  {selectedLivreur.livreur_bloque && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">Bloqué</span>
                  )}
                </div>

                {selectedLivreur.motif_refus && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                    <p className="font-medium">Motif de refus :</p>
                    <p>{selectedLivreur.motif_refus}</p>
                  </div>
                )}
                {selectedLivreur.motif_blocage && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                    <p className="font-medium">Motif de blocage :</p>
                    <p>{selectedLivreur.motif_blocage}</p>
                  </div>
                )}

                {/* Documents */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Documents</p>
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

                {/* Actions validation */}
                {(!selectedLivreur.statut_validation_livreur || selectedLivreur.statut_validation_livreur === "en_attente") && (
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 border-red-300 text-red-600 hover:bg-red-50" onClick={() => refuser(selectedLivreur)}>
                      <XCircle className="h-4 w-4 mr-1" />
                      Refuser
                    </Button>
                    <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => valider(selectedLivreur)}>
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Valider
                    </Button>
                  </div>
                )}
                {selectedLivreur.statut_validation_livreur === "valide" && (
                  <Button variant="outline" className="w-full border-red-300 text-red-600" onClick={() => refuser(selectedLivreur)}>
                    Révoquer la validation
                  </Button>
                )}
                {selectedLivreur.statut_validation_livreur === "refuse" && (
                  <Button className="w-full bg-green-600 hover:bg-green-700" onClick={() => valider(selectedLivreur)}>
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    Valider quand même
                  </Button>
                )}
              </TabsContent>

              <TabsContent value="messages" className="mt-4">
                {selectedLivreur && (
                  <ChatLivreur livreurEmail={selectedLivreur.email} currentUser={admin} />
                )}
              </TabsContent>

              <TabsContent value="courses" className="mt-4">
                {loadingCourses ? (
                  <div className="flex justify-center py-8"><div className="w-6 h-6 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
                ) : coursesLivreur.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-8">Aucune course effectuée</p>
                ) : (
                  <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                    {coursesLivreur.map(c => {
                      const statutColors = {
                        livree: "bg-green-100 text-green-700",
                        en_cours: "bg-blue-100 text-blue-700",
                        acceptee: "bg-amber-100 text-amber-700",
                        annulee: "bg-red-100 text-red-700",
                      };
                      const statutLabels = {
                        livree: "Livrée", en_cours: "En cours", acceptee: "Acceptée", annulee: "Annulée",
                        en_attente: "En attente", refusee: "Refusée",
                      };
                      return (
                        <div key={c.id} className="border rounded-lg p-3 text-sm space-y-1">
                          <div className="flex items-center justify-between">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statutColors[c.statut] || "bg-muted text-muted-foreground"}`}>
                              {statutLabels[c.statut] || c.statut}
                            </span>
                            <span className="text-xs text-muted-foreground">{moment(c.created_date).format("DD/MM/YY HH:mm")}</span>
                          </div>
                          <p className="font-medium">{c.quartier_depart} → {c.quartier_arrivee}</p>
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{c.type_colis}</span>
                            <span className="font-semibold text-primary">{(c.prix || 0).toLocaleString()} FCFA</span>
                          </div>
                          {c.gain_livreur && (
                            <p className="text-xs text-green-600">Gain livreur : {c.gain_livreur.toLocaleString()} FCFA</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog Paiement */}
      <Dialog open={dialogPaiement} onOpenChange={setDialogPaiement}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enregistrer un paiement</DialogTitle>
          </DialogHeader>
          {selectedLivreur && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted text-sm">
                <p className="font-medium">{selectedLivreur.full_name}</p>
                <p className="text-muted-foreground">Solde dû : <strong className="text-amber-600">{Math.round(selectedLivreur.solde_commission_du || 0).toLocaleString()} FCFA</strong></p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Montant (FCFA) *</Label>
                  <Input type="number" placeholder="Ex: 2000" value={formPaiement.montant} onChange={e => setFormPaiement({ ...formPaiement, montant: e.target.value })} />
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

      {/* Dialog Historique */}
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

      {/* Dialog Blocage */}
      <Dialog open={dialogBlocage} onOpenChange={setDialogBlocage}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bloquer le livreur</DialogTitle>
          </DialogHeader>
          {selectedLivreur && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Bloquer <strong>{selectedLivreur.full_name}</strong> empêchera ce livreur de recevoir des courses.</p>
              <div className="space-y-1">
                <Label>Motif de blocage *</Label>
                <Select value={motifBlocage} onValueChange={setMotifBlocage}>
                  <SelectTrigger><SelectValue placeholder="Choisir un motif..." /></SelectTrigger>
                  <SelectContent>
                    {MOTIFS_BLOCAGE.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setDialogBlocage(false)}>Annuler</Button>
                <Button variant="destructive" className="flex-1" onClick={bloquer}>Confirmer le blocage</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}