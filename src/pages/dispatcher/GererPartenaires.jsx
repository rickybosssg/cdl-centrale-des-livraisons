import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { useMessageNotification } from "@/hooks/useMessageNotification";
import MessageAlert from "@/components/MessageAlert";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Search, RefreshCw, Eye, ShoppingBag, TrendingUp, Ban, UserCheck, Store, MessageCircle, Plus, CheckCircle2, XCircle, Trash2, RotateCcw, AlertTriangle } from "lucide-react";
import ChatAdmin from "@/components/ChatAdmin";
import { toast } from "sonner";
import moment from "moment";

const STATUT_ABONN = {
  Actif: "bg-green-100 text-green-700",
  Expiré: "bg-red-100 text-red-700",
  Bloqué: "bg-gray-100 text-gray-700",
};

const TYPE_EMOJI = {
  Restaurant: "🍽️", Pharmacie: "💊", Boutique: "🛍️", Alimentation: "🥗", Boissons: "🥤", Vitrine: "✨"
};

export default function GererPartenaires() {
  const navigate = useNavigate();
  const [partenaires, setPartenaires] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("Tous");
  const [selected, setSelected] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [adminUser, setAdminUser] = useState(null);
  const [ficheTab, setFicheTab] = useState("infos");
  const [motifRefus, setMotifRefus] = useState("");
  const [dialogDelete, setDialogDelete] = useState(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleting, setDeleting] = useState(false);
  const newMsg = useMessageNotification(selected?.user_email);

  useEffect(() => { base44.auth.me().then(setAdminUser); }, []);

  const load = async () => {
    setLoading(true);
    const data = await base44.entities.Partenaire.list("-created_date", 500);
    setPartenaires(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const bloquer = async (p) => {
    setSavingId(p.id);
    await base44.entities.Partenaire.update(p.id, { statut: "suspendu", statut_abonnement: "Bloqué" });
    try {
      await base44.entities.Notification.create({
        destinataire_email: p.user_email,
        destinataire_role: 'partenaire',
        titre: '🔒 Compte suspendu',
        message: 'Votre compte partenaire CDL a été suspendu. Veuillez contacter l\'équipe CDL pour plus d\'informations.',
        type: 'warning',
        lue: false,
      });
    } catch (_) {}
    setPartenaires(prev => prev.map(x => x.id === p.id ? { ...x, statut: "suspendu", statut_abonnement: "Bloqué" } : x));
    if (selected?.id === p.id) setSelected(s => ({ ...s, statut: "suspendu", statut_abonnement: "Bloqué" }));
    toast.success("Partenaire bloqué");
    setSavingId(null);
  };

  const valider = async (p) => {
    setSavingId(p.id);
    const expiration = new Date();
    expiration.setMonth(expiration.getMonth() + 1);
    await base44.entities.Partenaire.update(p.id, { statut: "actif", statut_abonnement: "Actif", date_expiration_abonnement: expiration.toISOString(), motif_refus: "" });
    try {
      const users = await base44.entities.User.filter({ email: p.user_email });
      if (users.length > 0) await base44.entities.User.update(users[0].id, { profil_valide: true, statut_validation_partenaire: "valide" });
    } catch (_) {}
    try {
      await base44.entities.Notification.create({
        destinataire_email: p.user_email,
        destinataire_role: 'partenaire',
        titre: '✅ Profil validé',
        message: 'Votre profil partenaire CDL a été validé ! Vous pouvez maintenant accéder à votre espace.',
        type: 'success',
        lue: false,
      });
    } catch (_) {}
    setPartenaires(prev => prev.map(x => x.id === p.id ? { ...x, statut: "actif", statut_abonnement: "Actif" } : x));
    if (selected?.id === p.id) setSelected(s => ({ ...s, statut: "actif", statut_abonnement: "Actif" }));
    toast.success("Partenaire validé et activé !");
    setSavingId(null);
  };

  const activer = async (p) => valider(p);

  const refuserPartenaire = async (p) => {
    if (!motifRefus.trim()) { toast.error("Veuillez indiquer un motif de refus"); return; }
    setSavingId(p.id);
    await base44.entities.Partenaire.update(p.id, { statut: "refuse", motif_refus: motifRefus });
    try {
      const users = await base44.entities.User.filter({ email: p.user_email });
      if (users.length > 0) await base44.entities.User.update(users[0].id, { statut_validation_partenaire: "refuse" });
    } catch (_) {}
    try {
      await base44.entities.Notification.create({
        destinataire_email: p.user_email,
        destinataire_role: 'partenaire',
        titre: '❌ Profil refusé',
        message: `Votre demande d\'adhésion a été refusée. Motif : ${motifRefus}. Veuillez contacter l\'équipe CDL pour plus d\'informations.`,
        type: 'warning',
        lue: false,
      });
    } catch (_) {}
    setPartenaires(prev => prev.map(x => x.id === p.id ? { ...x, statut: "refuse" } : x));
    if (selected?.id === p.id) setSelected(s => ({ ...s, statut: "refuse", motif_refus: motifRefus }));
    toast.success("Demande refusée");
    setMotifRefus("");
    setSavingId(null);
  };

  const supprimerPartenaire = async (p) => {
    setDeleting(true);
    try {
      await base44.functions.invoke('deletePartenaire', {
        partenaire_id: p.id,
        partenaire_email: p.user_email,
        reason: deleteReason,
      });
      toast.success(`${p.nom_commerce} a été supprimé`);
      setDialogDelete(null);
      setDeleteReason("");
      setSelected(null);
      load();
    } catch (err) {
      toast.error("Erreur : " + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const restaurerPartenaire = async (p) => {
    setSavingId(p.id);
    try {
      await base44.entities.Partenaire.update(p.id, {
        statut: "actif",
        deleted: false,
        deleted_at: null,
      });
      try {
        await base44.entities.Notification.create({
          destinataire_email: p.user_email,
          destinataire_role: 'partenaire',
          titre: '✅ Compte réactivé',
          message: 'Votre compte partenaire CDL a été réactivé. Vous pouvez à nouveau accéder à votre espace.',
          type: 'success',
          lue: false,
        });
      } catch (_) {}
      toast.success(`${p.nom_commerce} a été restauré`);
      setPartenaires(prev => prev.map(x => x.id === p.id ? { ...x, statut: "actif", deleted: false } : x));
      if (selected?.id === p.id) setSelected(s => ({ ...s, statut: "actif", deleted: false }));
    } catch (err) {
      toast.error("Erreur : " + err.message);
    } finally {
      setSavingId(null);
    }
  };

  const filtered = partenaires.filter(p => {
    const q = search.toLowerCase();
    const match = !q || (p.nom_commerce || "").toLowerCase().includes(q) || (p.quartier || "").toLowerCase().includes(q) || (p.telephone || "").includes(q);
    const matchType = filterType === "Tous" || p.type_commerce === filterType;
    return match && matchType;
  });

  const stats = {
    total: partenaires.filter(p => !p.deleted).length,
    actifs: partenaires.filter(p => p.statut === "actif" && !p.deleted).length,
    en_attente: partenaires.filter(p => p.statut === "en_attente" && !p.deleted).length,
    suspendus: partenaires.filter(p => p.statut === "suspendu" && !p.deleted).length,
    revenue: partenaires.filter(p => p.statut_abonnement === "Actif" && !p.deleted).length * 30000,
  };

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <MessageAlert newMsg={newMsg} />
      {newMsg && <div className="h-24" />}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="text-xl font-bold flex-1">Partenaires</h1>
        <Button size="sm" onClick={() => navigate('/creer-boutique')}><Plus className="h-4 w-4 mr-1" />Créer</Button>
        <Button variant="outline" size="icon" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        <Card><CardContent className="p-3"><p className="text-xl font-bold text-primary">{stats.total}</p><p className="text-[10px] text-muted-foreground">Total partenaires</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xl font-bold text-green-600">{stats.actifs}</p><p className="text-[10px] text-muted-foreground">Actifs</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xl font-bold text-amber-600">{stats.en_attente}</p><p className="text-[10px] text-muted-foreground">En attente</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-sm font-bold text-primary">{stats.revenue.toLocaleString()} FCFA</p><p className="text-[10px] text-muted-foreground">Revenu mensuel</p></CardContent></Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="grid grid-cols-4 gap-2">
        {["Tous", "Restaurant", "Pharmacie", "Boutique", "Alimentation", "Boissons", "Vitrine"].map(t => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={`flex flex-col items-center justify-center gap-1 p-3 rounded-xl border transition-all ${
              filterType === t
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-card border-border hover:bg-muted"
            }`}
          >
            <span className="text-2xl">{TYPE_EMOJI[t] || "🏪"}</span>
            <span className="text-xs font-medium leading-tight">{t}</span>
          </button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} partenaire(s)</p>

      <div className="space-y-2">
        {filtered.map(p => (
          <Card key={p.id} className={`cursor-pointer hover:shadow-md transition-shadow ${p.deleted ? 'opacity-50' : ''}`} onClick={() => setSelected(p)}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-xl flex-shrink-0">
                    {p.photo_principale
                      ? <img src={p.photo_principale} alt="" className="h-10 w-10 rounded-xl object-cover" />
                      : TYPE_EMOJI[p.type_commerce] || "🏪"}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{p.nom_commerce} {p.deleted && <span className="text-[10px] text-red-600 font-bold">[SUPPRIMÉ]</span>}</p>
                    <p className="text-xs text-muted-foreground">{p.type_commerce} · {p.quartier}</p>
                    <p className="text-xs text-muted-foreground">{p.telephone}</p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0 space-y-1">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUT_ABONN[p.statut_abonnement] || STATUT_ABONN.Actif}`}>
                    {p.statut_abonnement || "Actif"}
                  </span>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground justify-end">
                    <span className="flex items-center gap-0.5"><Eye className="h-2.5 w-2.5" />{p.nombre_vues || 0}</span>
                    <span className="flex items-center gap-0.5"><ShoppingBag className="h-2.5 w-2.5" />{p.nombre_commandes || 0}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-12"><Store className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" /><p className="text-sm text-muted-foreground">Aucun partenaire</p></div>
        )}
      </div>

      {/* Fiche partenaire */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center" onClick={() => setSelected(null)}>
          <div className="bg-background w-full max-w-lg rounded-t-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-background border-b px-4 py-3 flex items-center justify-between">
              <div>
                <h2 className="font-bold">{selected.nom_commerce}</h2>
                <p className="text-xs text-muted-foreground">{selected.type_commerce} · {selected.quartier}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>✕</Button>
            </div>
            {/* Tabs */}
            <div className="flex border-b">
              {[{val:"infos",label:"Infos"},{val:"messages",label:"💬 Chat"}].map(t => (
                <button key={t.val} onClick={() => setFicheTab(t.val)}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                    ficheTab === t.val ? "border-b-2 border-primary text-primary" : "text-muted-foreground"
                  }`}>{t.label}</button>
              ))}
            </div>
            <div className="p-4 space-y-4">
              {ficheTab === "messages" ? (
                <ChatAdmin userEmail={selected.user_email} userRole="partenaire" currentUser={adminUser} />
              ) : (
                <>
                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <Card><CardContent className="p-3"><p className="text-lg font-bold text-primary">{selected.nombre_vues || 0}</p><p className="text-[10px] text-muted-foreground">Vues</p></CardContent></Card>
                    <Card><CardContent className="p-3"><p className="text-lg font-bold text-accent">{selected.nombre_clics_commander || 0}</p><p className="text-[10px] text-muted-foreground">Clics</p></CardContent></Card>
                    <Card><CardContent className="p-3"><p className="text-lg font-bold text-green-500">{selected.nombre_contacts || 0}</p><p className="text-[10px] text-muted-foreground">Contacts</p></CardContent></Card>
                    <Card><CardContent className="p-3"><p className="text-lg font-bold text-green-600">{selected.nombre_commandes || 0}</p><p className="text-[10px] text-muted-foreground">Cmdes</p></CardContent></Card>
                  </div>
                  {selected.nombre_vues > 0 && (
                    <div className="bg-muted rounded-xl p-3 text-sm">
                      <p className="text-muted-foreground text-xs">Taux de conversion</p>
                      <p className="font-bold text-lg">{Math.round((selected.nombre_commandes || 0) / selected.nombre_vues * 100)}%</p>
                    </div>
                  )}
                  <Card className={selected.statut_abonnement === "Expiré" ? "border-red-200" : "border-green-200"}>
                    <CardContent className="p-3">
                      <p className="text-xs font-semibold mb-1">Abonnement (30 000 FCFA/mois)</p>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Statut : <span className="font-semibold">{selected.statut_abonnement}</span></span>
                        <span className="text-muted-foreground">Expire : {selected.date_expiration_abonnement ? moment(selected.date_expiration_abonnement).format("DD/MM/YY") : "—"}</span>
                      </div>
                    </CardContent>
                  </Card>
                  <div className="text-sm space-y-1">
                    <p><span className="text-muted-foreground">Responsable :</span> {selected.nom_responsable || "—"}</p>
                    <p><span className="text-muted-foreground">Tél :</span> {selected.telephone}</p>
                    <p><span className="text-muted-foreground">Adresse :</span> {selected.adresse || "—"}</p>
                    <p><span className="text-muted-foreground">Inscrit :</span> {moment(selected.created_date).format("DD/MM/YYYY")}</p>
                  </div>
                  <Button variant="outline" className="w-full" onClick={() => { navigate(`/commerce/${selected.id}`); setSelected(null); }}>
                    <Eye className="h-4 w-4 mr-1" />Voir la page publique
                  </Button>
                  {selected.statut === "en_attente" && (
                    <div className="space-y-2 border border-amber-200 rounded-xl p-3 bg-amber-50">
                      <p className="text-sm font-semibold text-amber-700">⏳ Demande en attente de validation</p>
                      <div className="space-y-1">
                        <Label className="text-xs">Motif de refus (si refus)</Label>
                        <Input placeholder="Ex: Photos manquantes, infos incomplètes..." value={motifRefus} onChange={e => setMotifRefus(e.target.value)} />
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" className="flex-1 border-red-300 text-red-600" disabled={savingId === selected.id} onClick={() => refuserPartenaire(selected)}>
                          <XCircle className="h-4 w-4 mr-1" />Refuser
                        </Button>
                        <Button className="flex-1 bg-green-600 hover:bg-green-700" disabled={savingId === selected.id} onClick={() => valider(selected)}>
                          <CheckCircle2 className="h-4 w-4 mr-1" />{savingId === selected.id ? "..." : "Valider"}
                        </Button>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    {!selected.deleted ? (
                      <>
                        {selected.statut !== "suspendu" ? (
                          <Button variant="destructive" className="flex-1" disabled={savingId === selected.id} onClick={() => bloquer(selected)}>
                            <Ban className="h-4 w-4 mr-1" />{savingId === selected.id ? "..." : "Bloquer"}
                          </Button>
                        ) : (
                          <Button className="flex-1 bg-green-600 hover:bg-green-700" disabled={savingId === selected.id} onClick={() => activer(selected)}>
                            <UserCheck className="h-4 w-4 mr-1" />{savingId === selected.id ? "..." : "Réactiver"}
                          </Button>
                        )}
                        <Button variant="outline" className="flex-1 border-red-300 text-red-600" onClick={() => setDialogDelete(selected)}>
                          <Trash2 className="h-4 w-4 mr-1" /> Supprimer
                        </Button>
                      </>
                    ) : (
                      <Button className="w-full bg-green-600 hover:bg-green-700" disabled={savingId === selected.id} onClick={() => restaurerPartenaire(selected)}>
                        <RotateCcw className="h-4 w-4 mr-1" />{savingId === selected.id ? "..." : "Restaurer"}
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dialog suppression */}
      <Dialog open={!!dialogDelete} onOpenChange={(v) => { if (!v) setDialogDelete(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" /> Supprimer partenaire
            </DialogTitle>
          </DialogHeader>
          {dialogDelete && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                <p className="font-semibold text-sm">{dialogDelete.nom_commerce}</p>
                <p className="text-xs text-muted-foreground">{dialogDelete.user_email}</p>
              </div>
              <p className="text-sm text-red-700 font-semibold">⚠️ Attention : Cette action désactivera le partenaire et sa boutique.</p>
              {dialogDelete.nombre_commandes > 0 && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <p className="text-xs font-semibold text-amber-700">⚡ Ce partenaire a {dialogDelete.nombre_commandes} commande(s) historiques.</p>
                  <p className="text-xs text-amber-600">L'historique sera conservé mais la boutique sera désactivée.</p>
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">Raison de suppression (optionnel)</Label>
                <Input placeholder="Ex: boutique inactive, non-respect des conditions..." value={deleteReason} onChange={e => setDeleteReason(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setDialogDelete(null)}>Annuler</Button>
                <Button variant="destructive" className="flex-1" onClick={() => supprimerPartenaire(dialogDelete)} disabled={deleting}>
                  {deleting ? "Suppression..." : "✓ Confirmer la suppression"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}