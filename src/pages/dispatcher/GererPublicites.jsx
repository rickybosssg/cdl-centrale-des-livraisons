import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Upload, Eye, Edit, Trash2, BarChart3, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import moment from "moment";

const TYPES = ["Image", "Vidéo"];
const PLACEMENTS = ["accueil", "attente_livreur", "dashboard_livreur", "marketplace"];
const CIBLES = ["tous", "clients", "livreurs", "partenaires"];

export default function GererPublicites() {
  const navigate = useNavigate();
  const [pubs, setPubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    titre: "",
    description: "",
    type: "Image",
    placement: "accueil",
    destinataires: "tous",
    date_debut: new Date().toISOString().split("T")[0],
    date_fin: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    lien_url: "",
    active: true,
  });
  const [file, setFile] = useState(null);

  const loadPubs = async () => {
    try {
      const data = await base44.entities.Publicite.list("-created_date", 100);
      setPubs(data);
    } catch (err) {
      console.error("[GererPublicites] Error:", err);
      toast.error("Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPubs();
    const unsub = base44.entities.Publicite.subscribe((event) => {
      if (event.type === "create") {
        setPubs(prev => [event.data, ...prev]);
      } else if (event.type === "update") {
        setPubs(prev => prev.map(p => p.id === event.id ? event.data : p));
      } else if (event.type === "delete") {
        setPubs(prev => prev.filter(p => p.id !== event.id));
      }
    });
    return unsub;
  }, []);

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      toast.error("Fichier trop volumineux (max 5MB)");
      return;
    }
    setFile(f);
  };

  const handleSubmit = async () => {
    if (!form.titre || !form.type || !form.placement || !form.date_debut || !form.date_fin) {
      toast.error("Veuillez remplir les champs obligatoires");
      return;
    }

    setUploading(true);
    try {
      let imageUrl = editing?.image_url || "";

      // Upload fichier si fourni
      if (file) {
        const uploadRes = await base44.integrations.Core.UploadFile({ file });
        imageUrl = uploadRes.file_url;
      }

      if (!imageUrl) {
        toast.error("Veuillez fournir un fichier");
        setUploading(false);
        return;
      }

      if (editing) {
        // Update
        await base44.entities.Publicite.update(editing.id, {
          ...form,
          image_url: imageUrl,
          impressions: editing.impressions || 0,
          clics: editing.clics || 0,
        });
        toast.success("Publicité mise à jour");
      } else {
        // Create
        await base44.entities.Publicite.create({
          ...form,
          image_url: imageUrl,
          impressions: 0,
          clics: 0,
        });
        toast.success("Publicité créée");
      }

      setDialogOpen(false);
      setEditing(null);
      setFile(null);
      setForm({
        titre: "",
        description: "",
        type: "Image",
        placement: "accueil",
        destinataires: "tous",
        date_debut: new Date().toISOString().split("T")[0],
        date_fin: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        lien_url: "",
        active: true,
      });
      loadPubs();
    } catch (err) {
      console.error("[GererPublicites] Submit error:", err);
      toast.error("Erreur: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Supprimer cette publicité ?")) return;
    try {
      await base44.entities.Publicite.delete(id);
      toast.success("Publicité supprimée");
      loadPubs();
    } catch (err) {
      toast.error("Erreur: " + err.message);
    }
  };

  const handleEdit = (pub) => {
    setEditing(pub);
    setForm({
      titre: pub.titre,
      description: pub.description,
      type: pub.type,
      placement: pub.placement,
      destinataires: pub.destinataires,
      date_debut: pub.date_debut.split("T")[0],
      date_fin: pub.date_fin.split("T")[0],
      lien_url: pub.lien_url || "",
      active: pub.active,
    });
    setDialogOpen(true);
  };

  const stats = {
    total: pubs.length,
    actives: pubs.filter(p => p.active).length,
    impressions: pubs.reduce((sum, p) => sum + (p.impressions || 0), 0),
    clics: pubs.reduce((sum, p) => sum + (p.clics || 0), 0),
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
        <h1 className="text-xl font-bold flex-1">Gestion des publicités</h1>
        <Button onClick={() => { setEditing(null); setFile(null); setForm({
          titre: "", description: "", type: "Image", placement: "accueil",
          destinataires: "tous", date_debut: new Date().toISOString().split("T")[0],
          date_fin: new Date(Date.now() + 7*24*60*60*1000).toISOString().split("T")[0],
          lien_url: "", active: true
        }); setDialogOpen(true); }}>
          <Upload className="h-4 w-4 mr-2" /> Nouvelle pub
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        <Card>
          <CardContent className="p-3">
            <p className="text-2xl font-bold text-primary">{stats.total}</p>
            <p className="text-[10px] text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-2xl font-bold text-green-600">{stats.actives}</p>
            <p className="text-[10px] text-muted-foreground">Actives</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-2xl font-bold text-blue-600">{stats.impressions.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">Vues</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-2xl font-bold text-purple-600">{stats.clics.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">Clics</p>
          </CardContent>
        </Card>
      </div>

      {/* Liste */}
      <div className="space-y-2">
        {pubs.length === 0 ? (
          <div className="text-center py-12">
            <AlertCircle className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-muted-foreground">Aucune publicité</p>
          </div>
        ) : (
          pubs.map(pub => {
            const isActive = new Date(pub.date_debut) <= new Date() && new Date() <= new Date(pub.date_fin) && pub.active;
            return (
              <Card key={pub.id} className={`${isActive ? "" : "opacity-60"}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    {/* Thumbnail */}
                    <div className="h-16 w-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                      {pub.type === "Vidéo" ? (
                        <video src={pub.image_url} className="w-full h-full object-cover" />
                      ) : (
                        <img src={pub.image_url} alt={pub.titre} className="w-full h-full object-cover" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold truncate">{pub.titre}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap ${
                          pub.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"
                        }`}>
                          {pub.active ? "Actif" : "Inactif"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{pub.type} • {pub.placement}</p>
                      <p className="text-xs text-muted-foreground">{pub.destinataires}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {moment(pub.date_debut).format("DD/MM")} → {moment(pub.date_fin).format("DD/MM")} • 
                        {pub.impressions || 0} vues • {pub.clics || 0} clics
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-1 flex-shrink-0">
                      <Button size="sm" variant="outline" onClick={() => handleEdit(pub)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDelete(pub.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Dialog Création/Édition */}
      <Dialog open={dialogOpen} onOpenChange={v => { setDialogOpen(v); if (!v) setEditing(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier" : "Créer"} une publicité</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Titre */}
            <div className="space-y-1">
              <label className="text-xs font-semibold">Titre *</label>
              <Input
                placeholder="Titre de la publicité"
                value={form.titre}
                onChange={e => setForm({ ...form, titre: e.target.value })}
              />
            </div>

            {/* Description */}
            <div className="space-y-1">
              <label className="text-xs font-semibold">Description</label>
              <Textarea
                placeholder="Description courte"
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                rows={2}
              />
            </div>

            {/* Type */}
            <div className="space-y-1">
              <label className="text-xs font-semibold">Type *</label>
              <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Upload */}
            <div className="space-y-1">
              <label className="text-xs font-semibold">Fichier ({form.type}) *</label>
              <div className="border-2 border-dashed rounded-lg p-4 text-center">
                {file ? (
                  <div className="text-sm">
                    <p className="font-medium text-green-600">✓ {file.name}</p>
                    <p className="text-[10px] text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)}MB</p>
                  </div>
                ) : (
                  <label className="cursor-pointer">
                    <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm font-medium">Cliquez pour sélectionner</p>
                    <p className="text-[10px] text-muted-foreground">Max 5MB</p>
                    <input
                      type="file"
                      onChange={handleFileChange}
                      accept={form.type === "Vidéo" ? "video/mp4" : "image/jpg,image/png"}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>

            {/* Lien */}
            <div className="space-y-1">
              <label className="text-xs font-semibold">Lien de redirection</label>
              <Input
                placeholder="https://..."
                value={form.lien_url}
                onChange={e => setForm({ ...form, lien_url: e.target.value })}
              />
            </div>

            {/* Cible */}
            <div className="space-y-1">
              <label className="text-xs font-semibold">Cible *</label>
              <Select value={form.destinataires} onValueChange={v => setForm({ ...form, destinataires: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CIBLES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Placement */}
            <div className="space-y-1">
              <label className="text-xs font-semibold">Emplacement *</label>
              <Select value={form.placement} onValueChange={v => setForm({ ...form, placement: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLACEMENTS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold">Début *</label>
                <Input
                  type="date"
                  value={form.date_debut}
                  onChange={e => setForm({ ...form, date_debut: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold">Fin *</label>
                <Input
                  type="date"
                  value={form.date_fin}
                  onChange={e => setForm({ ...form, date_fin: e.target.value })}
                />
              </div>
            </div>

            {/* Statut */}
            <label className="flex items-center gap-2 p-2 rounded-lg border cursor-pointer">
              <input
                type="checkbox"
                checked={form.active}
                onChange={e => setForm({ ...form, active: e.target.checked })}
                className="h-4 w-4"
              />
              <span className="text-sm font-medium">Actif</span>
            </label>

            {/* Buttons */}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>
                Annuler
              </Button>
              <Button className="flex-1" onClick={handleSubmit} disabled={uploading}>
                {uploading ? "Upload..." : editing ? "Mettre à jour" : "Créer"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}