import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, CheckCircle2, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import moment from "moment";

const PROFILE_TYPES = {
  livreur: { emoji: "🛵", label: "Livreur", color: "green" },
  partenaire: { emoji: "🏪", label: "Partenaire", color: "purple" },
  commercial: { emoji: "📣", label: "Commercial", color: "orange" },
  client: { emoji: "👤", label: "Client", color: "blue" },
};

export default function PendingProfileRequests() {
  const navigate = useNavigate();
  const [pendingProfiles, setPendingProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [actionDialog, setActionDialog] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [refusalReason, setRefusalReason] = useState("");

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
    } catch (err) {
      console.error("[PendingProfileRequests] Erreur chargement:", err);
      toast.error("Erreur lors du chargement des demandes");
    }
    setLoading(false);
  };

  useEffect(() => {
    loadPendingProfiles();
    // Subscribe aux changements
    const unsubscribe = base44.entities.UserProfile.subscribe((event) => {
      console.log(`[PendingProfileRequests] Event: ${event.type}`, event.data?.profile_type);
      if (event.data?.status === "en_attente" && !event.data?.deleted) {
        loadPendingProfiles();
      }
    });
    return unsubscribe;
  }, []);

  const handleApprove = async (profile) => {
    setActionLoading(true);
    try {
      // Mettre à jour le statut du profil
      await base44.entities.UserProfile.update(profile.id, { status: "actif" });
      console.log(`[PendingProfileRequests] Profil ${profile.profile_type} approuvé pour ${profile.user_email}`);
      
      // Notifier l'utilisateur
      await base44.entities.Notification.create({
        destinataire_email: profile.user_email,
        destinataire_role: profile.profile_type,
        titre: "✅ Profil validé",
        message: `Votre demande de profil ${PROFILE_TYPES[profile.profile_type]?.label} a été approuvée!`,
        type: "success",
      });

      toast.success(`Profil approuvé pour ${profile.user_email}`);
      setActionDialog(null);
      setSelectedProfile(null);
      loadPendingProfiles();
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
      // Mettre à jour le statut du profil
      await base44.entities.UserProfile.update(profile.id, {
        status: "refuse",
        refusal_reason: refusalReason,
      });
      console.log(`[PendingProfileRequests] Profil ${profile.profile_type} refusé pour ${profile.user_email}`);

      // Notifier l'utilisateur
      await base44.entities.Notification.create({
        destinataire_email: profile.user_email,
        destinataire_role: profile.profile_type,
        titre: "❌ Profil refusé",
        message: `Votre demande de profil a été refusée. Motif: ${refusalReason}`,
        type: "danger",
      });

      toast.success(`Profil refusé pour ${profile.user_email}`);
      setActionDialog(null);
      setSelectedProfile(null);
      setRefusalReason("");
      loadPendingProfiles();
    } catch (err) {
      console.error("[PendingProfileRequests] Erreur refus:", err);
      toast.error("Erreur lors du refus");
    }
    setActionLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const sortedProfiles = pendingProfiles.sort(
    (a, b) => new Date(b.created_date) - new Date(a.created_date)
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
            {pendingProfiles.length} demande{pendingProfiles.length > 1 ? "s" : ""} à valider
          </p>
        </div>
      </div>

      {/* Info compteur */}
      <div className="px-4 py-3 rounded-lg bg-primary/5 border border-primary/20 text-sm">
        <p>
          <strong>Total:</strong> {pendingProfiles.length} demande{pendingProfiles.length > 1 ? "s" : ""} en attente de validation
        </p>
      </div>

      {/* Liste */}
      {pendingProfiles.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <p className="text-lg font-semibold">✅ Aucune demande en attente</p>
          <p className="text-sm text-muted-foreground">Tous les profils ont été traités</p>
        </div>
      ) : (
        <div className="space-y-3 px-4">
          {sortedProfiles.map(profile => {
            const cfg = PROFILE_TYPES[profile.profile_type] || { emoji: "❓", label: profile.profile_type };
            return (
              <Card key={profile.id} className="border-l-4 border-l-amber-500">
                <CardContent className="p-4 space-y-3">
                  {/* En-tête */}
                  <div className="flex items-start gap-3">
                    <div className="text-2xl flex-shrink-0">{cfg.emoji}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{cfg.label}</p>
                      <p className="text-xs text-muted-foreground truncate">{profile.user_email}</p>
                      <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>
                          Envoyée {moment(profile.created_date).format("DD/MM/YYYY HH:mm")} (
                          {moment().diff(moment(profile.created_date), "hours")}h)
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-800 flex-shrink-0">
                      ⏳ En attente
                    </span>
                  </div>

                  {/* Actions */}
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
                  </div>
                </CardContent>
              </Card>
            );
          })}
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
                ✅ Le profil sera activé et l'utilisateur sera notifié par email.
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
                  {actionLoading ? "Validation..." : "Valider le profil"}
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