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
  "Nouveau": "bg-gray-100 text-gray-700",
  "Actif": "bg-green-100 text-green-700",
  "Fidèle": "bg-blue-100 text-blue-700",
  "VIP": "bg-amber-100 text-amber-700",
  "Inactif": "bg-orange-100 text-orange-700",
  "Bloqué": "bg-red-100 text-red-700",
};

export default function GererClients() {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [admin, setAdmin] = useState(null);
  const [selected, setSelected] = useState(null);
  const [dialog, setDialog] = useState(false);
  const [search, setSearch] = useState("");
  const [filtre, setFiltre] = useState("tous");

  const loadData = async () => {
    const [dataClients, me] = await Promise.all([
      base44.entities.Client.list("-created_date", 500),
      base44.auth.me(),
    ]);
    setClients(dataClients);
    setAdmin(me);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    const unsub = base44.entities.Client.subscribe((event) => {
      if (event.type === 'create') setClients(prev => [...prev, event.data]);
      else if (event.type === 'update') setClients(prev => prev.map(c => c.id === event.id ? event.data : c));
      else if (event.type === 'delete') setClients(prev => prev.filter(c => c.id !== event.id));
    });
    return unsub;
  }, []);

  const ouvrirFiche = async (client) => {
    setSelected(client);
    try {
      const history = await base44.entities.AdminActionLog.filter({ target_email: client.email }, "-created_date", 20);
      setLogs(history || []);
    } catch (_) {
      setLogs([]);
    }
    setDialog(true);
  };

  const bloquer = async (client) => {
    await base44.entities.Client.update(client.id, { statut_client: "Bloqué" });
    await base44.entities.AdminActionLog.create({
      admin_email: admin.email,
      object_type: "client",
      object_id: client.id,
      object_name: client.nom_complet,
      action: "suspend",
      reason: "Blocage client",
      target_email: client.email,
    });
    toast.success("Client bloqué");
    setDialog(false);
    loadData();
  };

  const reactiver = async (client) => {
    await base44.entities.Client.update(client.id, { statut_client: "Actif" });
    await base44.entities.AdminActionLog.create({
      admin_email: admin.email,
      object_type: "client",
      object_id: client.id,
      object_name: client.nom_complet,
      action: "unsuspend",
      reason: "Réactivation client",
      target_email: client.email,
    });
    toast.success("Client réactivé");
    setDialog(false);
    loadData();
  };

  const supprimerClient = async (client) => {
    const confirmed = window.confirm(
      `⚠️ SUPPRESSION COMPLÈTE\n\n` +
      `Cela supprimera :\n` +
      `• Le compte ${client.nom_complet}\n` +
      `• Tous les profils liés\n` +
      `• Toutes les données associées\n\n` +
      `Cette action est IRRÉVERSIBLE.\n` +
      `Confirmer ?"`
    );
    if (!confirmed) return;

    try {
      const res = await base44.functions.invoke('deleteUserComplete', {
        user_id: client.id,
        user_email: client.email,
      });
      if (res.data?.success) {
        toast.success(`✅ ${client.nom_complet} supprimé complètement`);
        setDialog(false);
        setClients(prev => prev.filter(c => c.id !== client.id));
        setSelected(null);
      } else {
        toast.error(`Erreur : ${res.data?.error || 'Suppression échouée'}`);
      }
    } catch (err) {
      toast.error(`Erreur suppression : ${err.message}`);
    }
  };

  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    const match = !q || c.nom_complet?.toLowerCase().includes(q) || c.numero_telephone?.includes(q) || c.email?.toLowerCase().includes(q);
    let filtre_match = true;
    if (filtre === "vip") filtre_match = c.statut_client === "VIP";
    else if (filtre === "fideles") filtre_match = c.statut_client === "Fidèle";
    else if (filtre === "actifs") filtre_match = c.statut_client === "Actif";
    else if (filtre === "bloques") filtre_match = c.statut_client === "Bloqué";
    return match && filtre_match;
  });

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="text-xl font-bold">Gérer les clients</h1>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Card className="text-center"><CardContent className="p-3"><p className="text-2xl font-bold">{clients.length}</p><p className="text-[10px] text-muted-foreground">Total</p></CardContent></Card>
        <Card className="text-center"><CardContent className="p-3"><p className="text-2xl font-bold text-amber-600">{clients.filter(c => c.statut_client === "VIP").length}</p><p className="text-[10px] text-muted-foreground">VIP</p></CardContent></Card>
        <Card className="text-center"><CardContent className="p-3"><p className="text-2xl font-bold text-red-600">{clients.filter(c => c.statut_client === "Bloqué").length}</p><p className="text-[10px] text-muted-foreground">Bloqués</p></CardContent></Card>
      </div>

      <Input placeholder="Rechercher par nom, tél, email..." value={search} onChange={e => setSearch(e.target.value)} />

      <div className="flex gap-2 overflow-x-auto pb-1">
        {[{val:"tous",label:"Tous"},{val:"vip",label:"⭐ VIP"},{val:"fideles",label:"💎 Fidèles"},{val:"actifs",label:"✅ Actifs"},{val:"bloques",label:"🔒 Bloqués"}]
          .map(f => (
          <button key={f.val} onClick={() => setFiltre(f.val)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-all ${
              filtre === f.val ? "bg-primary text-primary-foreground border-primary" : "border-border"
            }`}>{f.label}</button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.map(client => {
          const statut = client.statut_client || "Actif";
          const cfg = STATUT_CONFIG[statut] || "bg-gray-100 text-gray-700";
          return (
            <Card key={client.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm truncate">{client.nom_complet}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg}`}>{statut}</span>
                    </div>
                    <p className="text-xs font-medium">{client.numero_telephone || "non renseigné"}</p>
                    <p className="text-xs text-muted-foreground">{client.email}</p>
                    {client.quartier_principal && <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{client.quartier_principal}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-primary">{client.nombre_total_courses || 0} courses</p>
                    <p className="text-[10px] text-muted-foreground">{(client.total_depense || 0).toLocaleString()} F</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {client.numero_telephone && <a href={`tel:${client.numero_telephone}`} className="flex-1"><button className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-primary/30 text-primary text-xs font-medium hover:bg-primary/5"><Phone className="h-3.5 w-3.5" /> Appeler</button></a>}
                  {client.numero_telephone && <a href={`https://wa.me/${client.numero_telephone?.replace(/[^0-9]/g,'')}`} target="_blank" rel="noreferrer" className="flex-1"><button className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-green-300 text-green-700 text-xs font-medium hover:bg-green-50"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</button></a>}
                  <Button size="sm" variant="outline" className="h-8 text-xs flex-1" onClick={() => ouvrirFiche(client)}><Eye className="h-3 w-3 mr-1" />Fiche</Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && <div className="text-center py-12"><p className="text-sm text-muted-foreground">Aucun client trouvé</p></div>}
      </div>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Fiche client</DialogTitle></DialogHeader>
          {selected && (
            <Tabs defaultValue="profil">
              <TabsList className="w-full">
                <TabsTrigger value="profil" className="flex-1 text-xs">Profil</TabsTrigger>
                <TabsTrigger value="historique" className="flex-1 text-xs">Historique</TabsTrigger>
              </TabsList>

              <TabsContent value="profil" className="space-y-4 mt-4">
                <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center font-bold text-lg text-primary">{selected.nom_complet?.charAt(0)}</div>
                  <div>
                    <p className="font-bold">{selected.nom_complet}</p>
                    <p className="text-xs text-muted-foreground">{selected.email}</p>
                    <p className="text-xs text-muted-foreground">Inscrit {moment(selected.created_date).format("DD/MM/YYYY")}</p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 space-y-2">
                  <p className="text-xs font-bold uppercase text-blue-700">📞 Contacts</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><p className="text-[10px] text-muted-foreground">Téléphone</p><p className="font-semibold">{selected.numero_telephone || "—"}</p></div>
                    <div><p className="text-[10px] text-muted-foreground">Quartier</p><p>{selected.quartier_principal || "—"}</p></div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    {selected.numero_telephone && <a href={`tel:${selected.numero_telephone}`} className="flex-1"><button className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary text-white text-xs font-semibold"><Phone className="h-3.5 w-3.5" /> Appeler</button></a>}
                    {selected.numero_telephone && <a href={`https://wa.me/${selected.numero_telephone?.replace(/[^0-9]/g,'')}`} target="_blank" rel="noreferrer" className="flex-1"><button className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-green-600 text-white text-xs font-semibold"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</button></a>}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="p-3 rounded-lg border text-center"><p className="font-bold text-primary">{selected.nombre_total_courses || 0}</p><p className="text-[10px] text-muted-foreground">Courses</p></div>
                  <div className="p-3 rounded-lg border text-center"><p className="font-bold text-green-600">{(selected.total_depense || 0).toLocaleString()} F</p><p className="text-[10px] text-muted-foreground">Dépensé</p></div>
                  <div className="p-3 rounded-lg border text-center"><p className="font-bold">{selected.statut_client || "Actif"}</p><p className="text-[10px] text-muted-foreground">Statut</p></div>
                </div>

                <div className="flex gap-2">
                  {selected.statut_client === "Bloqué" ? (
                    <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => reactiver(selected)}>✅ Réactiver</Button>
                  ) : (
                    <Button variant="outline" className="flex-1 border-red-300 text-red-600" onClick={() => bloquer(selected)}>🔒 Bloquer</Button>
                  )}
                  {admin?.role === "admin" && (
                    <Button variant="outline" className="flex-1 border-red-400 text-red-700 hover:bg-red-50" onClick={() => supprimerClient(selected)}><Trash2 className="h-3 w-3" /></Button>
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