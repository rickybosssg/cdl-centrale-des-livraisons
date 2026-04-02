import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Phone, MessageCircle, Eye, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import moment from "moment";

const STATUT_CONFIG = {
  "en_attente": "bg-amber-100 text-amber-700",
  "valide": "bg-green-100 text-green-700",
  "refuse": "bg-red-100 text-red-700",
};

export default function GererCommerciaux() {
  const navigate = useNavigate();
  const [commerciaux, setCommerciaux] = useState([]);
  const [codes, setCodes] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [admin, setAdmin] = useState(null);
  const [selected, setSelected] = useState(null);
  const [dialog, setDialog] = useState(false);
  const [search, setSearch] = useState("");
  const [filtre, setFiltre] = useState("tous");

  const loadData = async () => {
    const [dataCommerciaux, dataCodes, me] = await Promise.all([
      base44.entities.User.filter({ user_type: "commercial" }),
      base44.entities.CodePromo.list("-created_date", 200),
      base44.auth.me(),
    ]);
    setCommerciaux(dataCommerciaux);
    setCodes(dataCodes);
    setAdmin(me);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    const unsub = base44.entities.User.subscribe((event) => {
      if (event.data?.user_type === 'commercial') {
        if (event.type === 'create') setCommerciaux(prev => [...prev, event.data]);
        else if (event.type === 'update') setCommerciaux(prev => prev.map(c => c.id === event.id ? event.data : c));
        else if (event.type === 'delete') setCommerciaux(prev => prev.filter(c => c.id !== event.id));
      }
    });
    return unsub;
  }, []);

  const ouvrirFiche = async (commercial) => {
    setSelected(commercial);
    try {
      const history = await base44.entities.AdminActionLog.filter({ target_email: commercial.email }, "-created_date", 20);
      setLogs(history || []);
    } catch (_) {
      setLogs([]);
    }
    setDialog(true);
  };

  const validerCommercial = async (commercial) => {
    await base44.entities.User.update(commercial.id, { statut_validation_commercial: "valide" });
    const code = codes.find(c => c.commercial_email === commercial.email);
    if (!code) {
      const newCode = "COM" + Math.floor(1000 + Math.random() * 9000);
      await base44.entities.CodePromo.create({
        commercial_email: commercial.email,
        commercial_name: commercial.full_name,
        code: newCode,
        statut: "valide",
        actif: true,
      });
    }
    await base44.entities.AdminActionLog.create({
      admin_email: admin.email,
      object_type: "commercial",
      object_id: commercial.id,
      object_name: commercial.full_name,
      action: "validate",
      reason: "Validation commercial",
      target_email: commercial.email,
    });
    toast.success("Commercial validé");
    setDialog(false);
    loadData();
  };

  const refuserCommercial = async (commercial) => {
    await base44.entities.User.update(commercial.id, { statut_validation_commercial: "refuse" });
    await base44.entities.AdminActionLog.create({
      admin_email: admin.email,
      object_type: "commercial",
      object_id: commercial.id,
      object_name: commercial.full_name,
      action: "refuse",
      reason: "Refus commercial",
      target_email: commercial.email,
    });
    toast.success("Commercial refusé");
    setDialog(false);
    loadData();
  };

  const supprimerCommercial = async (commercial) => {
    if (!window.confirm(`Supprimer définitivement ${commercial.full_name} ?`)) return;
    await base44.entities.User.delete(commercial.id);
    await base44.entities.AdminActionLog.create({
      admin_email: admin.email,
      object_type: "commercial",
      object_id: commercial.id,
      object_name: commercial.full_name,
      action: "delete",
      reason: "Suppression commercial",
      target_email: commercial.email,
    });
    toast.success("Commercial supprimé");
    setDialog(false);
    loadData();
  };

  const filtered = commerciaux.filter(c => {
    const q = search.toLowerCase();
    const code = codes.find(cp => cp.commercial_email === c.email);
    const match = !q || c.full_name?.toLowerCase().includes(q) || c.telephone?.includes(q) || c.email?.toLowerCase().includes(q) || code?.code?.toLowerCase().includes(q);
    let filtre_match = true;
    if (filtre === "valides") filtre_match = c.statut_validation_commercial === "valide";
    else if (filtre === "en_attente") filtre_match = !c.statut_validation_commercial || c.statut_validation_commercial === "en_attente";
    else if (filtre === "refuses") filtre_match = c.statut_validation_commercial === "refuse";
    return match && filtre_match;
  });

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="text-xl font-bold">Gérer les commerciaux</h1>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Card className="text-center"><CardContent className="p-3"><p className="text-2xl font-bold">{commerciaux.length}</p><p className="text-[10px] text-muted-foreground">Total</p></CardContent></Card>
        <Card className="text-center"><CardContent className="p-3"><p className="text-2xl font-bold text-green-600">{commerciaux.filter(c => c.statut_validation_commercial === "valide").length}</p><p className="text-[10px] text-muted-foreground">Validés</p></CardContent></Card>
        <Card className="text-center"><CardContent className="p-3"><p className="text-2xl font-bold text-amber-600">{commerciaux.filter(c => !c.statut_validation_commercial || c.statut_validation_commercial === "en_attente").length}</p><p className="text-[10px] text-muted-foreground">En attente</p></CardContent></Card>
      </div>

      {/* RECHERCHE ET FILTRES */}
      <div className="space-y-3 p-3 rounded-xl bg-muted/40 border">
        <Input 
          placeholder="Rechercher par nom, tél, code promo..." 
          value={search} 
          onChange={e => setSearch(e.target.value)} 
          className="bg-white"
        />
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[{val:"tous",label:"Tous"},{val:"valides",label:"✅ Validés"},{val:"en_attente",label:"⏳ En attente"},{val:"refuses",label:"❌ Refusés"}]
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

      <div className="space-y-2">
        {filtered.map(commercial => {
          const statut = commercial.statut_validation_commercial || "en_attente";
          const cfg = STATUT_CONFIG[statut] || "bg-gray-100 text-gray-700";
          const code = codes.find(c => c.commercial_email === commercial.email);
          return (
            <Card key={commercial.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm truncate">{commercial.full_name}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg}`}>{statut === "en_attente" ? "En attente" : statut === "valide" ? "Validé" : "Refusé"}</span>
                    </div>
                    <p className="text-xs font-medium">{commercial.telephone || "non renseigné"}</p>
                    <p className="text-xs text-muted-foreground">{commercial.email}</p>
                    {code && <p className="text-xs font-bold text-accent">Code: {code.code}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-primary">{code ? (code.commission_due || 0).toLocaleString() + " F" : "—"}</p>
                    <p className="text-[10px] text-muted-foreground">Gains dus</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {commercial.telephone && <a href={`tel:${commercial.telephone}`} className="flex-1"><button className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-primary/30 text-primary text-xs font-medium hover:bg-primary/5"><Phone className="h-3.5 w-3.5" /> Appeler</button></a>}
                  {commercial.telephone && <a href={`https://wa.me/${commercial.telephone?.replace(/[^0-9]/g,'')}`} target="_blank" rel="noreferrer" className="flex-1"><button className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-green-300 text-green-700 text-xs font-medium hover:bg-green-50"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</button></a>}
                  <Button size="sm" variant="outline" className="h-8 text-xs flex-1" onClick={() => ouvrirFiche(commercial)}><Eye className="h-3 w-3 mr-1" />Fiche</Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && <div className="text-center py-12"><p className="text-sm text-muted-foreground">Aucun commercial trouvé</p></div>}
      </div>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Fiche commercial</DialogTitle></DialogHeader>
          {selected && (
            <Tabs defaultValue="profil">
              <TabsList className="w-full">
                <TabsTrigger value="profil" className="flex-1 text-xs">Profil</TabsTrigger>
                <TabsTrigger value="code" className="flex-1 text-xs">Code Promo</TabsTrigger>
                <TabsTrigger value="historique" className="flex-1 text-xs">Historique</TabsTrigger>
              </TabsList>

              <TabsContent value="profil" className="space-y-4 mt-4">
                <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center font-bold text-lg text-primary">💼</div>
                  <div>
                    <p className="font-bold">{selected.full_name}</p>
                    <p className="text-xs text-muted-foreground">{selected.email}</p>
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

                <div className="p-3 rounded-lg border text-sm space-y-1">
                  <div className="flex justify-between"><span>Statut</span><span className="font-bold">{selected.statut_validation_commercial || "en_attente"}</span></div>
                  <div className="flex justify-between"><span>Inscrit</span><span>{moment(selected.created_date).format("DD/MM/YYYY")}</span></div>
                </div>

                <div className="flex gap-2">
                  {!selected.statut_validation_commercial || selected.statut_validation_commercial === "en_attente" ? (
                    <>
                      <Button variant="outline" className="flex-1 border-red-300 text-red-600" onClick={() => refuserCommercial(selected)}>❌ Refuser</Button>
                      <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => validerCommercial(selected)}>✅ Valider</Button>
                    </>
                  ) : selected.statut_validation_commercial === "refuse" ? (
                    <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => validerCommercial(selected)}>✅ Valider quand même</Button>
                  ) : null}
                  {admin?.role === "admin" && (
                    <Button variant="outline" className="flex-1 border-red-400 text-red-700 hover:bg-red-50" onClick={() => supprimerCommercial(selected)}><Trash2 className="h-3 w-3" /></Button>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="code" className="mt-4">
                {codes.find(c => c.commercial_email === selected.email) ? (
                  <div className="space-y-2">
                    {(() => {
                      const code = codes.find(c => c.commercial_email === selected.email);
                      return (
                        <>
                          <div className="p-3 rounded-lg border"><p className="text-xs text-muted-foreground">Code</p><p className="text-lg font-bold text-accent">{code.code}</p></div>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="p-3 rounded-lg border"><p className="text-[10px] text-muted-foreground">Utilisations</p><p className="font-bold">{code.nombre_utilisations || 0}</p></div>
                            <div className="p-3 rounded-lg border"><p className="text-[10px] text-muted-foreground">Commission due</p><p className="font-bold text-amber-600">{(code.commission_due || 0).toLocaleString()} F</p></div>
                            <div className="p-3 rounded-lg border"><p className="text-[10px] text-muted-foreground">Commission payée</p><p className="font-bold text-green-600">{(code.commission_payee || 0).toLocaleString()} F</p></div>
                            <div className="p-3 rounded-lg border"><p className="text-[10px] text-muted-foreground">Statut</p><p className={`font-bold ${code.actif ? "text-green-600" : "text-red-600"}`}>{code.actif ? "✅ Actif" : "❌ Inactif"}</p></div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-6">Aucun code promo attribué</p>
                )}
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