import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ArrowLeft, CheckCircle2, XCircle, Clock, Search, Filter, Trash2 } from "lucide-react";
import { toast } from "sonner";
import moment from "moment";

const PROFILE_TYPES = {
  livreur: { emoji: "🛵", label: "Livreur", color: "green" },
  partenaire: { emoji: "🏪", label: "Partenaire", color: "purple" },
  commercial: { emoji: "📣", label: "Commercial", color: "orange" },
  client: { emoji: "👤", label: "Client", color: "blue" },
};

const ITEMS_PER_PAGE = 10;

export default function PendingProfileRequests() {
  const navigate = useNavigate();
  const [pendingProfiles, setPendingProfiles] = useState([]);
  const [filteredProfiles, setFilteredProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [actionDialog, setActionDialog] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [refusalReason, setRefusalReason] = useState("");
  const [removing, setRemoving] = useState(new Set());

  // Filtres et recherche
  const [searchQuery, setSearchQuery] = useState("");
  const [filterProfileType, setFilterProfileType] = useState("all");
  const [sortOrder, setSortOrder] = useState("newest");
  const [currentPage, setCurrentPage] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [validatingAll, setValidatingAll] = useState(false);
  const [rejectingAll, setRejectingAll] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const loadPendingProfiles = async () => {
    console.log("[PendingProfileRequests] Chargement des demandes en attente...");
    try {
      const profiles = await base44.entities.UserProfile.filter({
        status: "en_attente",
        deleted: false,
      });
      console.log(`[PendingProfileRequests] Récupéré ${profiles.length} demandes en attente`);
      profiles.forEach(p => {
        console.log(`  - ${p.user_email} | ${p.profile_type} | créé ${moment(p.created_date).fromNow()}`);
      });
      setPendingProfiles(profiles);
      applyFilters(profiles, searchQuery, filterProfileType, sortOrder);
    } catch (err) {
      console.error("[PendingProfileRequests] Erreur chargement:", err);
      toast.error("Erreur lors du chargement des demandes");
    }
    setLoading(false);
  };

  const applyFilters = (profiles, query, typeFilter, sort) => {
    let filtered = [...profiles];

    // Filtre par type
    if (typeFilter !== "all") {
      filtered = filtered.filter(p => p.profile_type === typeFilter);
    }

    // Recherche par email/nom
    if (query.trim()) {
      const q = query.toLowerCase();
      filtered = filtered.filter(p => p.user_email.toLowerCase().includes(q));
    }

    // Tri
    if (sort === "newest") {
      filtered.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    } else if (sort === "oldest") {
      filtered.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
    }

    setFilteredProfiles(filtered);
    setCurrentPage(0);
  };

  useEffect(() => {
    loadPendingProfiles();
    const unsubscribe = base44.entities.UserProfile.subscribe((event) => {
      if (event.data?.status === "en_attente" && !event.data?.deleted) {
        loadPendingProfiles();
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    applyFilters(pendingProfiles, searchQuery, filterProfileType, sortOrder);
  }, [searchQuery, filterProfileType, sortOrder, pendingProfiles]);

  const handleApprove = async (profile) => {
    setActionLoading(true);
    try {
      await base44.entities.UserProfile.update(profile.id, { status: "actif" });
      console.log(`[PendingProfileRequests] Profil ${profile.profile_type} approuvé pour ${profile.user_email}`);
      
      await base44.entities.Notification.create({
        destinataire_email: profile.user_email,
        destinataire_role: profile.profile_type,
        titre: "✅ Profil validé",
        message: `Votre demande de profil ${PROFILE_TYPES[profile.profile_type]?.label} a été approuvée!`,
        type: "success",
      });

      // Animation de disparition
      setRemoving(prev => new Set(prev).add(profile.id));
      setTimeout(() => {
        setPendingProfiles(prev => prev.filter(p => p.id !== profile.id));
        setRemoving(prev => {
          const next = new Set(prev);
          next.delete(profile.id);
          return next;
        });
      }, 600);

      toast.success(`✅ ${profile.user_email} validé`);
      setActionDialog(null);
      setSelectedProfile(null);
    } catch (err) {
      console.error("[PendingProfileRequests] Erreur approbation:", err);
      toast.error("Erreur lors de l'approbation");
    }
    setActionLoading(false);
  };

  const handleReject = async (profile) => {
    if (!refusalReason.trim()) {
      toast.error("Veuillez indiquer un motif de refus");
      return;
    }
    setActionLoading(true);
    try {
      await base44.entities.UserProfile.update(profile.id, {
        status: "refuse",
        refusal_reason: refusalReason,
      });
      console.log(`[PendingProfileRequests] Profil ${profile.profile_type} refusé pour ${profile.user_email}`);

      await base44.entities.Notification.create({
        destinataire_email: profile.user_email,
        destinataire_role: profile.profile_type,
        titre: "❌ Profil refusé",
        message: `Votre demande de profil a été refusée. Motif: ${refusalReason}`,
        type: "danger",
      });

      setRemoving(prev => new Set(prev).add(profile.id));
      setTimeout(() => {
        setPendingProfiles(prev => prev.filter(p => p.id !== profile.id));
        setRemoving(prev => {
          const next = new Set(prev);
          next.delete(profile.id);
          return next;
        });
      }, 600);

      toast.success(`❌ ${profile.user_email} refusé`);
      setActionDialog(null);
      setSelectedProfile(null);
      setRefusalReason("");
    } catch (err) {
      console.error("[PendingProfileRequests] Erreur refus:", err);
      toast.error("Erreur lors du refus");
    }
    setActionLoading(false);
  };

  const handleValidateAll = async () => {
    if (filteredProfiles.length === 0) {
      toast.error("Aucun profil à valider");
      return;
    }
    const confirmed = window.confirm(`Valider ${filteredProfiles.length} profil(s) ?`);
    if (!confirmed) return;

    setValidatingAll(true);
    let validated = 0;
    for (const profile of filteredProfiles) {
      try {
        await base44.entities.UserProfile.update(profile.id, { status: "actif" });
        await base44.entities.Notification.create({
          destinataire_email: profile.user_email,
          destinataire_role: profile.profile_type,
          titre: "✅ Profil validé",
          message: `Votre demande de profil ${PROFILE_TYPES[profile.profile_type]?.label} a été approuvée!`,
          type: "success",
        });
        validated++;
        setRemoving(prev => new Set(prev).add(profile.id));
      } catch (err) {
        console.error("Erreur validation:", err);
      }
    }
    setTimeout(() => {
      setPendingProfiles(prev => prev.filter(p => !filteredProfiles.find(f => f.id === p.id)));
      setRemoving(new Set());
    }, 600);
    toast.success(`✅ ${validated} profil(s) validé(s)`);
    setValidatingAll(false);
  };

  const handleDelete = async (profile) => {
    const confirmed = window.confirm(`Êtes-vous sûr de vouloir supprimer la demande de ${profile.user_email} ?\n\nCette action est définitive.`);
    if (!confirmed) return;

    setDeletingId(profile.id);
    try {
      // Soft-delete le profil
      await base44.entities.UserProfile.update(profile.id, { deleted: true, deleted_at: new Date().toISOString() });
      console.log(`[PendingProfileRequests] Demande supprimée: ${profile.user_email} | ${profile.profile_type}`);

      // Animation de disparition
      setRemoving(prev => new Set(prev).add(profile.id));
      setTimeout(() => {
        setPendingProfiles(prev => prev.filter(p => p.id !== profile.id));
        setRemoving(prev => {
          const next = new Set(prev);
          next.delete(profile.id);
          return next;
        });
      }, 600);

      toast.success(`Demande de ${profile.user_email} supprimée`);
    } catch (err) {
      console.error("[PendingProfileRequests] Erreur suppression:", err);
      toast.error("Erreur lors de la suppression");
    }
    setDeletingId(null);
  };

  const handleRejectAll = async () => {
    if (filteredProfiles.length === 0) {
      toast.error("Aucun profil à refuser");
      return;
    }
    const reason = prompt(`Motif de refus pour ${filteredProfiles.length} profil(s):`);
    if (!reason) return;

    setRejectingAll(true);
    let rejected = 0;
    for (const profile of filteredProfiles) {
      try {
        await base44.entities.UserProfile.update(profile.id, {
          status: "refuse",
          refusal_reason: reason,
        });
        await base44.entities.Notification.create({
          destinataire_email: profile.user_email,
          destinataire_role: profile.profile_type,
          titre: "❌ Profil refusé",
          message: `Votre demande de profil a été refusée. Motif: ${reason}`,
          type: "danger",
        });
        rejected++;
        setRemoving(prev => new Set(prev).add(profile.id));
      } catch (err) {
        console.error("Erreur refus:", err);
      }
    }
    setTimeout(() => {
      setPendingProfiles(prev => prev.filter(p => !filteredProfiles.find(f => f.id === p.id)));
      setRemoving(new Set());
    }, 600);
    toast.success(`❌ ${rejected} profil(s) refusé(s)`);
    setRejectingAll(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // Pagination
  const totalPages = Math.ceil(filteredProfiles.length / ITEMS_PER_PAGE);
  const paginatedProfiles = filteredProfiles.slice(
    currentPage * ITEMS_PER_PAGE,
    (currentPage + 1) * ITEMS_PER_PAGE
  );

  return (
    <div className="space-y-4 pb-10">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Demandes de profils en attente</h1>
          <p className="text-xs text-muted-foreground">
            {filteredProfiles.length}/{pendingProfiles.length} demande{pendingProfiles.length > 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Recherche et filtres */}
      <div className="px-4 space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par email..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            variant={showFilters ? "default" : "outline"}
            size="icon"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4" />
          </Button>
        </div>

        {/* Filtres avancés */}
        {showFilters && (
          <div className="p-3 rounded-lg bg-muted/50 space-y-3">
            <div className="space-y-2">
              <label className="text-xs font-semibold">Type de profil</label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setFilterProfileType("all")}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                    filterProfileType === "all"
                      ? "border-primary bg-primary text-white"
                      : "border-border hover:border-primary"
                  }`}
                >
                  Tous
                </button>
                {Object.entries(PROFILE_TYPES).map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => setFilterProfileType(key)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                      filterProfileType === key
                        ? "border-primary bg-primary text-white"
                        : "border-border hover:border-primary"
                    }`}
                  >
                    {cfg.emoji} {cfg.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold">Tri</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setSortOrder("newest")}
                  className={`flex-1 text-xs px-3 py-1.5 rounded-lg border transition-all ${
                    sortOrder === "newest"
                      ? "border-primary bg-primary text-white"
                      : "border-border hover:border-primary"
                  }`}
                >
                  Plus récent
                </button>
                <button
                  onClick={() => setSortOrder("oldest")}
                  className={`flex-1 text-xs px-3 py-1.5 rounded-lg border transition-all ${
                    sortOrder === "oldest"
                      ? "border-primary bg-primary text-white"
                      : "border-border hover:border-primary"
                  }`}
                >
                  Plus ancien
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Actions rapides */}
      {filteredProfiles.length > 0 && (
        <div className="px-4 flex gap-2">
          <Button
            size="sm"
            className="flex-1 text-xs h-9"
            onClick={handleValidateAll}
            disabled={validatingAll}
          >
            {validatingAll ? "Validation..." : `✅ Valider tous (${filteredProfiles.length})`}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 text-xs h-9 text-red-600 border-red-300 hover:bg-red-50"
            onClick={handleRejectAll}
            disabled={rejectingAll}
          >
            {rejectingAll ? "Refus..." : `❌ Refuser tous (${filteredProfiles.length})`}
          </Button>
        </div>
      )}

      {/* Liste */}
      {filteredProfiles.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <p className="text-lg font-semibold">✅ Aucune demande en attente</p>
          <p className="text-sm text-muted-foreground">Tous les profils ont été traités</p>
        </div>
      ) : (
        <div className="space-y-3 px-4">
          {paginatedProfiles.map(profile => (
            <Card
              key={profile.id}
              className={`border-l-4 border-l-amber-500 transition-all ${
                removing.has(profile.id) ? "opacity-0 scale-95" : "opacity-100 scale-100"
              }`}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="text-2xl flex-shrink-0">
                    {PROFILE_TYPES[profile.profile_type]?.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{PROFILE_TYPES[profile.profile_type]?.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{profile.user_email}</p>
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>
                        {moment(profile.created_date).format("DD/MM/YYYY HH:mm")} (
                        {moment().diff(moment(profile.created_date), "hours")}h)
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-800 flex-shrink-0">
                    ⏳
                  </span>
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 text-xs h-9"
                    onClick={() => {
                      setSelectedProfile(profile);
                      setActionDialog("approve");
                    }}
                  >
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Valider
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 text-xs h-9 text-red-600 border-red-300 hover:bg-red-50"
                    onClick={() => {
                      setSelectedProfile(profile);
                      setActionDialog("reject");
                      setRefusalReason("");
                    }}
                  >
                    <XCircle className="h-3 w-3 mr-1" />
                    Refuser
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs h-9 text-muted-foreground hover:text-red-600 hover:bg-red-50"
                    onClick={() => handleDelete(profile)}
                    disabled={deletingId === profile.id}
                  >
                    {deletingId === profile.id ? (
                      <span className="w-3 h-3 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 px-4">
          <Button
            size="sm"
            variant="outline"
            disabled={currentPage === 0}
            onClick={() => setCurrentPage(currentPage - 1)}
          >
            ← Précédent
          </Button>
          <div className="flex items-center gap-2">
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                onClick={() => setCurrentPage(i)}
                className={`h-8 w-8 rounded text-xs font-semibold transition-all ${
                  currentPage === i
                    ? "bg-primary text-white"
                    : "bg-muted hover:bg-muted/70"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={currentPage === totalPages - 1}
            onClick={() => setCurrentPage(currentPage + 1)}
          >
            Suivant →
          </Button>
        </div>
      )}

      {/* Dialog Valider */}
      <Dialog open={actionDialog === "approve"} onOpenChange={() => actionDialog === "approve" && setActionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Valider cette demande ?</DialogTitle>
          </DialogHeader>
          {selectedProfile && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                <p className="text-sm font-semibold text-blue-900">
                  {PROFILE_TYPES[selectedProfile.profile_type]?.emoji} {PROFILE_TYPES[selectedProfile.profile_type]?.label}
                </p>
                <p className="text-xs text-blue-700 mt-1">{selectedProfile.user_email}</p>
              </div>
              <p className="text-sm text-muted-foreground">
                ✅ Le profil sera activé et l'utilisateur sera notifié.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setActionDialog(null)}>
                  Annuler
                </Button>
                <Button
                  className="flex-1"
                  disabled={actionLoading}
                  onClick={() => handleApprove(selectedProfile)}
                >
                  {actionLoading ? "Validation..." : "Valider"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog Refuser */}
      <Dialog open={actionDialog === "reject"} onOpenChange={() => actionDialog === "reject" && setActionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refuser cette demande</DialogTitle>
          </DialogHeader>
          {selectedProfile && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-sm font-semibold text-red-900">
                  {PROFILE_TYPES[selectedProfile.profile_type]?.emoji} {PROFILE_TYPES[selectedProfile.profile_type]?.label}
                </p>
                <p className="text-xs text-red-700 mt-1">{selectedProfile.user_email}</p>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold">Motif du refus *</label>
                <textarea
                  placeholder="Ex: Documents incomplets, informations invalides..."
                  value={refusalReason}
                  onChange={e => setRefusalReason(e.target.value)}
                  rows={3}
                  className="w-full p-2 rounded-lg border text-sm focus:ring-1 focus:ring-primary outline-none"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setActionDialog(null)}>
                  Annuler
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  disabled={actionLoading || !refusalReason.trim()}
                  onClick={() => handleReject(selectedProfile)}
                >
                  {actionLoading ? "Refus..." : "Refuser"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}