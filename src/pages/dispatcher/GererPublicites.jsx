import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Eye, Plus, ToggleLeft, ToggleRight, Trash2, Edit,
  TrendingUp, MousePointerClick, Check, X, Image, Video
} from "lucide-react";
import { toast } from "sonner";
import moment from "moment";

const PLACEMENTS = [
  { value: "dashboard_client",     label: "Dashboard Client" },
  { value: "dashboard_livreur",    label: "Dashboard Livreur" },
  { value: "dashboard_commercial", label: "Dashboard Commercial" },
  { value: "accueil",              label: "Page d'accueil" },
  { value: "toutes_pages",         label: "Toutes les pages" },
];

const TARGETS = [
  { value: "client",     label: "Clients" },
  { value: "livreur",    label: "Livreurs" },
  { value: "commercial", label: "Commerciaux" },
  { value: "partenaire", label: "Partenaires" },
  { value: "all",        label: "Tous les profils" },
];

const STATUT_COLORS = {
  en_attente: "bg-amber-100 text-amber-700",
  actif:      "bg-green-100 text-green-700",
  suspendu:   "bg-gray-100 text-gray-600",
  refuse:     "bg-red-100 text-red-700",
  validée:    "bg-green-100 text-green-700",
  refusée:    "bg-red-100 text-red-700",
};

const EMPTY_FORM = {
  titre: "",
  description: "",
  image_url: "",
  video_url: "",
  placement: "dashboard_client",
  targets: ["all"],
  date_debut: "",
  date_fin: "",
  active: true,
};

export default function GererPublicites() {
  const [pubs, setPubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editPub, setEditPub] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [tab, setTab] = useState("toutes");

  const load = async () => {
    try {
      const data = await base44.entities.Publicite.list("-created_date", 200);
      setPubs(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("[GererPublicites] load error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const unsub = base44.entities.Publicite.subscribe(load);
    return unsub;
  }, []);

  const openCreate = () => { setForm(EMPTY_FORM); setEditPub(null); setShowCreate(true); };
  const openEdit = (pub) => {
    setForm({
      titre: pub.titre || "",
      description: pub.description || "",
      image_url: pub.image_url || "",
      video_url: pub.video_url || "",
      placement: pub.placement || "dashboard_client",
      targets: pub.targets || ["all"],
      date_debut: pub.date_debut || "",
      date_fin: pub.date_fin || "",
      active: pub.active !== false,
    });
    setEditPub(pub);
    setShowCreate(true);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImg(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm(f => ({ ...f, image_url: file_url }));
      toast.success("Image uploadée !");
    } catch (err) {
      toast.error("Erreur upload image");
    } finally {
      setUploadingImg(false);
    }
  };

  const handleSave = async () => {
    if (!form.titre?.trim()) { toast.error("Titre obligatoire"); return; }
    if (!form.image_url && !form.video_url) { toast.error("Ajoutez au moins une image ou vidéo"); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        targets: form.targets.length > 0 ? form.targets : ["all"],
        impressions: editPub?.impressions || 0,
        clics: editPub?.clics || 0,
      };
      if (editPub) {
        await base44.entities.Publicite.update(editPub.id, payload);
        toast.success("Publicité modifiée !");
      } else {
        await base44.entities.Publicite.create(payload);
        toast.success("Publicité créée !");
      }
      setShowCreate(false);
      setEditPub(null);
    } catch (err) {
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (pub) => {
    try {
      await base44.entities.Publicite.update(pub.id, { active: !pub.active });
      toast.success(pub.active ? "Publicité désactivée" : "Publicité activée !");
    } catch (err) {
      toast.error("Erreur");
    }
  };

  const deletePub = async (pub) => {
    if (!window.confirm(`Supprimer "${pub.titre}" ?`)) return;
    setDeletingId(pub.id);
    try {
      await base44.entities.Publicite.update(pub.id, { deleted: true, active: false });
      toast.success("Publicité supprimée");
    } catch (err) {
      toast.error("Erreur suppression");
    } finally {
      setDeletingId(null);
    }
  };

  const toggleTarget = (val) => {
    setForm(f => {
      const has = f.targets.includes(val);
      if (has) return { ...f, targets: f.targets.filter(t => t !== val) };
      return { ...f, targets: [...f.targets, val] };
    });
  };

  const safePubs = pubs.filter(p => !p.deleted);
  const filtered = tab === "toutes" ? safePubs
    : tab === "actives" ? safePubs.filter(p => p.active)
    : tab === "inactives" ? safePubs.filter(p => !p.active)
    : safePubs.filter(p => p.statut === "en_attente");

  const totalImpressions = safePubs.reduce((s, p) => s + (p.impressions || 0), 0);
  const totalClics = safePubs.reduce((s, p) => s + (p.clics || 0), 0);
  const ctr = totalImpressions > 0 ? ((totalClics / totalImpressions) * 100).toFixed(1) : "0.0";

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Eye className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Publicités CDL</h1>
            <p className="text-xs text-muted-foreground">{safePubs.length} publicité(s) au total</p>
          </div>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> Créer
        </Button>
      </div>

      {/* Stats globales */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Vues totales",  value: totalImpressions.toLocaleString(), icon: Eye,              color: "text-primary",   bg: "bg-primary/5 border-primary/20" },
          { label: "Clics totaux",  value: totalClics.toLocaleString(),        icon: MousePointerClick, color: "text-green-700", bg: "bg-green-50 border-green-200" },
          { label: "CTR moyen",     value: `${ctr}%`,                          icon: TrendingUp,        color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
        ].map((s, i) => {
          const Icon = s.icon;
          return (
            <Card key={i} className={`border ${s.bg}`}>
              <CardContent className="p-3 text-center">
                <Icon className={`h-4 w-4 mx-auto mb-1 ${s.color}`} />
                <p className={`text-lg font-extrabold ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">{s.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { k: "toutes",    l: `Toutes (${safePubs.length})` },
          { k: "actives",   l: `Actives (${safePubs.filter(p => p.active).length})` },
          { k: "inactives", l: `Inactives (${safePubs.filter(p => !p.active).length})` },
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
              tab === t.k ? "bg-primary text-white" : "bg-muted text-muted-foreground"
            }`}>{t.l}</button>
        ))}
      </div>

      {/* Liste */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Eye className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Aucune publicité ici</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={openCreate}>Créer la première</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(pub => (
            <PubAdminCard
              key={pub.id}
              pub={pub}
              onEdit={openEdit}
              onToggle={toggleActive}
              onDelete={deletePub}
              deleting={deletingId === pub.id}
            />
          ))}
        </div>
      )}

      {/* Dialog Création / Édition */}
      <Dialog open={showCreate} onOpenChange={v => { if (!v) { setShowCreate(false); setEditPub(null); } }}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editPub ? "Modifier la publicité" : "Créer une publicité"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Titre *</label>
              <Input placeholder="Titre de la publicité" value={form.titre}
                onChange={e => setForm(f => ({ ...f, titre: e.target.value }))} />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Description</label>
              <textarea
                className="w-full border rounded-md px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                rows={2}
                placeholder="Description courte..."
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>

            {/* Image */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold flex items-center gap-1"><Image className="h-3.5 w-3.5" /> Image</label>
              {form.image_url && (
                <img src={form.image_url} alt="" className="w-full h-24 rounded-lg object-cover border" />
              )}
              <label className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border-2 border-dashed border-primary/30 hover:bg-primary/5 text-xs text-primary font-medium">
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                {uploadingImg ? "Upload en cours..." : "Choisir une image"}
              </label>
              <Input placeholder="ou coller une URL d'image" value={form.image_url}
                onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))} className="text-xs" />
            </div>

            {/* Vidéo */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold flex items-center gap-1"><Video className="h-3.5 w-3.5" /> Vidéo (optionnel)</label>
              <Input placeholder="URL vidéo (mp4)" value={form.video_url}
                onChange={e => setForm(f => ({ ...f, video_url: e.target.value }))} className="text-xs" />
            </div>

            {/* Placement */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Emplacement d'affichage</label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                value={form.placement}
                onChange={e => setForm(f => ({ ...f, placement: e.target.value }))}
              >
                {PLACEMENTS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>

            {/* Cibles */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Profils ciblés</label>
              <div className="flex flex-wrap gap-2">
                {TARGETS.map(t => (
                  <button key={t.value} type="button"
                    onClick={() => toggleTarget(t.value)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                      form.targets.includes(t.value)
                        ? "bg-primary text-white border-primary"
                        : "bg-muted text-muted-foreground border-border"
                    }`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold">Début</label>
                <Input type="date" value={form.date_debut}
                  onChange={e => setForm(f => ({ ...f, date_debut: e.target.value }))} className="text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold">Fin</label>
                <Input type="date" value={form.date_fin}
                  onChange={e => setForm(f => ({ ...f, date_fin: e.target.value }))} className="text-xs" />
              </div>
            </div>

            {/* Actif */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border">
              <div className="flex-1">
                <p className="text-sm font-semibold">Activer immédiatement</p>
                <p className="text-xs text-muted-foreground">Visible dès la création</p>
              </div>
              <button onClick={() => setForm(f => ({ ...f, active: !f.active }))}>
                {form.active
                  ? <ToggleRight className="h-7 w-7 text-green-600" />
                  : <ToggleLeft className="h-7 w-7 text-muted-foreground" />}
              </button>
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => { setShowCreate(false); setEditPub(null); }}>
                Annuler
              </Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving || uploadingImg}>
                {saving ? "Sauvegarde..." : editPub ? "Modifier" : "Créer"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PubAdminCard({ pub, onEdit, onToggle, onDelete, deleting }) {
  const statutLabel = pub.active ? "actif" : "inactif";
  const statusCls = pub.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600";
  const placementLabel = PLACEMENTS.find(p => p.value === pub.placement)?.label || pub.placement;
  const ctr = (pub.impressions || 0) > 0
    ? (((pub.clics || 0) / pub.impressions) * 100).toFixed(1)
    : "0.0";

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {pub.image_url && (
          <div className="relative h-20 bg-muted">
            <img src={pub.image_url} alt={pub.titre} className="w-full h-full object-cover" />
            {pub.video_url && (
              <span className="absolute top-1 right-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">▶ Vidéo</span>
            )}
          </div>
        )}
        <div className="p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{pub.titre}</p>
              <p className="text-[10px] text-muted-foreground">📍 {placementLabel} · {moment(pub.created_date).format("DD/MM/YY")}</p>
            </div>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${statusCls}`}>
              {statutLabel}
            </span>
          </div>

          {/* Stats */}
          <div className="flex gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" /> {(pub.impressions || 0).toLocaleString()} vues
            </span>
            <span className="flex items-center gap-1">
              <MousePointerClick className="h-3 w-3" /> {(pub.clics || 0).toLocaleString()} clics
            </span>
            <span className="font-medium text-primary">CTR: {ctr}%</span>
          </div>

          {/* Cibles */}
          {pub.targets?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {pub.targets.map(t => (
                <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                  {TARGETS.find(x => x.value === t)?.label || t}
                </span>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1" onClick={() => onEdit(pub)}>
              <Edit className="h-3 w-3" /> Modifier
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={`flex-1 h-8 text-xs gap-1 ${pub.active ? "border-amber-300 text-amber-700" : "border-green-300 text-green-700"}`}
              onClick={() => onToggle(pub)}
            >
              {pub.active ? <><ToggleLeft className="h-3 w-3" /> Désactiver</> : <><ToggleRight className="h-3 w-3" /> Activer</>}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs border-red-200 text-red-600 hover:bg-red-50"
              onClick={() => onDelete(pub)}
              disabled={deleting}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}