import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Plus, Trash2, ToggleLeft, ToggleRight, Eye, MousePointer, Upload, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const PLACEMENTS = [
  { value: "home_client", label: "Accueil clients" },
  { value: "home_livreur", label: "Accueil livreurs" },
  { value: "toutes_pages", label: "Toutes les pages" },
];

export default function GererPublicites() {
  const navigate = useNavigate();
  const [pubs, setPubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [dialogDelete, setDialogDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({
    titre: "", description: "", lien_url: "", placement: "home_client",
    date_debut: "", date_fin: "", nom_annonceur: "", image_url: "",
  });

  const load = async () => {
    const data = await base44.entities.Publicite.list("-created_date", 100);
    setPubs(data.filter(p => !p.deleted));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!form.titre || (!form.image_url && !photoFile)) {
      toast.error("Titre et image requis");
      return;
    }
    setSaving(true);
    let image_url = form.image_url;
    if (photoFile) {
      const res = await base44.integrations.Core.UploadFile({ file: photoFile });
      image_url = res.file_url;
    }
    await base44.entities.Publicite.create({
      ...form,
      image_url,
      active: true,
      impressions: 0,
      clics: 0,
    });
    toast.success("Publicité créée !");
    setForm({ titre: "", description: "", lien_url: "", placement: "home_client", date_debut: "", date_fin: "", nom_annonceur: "", image_url: "" });
    setPhotoFile(null);
    setShowForm(false);
    load();
    setSaving(false);
  };

  const toggleActive = async (pub) => {
    await base44.entities.Publicite.update(pub.id, { active: !pub.active });
    setPubs(prev => prev.map(p => p.id === pub.id ? { ...p, active: !p.active } : p));
  };

  const supprimerPub = async (pub) => {
    setDeleting(true);
    try {
      await base44.entities.Publicite.update(pub.id, {
        deleted: true,
        deleted_at: new Date().toISOString(),
        active: false,
      });
      setPubs(prev => prev.filter(p => p.id !== pub.id));
      toast.success("Publicité supprimée");
      setDialogDelete(null);
    } catch (err) {
      toast.error("Erreur : " + err.message);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="text-xl font-bold flex-1">Publicités</h1>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-1" />Nouvelle pub
        </Button>
      </div>

      {/* Stats globales */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <Card><CardContent className="p-3"><p className="text-xl font-bold text-primary">{pubs.length}</p><p className="text-[10px] text-muted-foreground">Total</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xl font-bold text-green-600">{pubs.filter(p => p.active).length}</p><p className="text-[10px] text-muted-foreground">Actives</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xl font-bold text-accent">{pubs.reduce((s, p) => s + (p.clics || 0), 0)}</p><p className="text-[10px] text-muted-foreground">Clics totaux</p></CardContent></Card>
      </div>

      {/* Formulaire */}
      {showForm && (
        <Card className="border-primary/30">
          <CardContent className="p-4 space-y-3">
            <p className="font-semibold text-sm">Nouvelle publicité</p>
            <div><Label className="text-xs">Nom de l'annonceur</Label>
              <Input placeholder="Ex: Pharmacie Sainte-Claire" value={form.nom_annonceur} onChange={e => setForm(f => ({ ...f, nom_annonceur: e.target.value }))} /></div>
            <div><Label className="text-xs">Titre *</Label>
              <Input placeholder="Titre de la pub" value={form.titre} onChange={e => setForm(f => ({ ...f, titre: e.target.value }))} /></div>
            <div><Label className="text-xs">Description</Label>
              <Input placeholder="Courte description..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div><Label className="text-xs">Image (upload) *</Label>
              <input type="file" accept="image/*" className="hidden" id="pub_image" onChange={e => setPhotoFile(e.target.files[0])} />
              <label htmlFor="pub_image" className={`mt-1 flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-xs transition-colors ${photoFile ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted"}`}>
                <Upload className="h-3 w-3" />{photoFile ? photoFile.name : "Choisir une image"}
              </label>
            </div>
            <div><Label className="text-xs">Ou URL de l'image</Label>
              <Input placeholder="https://..." value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))} /></div>
            <div><Label className="text-xs">Lien de redirection</Label>
              <Input placeholder="https://..." value={form.lien_url} onChange={e => setForm(f => ({ ...f, lien_url: e.target.value }))} /></div>
            <div><Label className="text-xs">Emplacement *</Label>
              <Select value={form.placement} onValueChange={v => setForm(f => ({ ...f, placement: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLACEMENTS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Date début</Label>
                <Input type="date" value={form.date_debut} onChange={e => setForm(f => ({ ...f, date_debut: e.target.value }))} /></div>
              <div><Label className="text-xs">Date fin</Label>
                <Input type="date" value={form.date_fin} onChange={e => setForm(f => ({ ...f, date_fin: e.target.value }))} /></div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Annuler</Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving}>{saving ? "Enregistrement..." : "Créer"}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Liste */}
      <div className="space-y-3">
        {pubs.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Aucune publicité créée</p>}
        {pubs.map(pub => (
          <Card key={pub.id} className={!pub.active ? "opacity-60" : ""}>
            <CardContent className="p-3">
              <div className="flex gap-3">
                <img src={pub.image_url} alt={pub.titre} className="h-16 w-24 rounded-lg object-cover flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{pub.titre}</p>
                  {pub.nom_annonceur && <p className="text-xs text-muted-foreground">{pub.nom_annonceur}</p>}
                  <p className="text-[10px] text-muted-foreground">{PLACEMENTS.find(p => p.value === pub.placement)?.label}</p>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-0.5"><Eye className="h-3 w-3" />{pub.impressions || 0}</span>
                    <span className="flex items-center gap-0.5"><MousePointer className="h-3 w-3" />{pub.clics || 0}</span>
                    {pub.date_fin && <span>Expire: {pub.date_fin}</span>}
                  </div>
                </div>
                <div className="flex flex-col gap-1 items-end">
                  <button onClick={() => toggleActive(pub)}>
                    {pub.active
                      ? <ToggleRight className="h-5 w-5 text-green-500" />
                      : <ToggleLeft className="h-5 w-5 text-muted-foreground" />}
                  </button>
                  <button onClick={() => setDialogDelete(pub)} className="text-red-400 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Dialog suppression */}
      <Dialog open={!!dialogDelete} onOpenChange={(v) => { if (!v) setDialogDelete(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" /> Supprimer la publicité
            </DialogTitle>
          </DialogHeader>
          {dialogDelete && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                <p className="font-semibold text-sm">{dialogDelete.titre}</p>
                <p className="text-xs text-muted-foreground">{dialogDelete.nom_annonceur}</p>
              </div>
              <p className="text-sm text-red-700 font-semibold">⚠️ Cette action désactivera la publicité.</p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setDialogDelete(null)}>Annuler</Button>
                <Button variant="destructive" className="flex-1" onClick={() => supprimerPub(dialogDelete)} disabled={deleting}>
                  {deleting ? "Suppression..." : "✓ Confirmer"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}