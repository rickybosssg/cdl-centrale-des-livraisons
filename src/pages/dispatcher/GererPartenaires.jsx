import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Phone, MessageCircle, MapPin, Eye, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import moment from "moment";

const STATUT_CONFIG = {
  "en_attente": "bg-amber-100 text-amber-700",
  "actif": "bg-green-100 text-green-700",
  "refuse": "bg-red-100 text-red-700",
  "suspendu": "bg-orange-100 text-orange-700",
};

export default function GererPartenaires() {
  const navigate = useNavigate();
  const [partenaires, setPartenaires] = useState([]);
  const [pendingProfiles, setPendingProfiles] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [admin, setAdmin] = useState(null);
  const [selected, setSelected] = useState(null);
  const [dialog, setDialog] = useState(false);
  const [search, setSearch] = useState("");
  const [filtre, setFiltre] = useState("tous");

  const loadData = async () => {
    const [dataPartenaires, me, userProfiles] = await Promise.all([
      base44.entities.Partenaire.list("-created_date", 500),
      base44.auth.me(),
      base44.entities.UserProfile.filter({ profile_type: "partenaire" }, "-created_date", 200),
    ]);
    setPartenaires(dataPartenaires);
    setAdmin(me);
    // Profils UserProfile en attente/refusés non encore convertis en Partenaire
    const partenaireEmails = new Set(dataPartenaires.map(p => p.user_email));
    const pending = (userProfiles || []).filter(p =>
      !partenaireEmails.has(p.user_email) ||
      p.status === "en_attente" || p.status === "refuse" || p.status === "incomplet"
    );
    setPendingProfiles(pending);
    setLoading(false);
  };

  const validerProfilPartenaire = async (profile) => {
    try {
      const now = new Date().toISOString();
      await base44.entities.UserProfile.update(profile.id, {
        status: "actif",
        validated_at: now,
        validated_by: admin.email,
      });
      // Créer l'entrée Partenaire si inexistante
      const data = profile.data_json ? JSON.parse(profile.data_json) : {};
      const existing = await base44.entities.Partenaire.filter({ user_email: profile.user_email });
      if (existing.length === 0) {
        await base44.entities.Partenaire.create({
          user_email: profile.user_email,
          nom_commerce: data.nom_commerce || data.full_name || profile.user_email,
          type_commerce: data.type_commerce || "—",
          telephone: data.telephone || "",
          adresse: data.adresse || "",
          statut: "actif",
          date_inscription: now,
        });
      } else {
        await base44.entities.Partenaire.update(existing[0].id, { statut: "actif" });
      }
      await base44.entities.Notification.create({
        destinataire_email: profile.user_email,
        destinataire_role: "partenaire",
        titre: "✅ Profil partenaire validé !",
        message: "Félicitations ! Votre profil partenaire a été validé. Vous pouvez maintenant publier votre boutique sur CDL.",
        type: "success",
        lue: false,
      });
      await base44.entities.AdminActionLog.create({
        admin_email: admin.email,
        object_type: "partenaire",
        object_id: profile.id,
        object_name: profile.user_email,
        action: "validate",
        reason: "Validation profil partenaire",
        target_email: profile.user_email,
      });
      toast.success("✅ Profil partenaire validé !");
      await loadData();
    } catch (err) {
      toast.error("Erreur : " + err.message);
    }
  };

  const refuserProfilPartenaire = async (profile) => {
    const motif = window.prompt("Motif de refus (optionnel) :") || "Documents insuffisants";
    try {
      await base44.entities.UserProfile.update(profile.id, {
        status: "refuse",
        refusal_reason: motif,
      });
      await base44.entities.Notification.create({
        destinataire_email: profile.user_email,
        destinataire_role: "partenaire",
        titre: "❌ Demande partenaire refusée",
        message: `Votre demande de profil partenaire a été refusée. Motif : ${motif}. Contactez-nous pour corriger votre dossier.`,
        type: "danger",
        lue: false,
      });
      await base44.entities.AdminActionLog.create({
        admin_email: admin.email,
        object_type: "partenaire",
        object_id: profile.id,
        object_name: profile.user_email,
        action: "refuse",
        reason: motif,
        target_email: profile.user_email,
      });
      toast.success("Demande refusée");
      await loadData();
    } catch (err) {
      toast.error("Erreur : " + err.message);
    }
  };

  useEffect(() => {
    loadData();
    const unsub1 = base44.entities.Partenaire.subscribe((event) => {
      if (event.type === 'create') setPartenaires(prev => [...prev, event.data]);
      else if (event.type === 'update') setPartenaires(prev => prev.map(p => p.id === event.id ? event.data : p));
      else if (event.type === 'delete') setPartenaires(prev => prev.filter(p => p.id !== event.id));
    });
    const unsub2 = base44.entities.UserProfile.subscribe((event) => {
      if (event.data?.profile_type !== 'partenaire') return;
      loadData();
    });
    return () => { unsub1(); unsub2(); };
  }, []);

  const ouvrirFiche = async (partenaire) => {
    setSelected(partenaire);
    try {
      const history = await base44.entities.AdminActionLog.filter({ target_email: partenaire.user_email }, "-created_date", 20);
      setLogs(history || []);
    } catch (_) {
      setLogs([]);
    }
    setDialog(true);
  };

  const suspendre = async (partenaire) => {
    await base44.entities.Partenaire.update(partenaire.id, { statut: "suspendu", suspended: true, suspended_at: new Date().toISOString() });
    await base44.entities.AdminActionLog.create({
      admin_email: admin.email,
      object_type: "partenaire",
      object_id: partenaire.id,
      object_name: partenaire.nom_commerce,
      action: "suspend",
      reason: "Suspension partenaire",
      target_email: partenaire.user_email,
    });
    toast.success("Partenaire suspendu");
    setDialog(false);
    loadData();
  };

  const reactiver = async (partenaire) => {
    await base44.entities.Partenaire.update(partenaire.id, { statut: "actif", suspended: false });
    await base44.entities.AdminActionLog.create({
      admin_email: admin.email,
      object_type: "partenaire",
      object_id: partenaire.id,
      object_name: partenaire.nom_commerce,
      action: "unsuspend",
      reason: "Réactivation partenaire",
      target_email: partenaire.user_email,
    });
    toast.success("Partenaire réactivé");
    setDialog(false);
    loadData();
  };

  const supprimerPartenaire = async (partenaire) => {
    const confirmed = window.confirm(
      `⚠️ SUPPRESSION COMPLÈTE\n\n` +
      `Cela supprimera :\n` +
      `• Le compte ${partenaire.nom_commerce}\n` +
      `• Tous les profils liés\n` +
      `• Toutes les données associées\n\n` +
      `Cette action est IRRÉVERSIBLE.\n` +
      `Confirmer ?"`
    );
    if (!confirmed) return;

    try {
      const res = await base44.functions.invoke('deleteUserComplete', {
        user_id: partenaire.id,
        user_email: partenaire.user_email,
      });
      if (res.data?.success) {
        toast.success(`✅ ${partenaire.nom_commerce} supprimé complètement`);
        setDialog(false);
        setPartenaires(prev => prev.filter(p => p.id !== partenaire.id));
        setSelected(null);
      } else {
        toast.error(`Erreur : ${res.data?.error || 'Suppression échouée'}`);
      }
    } catch (err) {
      toast.error(`Erreur suppression : ${err.message}`);
    }
  };

  const filtered = partenaires.filter(p => {
    const q = search.toLowerCase();
    const match = !q || p.nom_commerce?.toLowerCase().includes(q) || p.telephone?.includes(q) || p.user_email?.toLowerCase().includes(q);
    let filtre_match = true;
    if (filtre === "actifs") filtre_match = p.statut === "actif";
    else if (filtre === "en_attente") filtre_match = p.statut === "en_attente";
    else if (filtre === "suspendus") filtre_match = p.statut === "suspendu" || p.suspended;
    return match && filtre_match;
  });

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="text-xl font-bold">Gérer les partenaires</h1>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <Card className="text-center"><CardContent className="p-3"><p className="text-2xl font-bold">{partenaires.length}</p><p className="text-[10px] text-muted-foreground">Total</p></CardContent></Card>
        <Card className="text-center"><CardContent className="p-3"><p className="text-2xl font-bold text-green-600">{partenaires.filter(p => p.statut === "actif").length}</p><p className="text-[10px] text-muted-foreground">Actifs</p></CardContent></Card>
        <Card className="text-center"><CardContent className="p-3"><p className="text-2xl font-bold text-amber-600">{pendingProfiles.filter(p => p.status === "en_attente").length}</p><p className="text-[10px] text-muted-foreground">En attente</p></CardContent></Card>
        <Card className="text-center"><CardContent className="p-3"><p className="text-2xl font-bold text-orange-600">{partenaires.filter(p => p.statut === "suspendu" || p.suspended).length}</p><p className="text-[10px] text-muted-foreground">Suspendus</p></CardContent></Card>
      </div>

      {/* RECHERCHE ET FILTRES */}
      <div className="space-y-3 p-3 rounded-xl bg-muted/40 border">
        <Input 
          placeholder="Rechercher par commerce, tél, email..." 
          value={search} 
          onChange={e => setSearch(e.target.value)} 
          className="bg-white"
        />
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[{val:"tous",label:"Tous"},{val:"actifs",label:"✅ Actifs"},{val:"en_attente",label:"⏳ En attente"},{val:"suspendus",label:"⏸️ Suspendus"}]
            .map(f => (
            <button key={f.val} onClick={() => setFiltre(f.val)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-all ${
                filtre === f.val ? "bg-primary text-primary-foreground border-primary" : "border-border"
              }`}>{f.label}</button>
          ))}
        </div>
        {(search || filtre !== 'tous') && (
          <button
            onClick={() => { setSearch(''); setFiltre('tous'); }}
            className="w-full text-xs font-medium text-primary hover:underline"
          >
            ↻ Réinitialiser
          </button>
        )}
      </div>

      {/* Demandes UserProfile en attente */}
      {pendingProfiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-amber-700">⏳ Demandes de profil partenaire ({pendingProfiles.length})</p>
          {pendingProfiles.map(profile => {
            const data = profile.data_json ? (() => { try { return JSON.parse(profile.data_json); } catch { return {}; } })() : {};
            const statusCfg = { en_attente: "bg-amber-100 text-amber-700", refuse: "bg-red-100 text-red-700", incomplet: "bg-gray-100 text-gray-600" };
            return (
              <Card key={profile.id} className="border-amber-200 bg-amber-50/30">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm">🏪 {data.nom_commerce || data.full_name || profile.user_email}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusCfg[profile.status] || "bg-muted text-muted-foreground"}`}>{profile.status}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{data.type_commerce || "—"}</p>
                      <p className="text-xs font-medium">{data.telephone || "Non renseigné"}</p>
                      <p className="text-xs text-muted-foreground">{profile.user_email}</p>
                      {profile.refusal_reason && <p className="text-xs text-red-600">Motif : {profile.refusal_reason}</p>}
                    </div>
                  </div>
                  {profile.status === "en_attente" && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1 border-red-300 text-red-600 h-8 text-xs" onClick={() => refuserProfilPartenaire(profile)}>
                        ❌ Refuser
                      </Button>
                      <Button size="sm" className="flex-1 bg-green-600 hover:bg-green-700 h-8 text-xs" onClick={() => validerProfilPartenaire(profile)}>
                        ✅ Valider
                      </Button>
                    </div>
                  )}
                  {profile.status === "refuse" && (
                    <Button size="sm" className="w-full bg-green-600 hover:bg-green-700 h-8 text-xs" onClick={() => validerProfilPartenaire(profile)}>
                      ✅ Valider quand même
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="space-y-2">
        {filtered.map(partenaire => {
          const statut = partenaire.statut || "en_attente";
          const cfg = STATUT_CONFIG[statut] || "bg-gray-100 text-gray-700";
          return (
            <Card key={partenaire.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm truncate">{partenaire.nom_commerce}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg}`}>{statut}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{partenaire.type_commerce || "—"}</p>
                    <p className="text-xs font-medium">{partenaire.telephone || "non renseigné"}</p>
                    <p className="text-xs text-muted-foreground">{partenaire.user_email}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-primary">{partenaire.nombre_commandes || 0} cdes</p>
                    <p className="text-[10px] text-muted-foreground">{(partenaire.chiffre_affaires || 0).toLocaleString()} F</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {partenaire.telephone && <a href={`tel:${partenaire.telephone}`} className="flex-1"><button className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-primary/30 text-primary text-xs font-medium hover:bg-primary/5"><Phone className="h-3.5 w-3.5" /> Appeler</button></a>}
                  {partenaire.telephone && <a href={`https://wa.me/${partenaire.telephone?.replace(/[^0-9]/g,'')}`} target="_blank" rel="noreferrer" className="flex-1"><button className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-green-300 text-green-700 text-xs font-medium hover:bg-green-50"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</button></a>}
                  <Button size="sm" variant="outline" className="h-8 text-xs flex-1" onClick={() => ouvrirFiche(partenaire)}><Eye className="h-3 w-3 mr-1" />Fiche</Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && <div className="text-center py-12"><p className="text-sm text-muted-foreground">Aucun partenaire trouvé</p></div>}
      </div>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Fiche partenaire</DialogTitle></DialogHeader>
          {selected && (
            <Tabs defaultValue="profil">
              <TabsList className="w-full">
                <TabsTrigger value="profil" className="flex-1 text-xs">Profil</TabsTrigger>
                <TabsTrigger value="historique" className="flex-1 text-xs">Historique</TabsTrigger>
              </TabsList>

              <TabsContent value="profil" className="space-y-4 mt-4">
                <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl">
                  {selected.logo ? <img src={selected.logo} alt="" className="h-12 w-12 rounded-lg object-cover" /> : <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">🏪</div>}
                  <div>
                    <p className="font-bold">{selected.nom_commerce}</p>
                    <p className="text-xs text-muted-foreground">{selected.type_commerce}</p>
                    <p className="text-xs text-muted-foreground">Inscrit {moment(selected.created_date).format("DD/MM/YYYY")}</p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 space-y-2">
                  <p className="text-xs font-bold uppercase text-blue-700">📞 Contacts</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><p className="text-[10px] text-muted-foreground">Téléphone</p><p className="font-semibold">{selected.telephone || "—"}</p></div>
                    <div><p className="text-[10px] text-muted-foreground">Quartier</p><p>{selected.quartier || "—"}</p></div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    {selected.telephone && <a href={`tel:${selected.telephone}`} className="flex-1"><button className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary text-white text-xs font-semibold"><Phone className="h-3.5 w-3.5" /> Appeler</button></a>}
                    {selected.telephone && <a href={`https://wa.me/${selected.telephone?.replace(/[^0-9]/g,'')}`} target="_blank" rel="noreferrer" className="flex-1"><button className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-green-600 text-white text-xs font-semibold"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</button></a>}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="p-3 rounded-lg border text-center"><p className="font-bold text-primary">{selected.nombre_vues || 0}</p><p className="text-[10px] text-muted-foreground">Vues</p></div>
                  <div className="p-3 rounded-lg border text-center"><p className="font-bold text-green-600">{selected.nombre_commandes || 0}</p><p className="text-[10px] text-muted-foreground">Cdes</p></div>
                  <div className="p-3 rounded-lg border text-center"><p className="font-bold">{selected.statut || "—"}</p><p className="text-[10px] text-muted-foreground">Statut</p></div>
                </div>

                {selected.statut_abonnement && (
                  <div className="p-3 rounded-lg border text-sm space-y-1">
                    <div className="flex justify-between"><span>Abonnement</span><span className={`font-bold ${selected.statut_abonnement === "Expiré" ? "text-red-600" : "text-green-600"}`}>{selected.statut_abonnement}</span></div>
                    {selected.date_expiration_abonnement && <div className="flex justify-between"><span>Expire</span><span>{moment(selected.date_expiration_abonnement).format("DD/MM/YYYY")}</span></div>}
                  </div>
                )}

                <div className="flex gap-2">
                  {selected.statut === "suspendu" || selected.suspended ? (
                    <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => reactiver(selected)}>✅ Réactiver</Button>
                  ) : (
                    <Button variant="outline" className="flex-1 border-orange-300 text-orange-600" onClick={() => suspendre(selected)}>⏸️ Suspendre</Button>
                  )}
                  {admin?.role === "admin" && (
                    <Button variant="outline" className="flex-1 border-red-400 text-red-700 hover:bg-red-50" onClick={() => supprimerPartenaire(selected)}><Trash2 className="h-3 w-3" /></Button>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="historique" className="mt-4">
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {logs.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">Aucun historique</p>
                  ) : (
                    logs.map(log => (
                      <div key={log.id} className="text-xs p-2 rounded-lg bg-muted/40 border">
                        <div className="flex justify-between"><span className="font-medium">{log.action}</span><span className="text-muted-foreground">{moment(log.created_date).format("DD/MM/YY HH:mm")}</span></div>
                        <p className="text-muted-foreground">{log.reason}</p>
                        <p className="text-[9px] text-muted-foreground">Par: {log.admin_email}</p>
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}