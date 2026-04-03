import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import {
  ArrowLeft, Phone, MessageCircle, Mail, User, CheckCircle2, XCircle,
  Lock, Unlock, Trash2, Plus, FileText, History, Shield, Star, MapPin
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ChatLivreur from "@/components/ChatLivreur";
import DocumentViewer from "@/components/DocumentViewer";
import { toast } from "sonner";
import moment from "moment";

const PROFILES = [
  { key: "client", label: "Client", emoji: "👤", color: "bg-blue-100 text-blue-700" },
  { key: "livreur", label: "Livreur", emoji: "🛵", color: "bg-green-100 text-green-700" },
  { key: "partenaire", label: "Partenaire", emoji: "🏪", color: "bg-purple-100 text-purple-700" },
  { key: "commercial", label: "Commercial", emoji: "💼", color: "bg-amber-100 text-amber-700" },
  { key: "admin", label: "Administrateur", emoji: "🔐", color: "bg-red-100 text-red-700" },
];

const MOTIFS_BLOCAGE = ["Commission impayée", "Suspension administrative", "Documents non conformes", "Comportement inapproprié", "Autre"];

function generateCode(name) {
  return (name || "CDL").replace(/\s+/g, "").toUpperCase().slice(0, 4) + Math.floor(100 + Math.random() * 900);
}

function StatutBadge({ status }) {
  const cfg = {
    en_attente: "bg-amber-100 text-amber-700",
    actif: "bg-green-100 text-green-700",
    refuse: "bg-red-100 text-red-700",
    suspendu: "bg-orange-100 text-orange-700",
    incomplet: "bg-gray-100 text-gray-700",
    bloque: "bg-red-200 text-red-800",
  };
  const labels = { en_attente: "En attente", actif: "Actif", refuse: "Refusé", suspendu: "Suspendu", incomplet: "Incomplet", bloque: "Bloqué" };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg[status] || "bg-muted text-muted-foreground"}`}>
      {labels[status] || status}
    </span>
  );
}

export default function AdminProfilUnifie() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [courses, setCourses] = useState([]);
  const [logs, setLogs] = useState([]);
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [motifRefus, setMotifRefus] = useState("");
  const [motifBlocage, setMotifBlocage] = useState("");
  const [assignDialog, setAssignDialog] = useState(false);
  const [assignProfile, setAssignProfile] = useState(null);
  const [blocageDialog, setBlocageDialog] = useState(false);
  const [refusingProfileId, setRefusingProfileId] = useState(null);
  const [refusingMotif, setRefusingMotif] = useState("");

  const loadAll = async () => {
    const [me, allUsers] = await Promise.all([
      base44.auth.me(),
      base44.entities.User.list("-created_date", 500),
    ]);
    setAdmin(me);
    const found = allUsers.find(u => u.id === userId);
    if (!found) { toast.error("Utilisateur introuvable"); return; }
    setUser(found);

    const [profs, hist, coursesData] = await Promise.all([
      base44.entities.UserProfile.filter({ user_email: found.email }),
      base44.entities.AdminActionLog.filter({ target_email: found.email }, "-created_date", 30),
      base44.entities.Course.filter({ livreur_email: found.email }, "-created_date", 50),
    ]);
    setProfiles(profs || []);
    setLogs(hist || []);
    setCourses(coursesData || []);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, [userId]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const validerLivreur = async () => {
    if (!user.telephone) { toast.error("Téléphone manquant, validation impossible"); return; }
    setProcessing(true);
    await base44.entities.User.update(user.id, {
      statut_validation_livreur: "valide", profil_valide: true, actif: true,
      date_validation: new Date().toISOString(),
    });
    await base44.entities.Notification.create({
      destinataire_email: user.email, destinataire_role: "livreur",
      titre: "✅ Profil livreur validé !",
      message: `Félicitations ${user.full_name} ! Votre profil a été validé par l'administration CDL. Vous pouvez maintenant recevoir des courses. 🛵`,
      type: "success", lue: false,
    });
    toast.success("Livreur validé !");
    await loadAll();
    setProcessing(false);
  };

  const refuserLivreur = async () => {
    setProcessing(true);
    const motif = motifRefus || "Documents insuffisants ou illisibles";
    await base44.entities.User.update(user.id, {
      statut_validation_livreur: "refuse", profil_valide: false, motif_refus: motif,
    });
    await base44.entities.Notification.create({
      destinataire_email: user.email, destinataire_role: "livreur",
      titre: "❌ Dossier refusé",
      message: `Votre dossier a été refusé. Motif : ${motif}. Contactez-nous pour corriger votre dossier.`,
      type: "danger", lue: false,
    });
    toast.success("Livreur refusé");
    setMotifRefus("");
    await loadAll();
    setProcessing(false);
  };

  const validerProfil = async (profile) => {
    setProcessing(true);
    const res = await base44.functions.invoke('validateLivreurProfile', { profile_id: profile.id, action: 'approve' });
    if (res.data?.success) toast.success(`Profil ${profile.profile_type} validé`);
    await loadAll();
    setProcessing(false);
  };

  const refuserProfil = async (profile, motif) => {
    setProcessing(true);
    const reason = motif || "Documents insuffisants ou illisibles";
    await base44.entities.UserProfile.update(profile.id, {
      status: "refuse",
      refusal_reason: reason,
    });
    await base44.entities.Notification.create({
      destinataire_email: user.email,
      destinataire_role: profile.profile_type,
      titre: `❌ Profil ${PROFILES.find(p => p.key === profile.profile_type)?.label || profile.profile_type} refusé`,
      message: `Votre profil a été refusé. Motif : ${reason}. Corrigez vos documents et resoumettez votre dossier.`,
      type: "danger",
      lue: false,
    });
    await base44.entities.AdminActionLog.create({
      admin_email: admin.email,
      object_type: "commercial",
      object_id: user.id,
      object_name: user.full_name,
      action: "refuse",
      reason,
      target_email: user.email,
    });
    toast.success(`Profil ${profile.profile_type} refusé`);
    setRefusingProfileId(null);
    setRefusingMotif("");
    await loadAll();
    setProcessing(false);
  };

  const toggleProfil = async (profile) => {
    const newStatus = profile.status === "actif" ? "suspendu" : "actif";
    await base44.entities.UserProfile.update(profile.id, { status: newStatus });
    await base44.entities.AdminActionLog.create({
      admin_email: admin.email, object_type: "commercial", object_id: user.id,
      object_name: user.full_name, action: newStatus === "actif" ? "unsuspend" : "suspend",
      reason: `${newStatus === "actif" ? "Activation" : "Suspension"} profil: ${profile.profile_type}`,
      target_email: user.email,
    });
    toast.success(`Profil ${newStatus === "actif" ? "activé" : "suspendu"}`);
    await loadAll();
  };

  const bloquer = async () => {
    if (!motifBlocage) { toast.error("Veuillez choisir un motif"); return; }
    setProcessing(true);
    await base44.entities.User.update(user.id, {
      livreur_bloque: true, disponible: false, statut_financier_livreur: "Bloqué", motif_blocage: motifBlocage,
    });
    toast.success("Livreur bloqué");
    setBlocageDialog(false);
    setMotifBlocage("");
    await loadAll();
    setProcessing(false);
  };

  const debloquer = async () => {
    await base44.entities.User.update(user.id, {
      livreur_bloque: false, motif_blocage: "",
      statut_financier_livreur: (user.solde_commission_du || 0) > 0 ? "Doit une commission" : "À jour",
    });
    toast.success("Livreur débloqué");
    await loadAll();
  };

  const attribuerProfil = async () => {
    if (!assignProfile) return;
    setProcessing(true);
    const existing = profiles.find(p => p.profile_type === assignProfile);
    if (existing) { toast.error("Ce profil existe déjà"); setProcessing(false); return; }
    await base44.entities.UserProfile.create({
      user_email: user.email, profile_type: assignProfile, status: "actif",
      is_active_profile: profiles.length === 0,
      validated_at: new Date().toISOString(), validated_by: admin.email,
    });
    if (assignProfile === "commercial") {
      const existingCode = await base44.entities.CodePromo.filter({ commercial_email: user.email });
      if (existingCode.length === 0) {
        await base44.entities.CodePromo.create({
          commercial_email: user.email, commercial_name: user.full_name,
          code: generateCode(user.full_name), statut: "valide", actif: true,
          nombre_utilisations: 0, commission_due: 0, commission_payee: 0,
        });
      }
    }
    if (assignProfile === "admin") await base44.entities.User.update(user.id, { role: "admin" });
    await base44.entities.Notification.create({
      destinataire_email: user.email, destinataire_role: assignProfile,
      titre: `✅ Profil ${PROFILES.find(p => p.key === assignProfile)?.label} attribué`,
      message: `L'administrateur vous a attribué le profil ${PROFILES.find(p => p.key === assignProfile)?.label}.`,
      type: "success", lue: false,
    });
    await base44.entities.AdminActionLog.create({
      admin_email: admin.email, object_type: "commercial", object_id: user.id,
      object_name: user.full_name, action: "validate",
      reason: `Attribution profil: ${assignProfile}`, target_email: user.email,
    });
    toast.success(`Profil ${assignProfile} attribué !`);
    setAssignDialog(false);
    setAssignProfile(null);
    await loadAll();
    setProcessing(false);
  };

  const supprimerCompte = async () => {
    if (!window.confirm(`Supprimer totalement le compte de ${user.full_name} ? Cette action est irréversible.`)) return;
    const res = await base44.functions.invoke('deleteUserComplete', { user_id: user.id, user_email: user.email });
    if (res.data?.success) { toast.success("Compte supprimé"); navigate(-1); }
    else toast.error(res.data?.error || "Erreur suppression");
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <div className="text-center py-20 text-muted-foreground">Utilisateur introuvable</div>;

  const statutValidation = user.statut_validation_livreur || "en_attente";
  const isLivreur = user.user_type === "livreur" || profiles.some(p => p.profile_type === "livreur");
  const livreurDelivered = courses.filter(c => c.statut === "livree").length;
  const livreurGains = courses.filter(c => c.statut === "livree").reduce((s, c) => s + (c.gain_livreur || 0), 0);

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold truncate">{user.full_name}</h1>
          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
        </div>
        {user.disponible !== undefined && (
          <span className={`text-[10px] px-2 py-1 rounded-full font-medium flex-shrink-0 ${user.disponible ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
            {user.disponible ? "🟢 En ligne" : "⚪ Hors ligne"}
          </span>
        )}
      </div>

      {/* Photo + infos rapides */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            {user.photo_profil ? (
              <img src={user.photo_profil} alt="" className="h-16 w-16 rounded-full object-cover border-2 border-primary flex-shrink-0" />
            ) : (
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary flex-shrink-0">
                {user.full_name?.charAt(0) || "?"}
              </div>
            )}
            <div className="flex-1 min-w-0 space-y-1">
              <p className="font-bold text-base">{user.full_name}</p>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Phone className="h-3 w-3" />
                <span className="font-medium text-foreground">{user.telephone || "Non renseigné"}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Mail className="h-3 w-3" />
                <span className="truncate">{user.email}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" />
                <span>{user.quartier || "—"}</span>
              </div>
              <p className="text-xs text-muted-foreground">ID : {user.id?.slice(0, 16)}…</p>
              <p className="text-xs text-muted-foreground">Inscrit le {moment(user.created_date).format("DD/MM/YYYY")}</p>
            </div>
          </div>

          {/* Badges statut */}
          <div className="flex flex-wrap gap-2 mt-3">
            {user.role === "admin" && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">🔐 Admin</span>}
            {isLivreur && <StatutBadge status={statutValidation} />}
            {user.livreur_bloque && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-200 text-red-800 font-bold">🔒 Bloqué</span>}
            {profiles.map(p => {
              const badge = PROFILES.find(b => b.key === p.profile_type);
              return <span key={p.id} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${badge?.color}`}>{badge?.emoji} {badge?.label}</span>;
            })}
          </div>

          {/* Boutons contact rapide */}
          <div className="flex gap-2 mt-3">
            {user.telephone && (
              <a href={`tel:${user.telephone}`} className="flex-1">
                <button className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary text-white text-xs font-semibold">
                  <Phone className="h-3.5 w-3.5" /> Appeler
                </button>
              </a>
            )}
            {user.telephone && (
              <a href={`https://wa.me/${user.telephone?.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer" className="flex-1">
                <button className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-green-600 text-white text-xs font-semibold">
                  <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                </button>
              </a>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Onglets */}
      <Tabs defaultValue="profils">
        <TabsList className="w-full grid grid-cols-5 text-[10px]">
          <TabsTrigger value="profils">Profils</TabsTrigger>
          <TabsTrigger value="docs">Docs</TabsTrigger>
          <TabsTrigger value="courses">Courses</TabsTrigger>
          <TabsTrigger value="messages">Msgs</TabsTrigger>
          <TabsTrigger value="historique">Logs</TabsTrigger>
        </TabsList>

        {/* ── PROFILS ── */}
        <TabsContent value="profils" className="mt-4 space-y-3">
          {/* Validation livreur rapide */}
          {isLivreur && (
            <Card className="border-primary/30">
              <CardContent className="p-4 space-y-3">
                <p className="text-sm font-semibold flex items-center gap-2">🛵 Validation livreur</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Statut actuel :</span>
                  <StatutBadge status={statutValidation} />
                </div>
                {user.motif_refus && (
                  <div className="p-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">Motif refus : {user.motif_refus}</div>
                )}
                {user.motif_blocage && (
                  <div className="p-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">Motif blocage : {user.motif_blocage}</div>
                )}
                {(statutValidation === "en_attente" || statutValidation === "refuse") && (
                  <>
                    <input
                      className="w-full border rounded-md px-3 py-1.5 text-sm"
                      placeholder="Motif de refus (optionnel)..."
                      value={motifRefus}
                      onChange={e => setMotifRefus(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1 border-red-300 text-red-600" onClick={refuserLivreur} disabled={processing}>
                        <XCircle className="h-4 w-4 mr-1" /> Refuser
                      </Button>
                      <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={validerLivreur} disabled={processing}>
                        <CheckCircle2 className="h-4 w-4 mr-1" /> Valider
                      </Button>
                    </div>
                  </>
                )}
                {statutValidation === "valide" && (
                  <Button variant="outline" className="w-full border-red-300 text-red-600" onClick={refuserLivreur} disabled={processing}>
                    Révoquer la validation
                  </Button>
                )}
                <div className="flex gap-2">
                  {user.livreur_bloque ? (
                    <Button variant="outline" className="flex-1 text-green-600 border-green-300" onClick={debloquer}>
                      <Unlock className="h-4 w-4 mr-1" /> Débloquer
                    </Button>
                  ) : (
                    <Button variant="outline" className="flex-1 text-red-600 border-red-300" onClick={() => setBlocageDialog(true)}>
                      <Lock className="h-4 w-4 mr-1" /> Bloquer
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Profils UserProfile */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Profils associés ({profiles.length})</p>
              {admin?.role === "admin" && (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAssignDialog(true)}>
                  <Plus className="h-3 w-3 mr-1" /> Attribuer
                </Button>
              )}
            </div>
            {profiles.length === 0 && <p className="text-xs text-muted-foreground italic text-center py-4">Aucun profil attribué</p>}
            {profiles.map(profile => {
              const badge = PROFILES.find(p => p.key === profile.profile_type);
              return (
                <Card key={profile.id}>
                  <CardContent className="p-3 flex items-center gap-3">
                    <span className="text-xl">{badge?.emoji}</span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold">{badge?.label || profile.profile_type}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {profile.validated_at && `Validé ${moment(profile.validated_at).format("DD/MM/YY")} · `}
                        Créé {moment(profile.created_date).format("DD/MM/YY")}
                      </p>
                    </div>
                    <StatutBadge status={profile.status} />
                    <div className="flex gap-1">
                      {(profile.status === "en_attente" || profile.status === "incomplet") && (
                        <>
                          <Button size="sm" variant="outline" className="h-7 text-xs px-1.5 border-green-300 text-green-600" onClick={() => validerProfil(profile)} disabled={processing}>✓</Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs px-1.5 border-red-300 text-red-600" onClick={() => setRefusingProfileId(profile.id)} disabled={processing}>✕</Button>
                        </>
                      )}
                      {profile.status === "refuse" && (
                        <Button size="sm" variant="outline" className="h-7 text-xs px-1.5 border-green-300 text-green-600" onClick={() => validerProfil(profile)} disabled={processing}>✓ Valider quand même</Button>
                      )}
                    </div>
                  </CardContent>
                  {/* Motif refus inline */}
                  {refusingProfileId === profile.id && (
                    <div className="px-3 pb-3 space-y-2">
                      <input
                        autoFocus
                        className="w-full border rounded-md px-3 py-1.5 text-sm"
                        placeholder="Motif du refus (obligatoire)..."
                        value={refusingMotif}
                        onChange={e => setRefusingMotif(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => { setRefusingProfileId(null); setRefusingMotif(""); }}>Annuler</Button>
                        <Button size="sm" variant="destructive" className="flex-1" onClick={() => refuserProfil(profile, refusingMotif)} disabled={!refusingMotif.trim() || processing}>Confirmer le refus</Button>
                      </div>
                    </div>
                  )}
                  {/* Motif affiché si refusé */}
                  {profile.status === "refuse" && profile.refusal_reason && (
                    <div className="px-3 pb-3">
                      <div className="p-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">Motif : {profile.refusal_reason}</div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {/* Stats livreur */}
          {isLivreur && (
            <div className="grid grid-cols-2 gap-2">
              <Card className="text-center"><CardContent className="p-3">
                <p className="text-xl font-bold text-green-600">{livreurDelivered}</p>
                <p className="text-[10px] text-muted-foreground">Courses livrées</p>
              </CardContent></Card>
              <Card className="text-center"><CardContent className="p-3">
                <p className="text-sm font-bold text-primary">{livreurGains.toLocaleString()} F</p>
                <p className="text-[10px] text-muted-foreground">Gains totaux</p>
              </CardContent></Card>
            </div>
          )}

          {/* Danger zone */}
          {admin?.role === "admin" && (
            <div className="pt-2 border-t">
              <Button variant="outline" className="w-full border-red-400 text-red-700 hover:bg-red-50" onClick={supprimerCompte}>
                <Trash2 className="h-4 w-4 mr-2" /> Supprimer totalement le compte
              </Button>
            </div>
          )}
        </TabsContent>

        {/* ── DOCUMENTS ── */}
        <TabsContent value="docs" className="mt-4 space-y-3">
          {/* Documents directs sur User (livreur legacy) */}
          <div className="space-y-2">
            <p className="text-sm font-semibold">Documents</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "CNIB Recto", url: user.photo_identite_recto },
                { label: "CNIB Verso", url: user.photo_identite_verso },
                { label: "Photo véhicule", url: user.photo_moto || user.photo_moyen_deplacement },
                { label: "Photo profil", url: user.photo_profil },
              ].map(doc => (
                <div key={doc.label} className="border rounded-lg overflow-hidden">
                  {doc.url ? (
                    <a href={doc.url} target="_blank" rel="noreferrer">
                      <img src={doc.url} alt={doc.label} className="w-full h-24 object-cover hover:opacity-80 transition-opacity" />
                    </a>
                  ) : (
                    <div className="h-24 bg-muted flex items-center justify-center">
                      <p className="text-xs text-muted-foreground">Non fourni</p>
                    </div>
                  )}
                  <p className="text-[10px] text-center py-1 text-muted-foreground">{doc.label}</p>
                </div>
              ))}
            </div>
          </div>
          {/* Documents via UserProfile */}
          {profiles.filter(p => p.documents_json).map(profile => (
            <div key={profile.id}>
              <p className="text-xs font-semibold mb-2">{PROFILES.find(b => b.key === profile.profile_type)?.emoji} Documents {profile.profile_type}</p>
              <DocumentViewer profileData={profile.documents_json} profileType={profile.profile_type} />
            </div>
          ))}
        </TabsContent>

        {/* ── COURSES ── */}
        <TabsContent value="courses" className="mt-4">
          {courses.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">Aucune course</p>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {courses.map(c => {
                const statutColors = { livree: "bg-green-100 text-green-700", en_cours: "bg-blue-100 text-blue-700", acceptee: "bg-amber-100 text-amber-700", annulee: "bg-red-100 text-red-700" };
                return (
                  <div key={c.id} className="border rounded-lg p-3 text-sm space-y-1">
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statutColors[c.statut] || "bg-muted text-muted-foreground"}`}>{c.statut}</span>
                      <span className="text-xs text-muted-foreground">{moment(c.created_date).format("DD/MM/YY HH:mm")}</span>
                    </div>
                    <p className="font-medium">{c.quartier_depart} → {c.quartier_arrivee}</p>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{c.type_colis}</span>
                      <span className="font-semibold text-primary">{(c.prix || 0).toLocaleString()} F</span>
                    </div>
                    {c.gain_livreur && <p className="text-xs text-green-600">Gain : {c.gain_livreur.toLocaleString()} F</p>}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── MESSAGES ── */}
        <TabsContent value="messages" className="mt-4">
          <ChatLivreur livreurEmail={user.email} currentUser={admin} />
        </TabsContent>

        {/* ── HISTORIQUE ── */}
        <TabsContent value="historique" className="mt-4">
          {logs.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">Aucune action enregistrée</p>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {logs.map(log => (
                <div key={log.id} className="text-xs p-3 rounded-lg bg-muted/40 border">
                  <div className="flex justify-between mb-0.5">
                    <span className="font-semibold">{log.action} — {log.reason}</span>
                    <span className="text-muted-foreground">{moment(log.created_date).format("DD/MM/YY HH:mm")}</span>
                  </div>
                  <p className="text-muted-foreground">Par : {log.admin_email}</p>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog blocage */}
      <Dialog open={blocageDialog} onOpenChange={setBlocageDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Bloquer le livreur</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Bloquer <strong>{user.full_name}</strong> l'empêchera de recevoir des courses.</p>
            <Select value={motifBlocage} onValueChange={setMotifBlocage}>
              <SelectTrigger><SelectValue placeholder="Choisir un motif..." /></SelectTrigger>
              <SelectContent>{MOTIFS_BLOCAGE.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setBlocageDialog(false)}>Annuler</Button>
              <Button variant="destructive" className="flex-1" onClick={bloquer} disabled={processing}>Confirmer</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog attribution profil */}
      <Dialog open={assignDialog} onOpenChange={setAssignDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Attribuer un profil</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Profil à attribuer à <strong>{user.full_name}</strong></p>
            <div className="grid grid-cols-2 gap-2">
              {PROFILES.map(p => {
                const hasProfile = profiles.some(up => up.profile_type === p.key);
                return (
                  <button key={p.key} onClick={() => !hasProfile && setAssignProfile(p.key)} disabled={hasProfile}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${assignProfile === p.key ? "border-primary bg-primary/10" : hasProfile ? "border-border bg-muted opacity-50 cursor-not-allowed" : "border-border hover:border-primary/50"}`}>
                    <span className="text-xl">{p.emoji}</span>
                    <p className="text-xs font-semibold mt-1">{p.label}</p>
                    {hasProfile && <p className="text-[10px] text-green-600">Déjà attribué</p>}
                  </button>
                );
              })}
            </div>
            {assignProfile === "admin" && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                ⚠️ Attribuer le rôle Admin donne un accès complet à la plateforme.
              </div>
            )}
            <Button className="w-full" onClick={attribuerProfil} disabled={!assignProfile || processing}>
              {processing ? "Attribution..." : "Confirmer l'attribution"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}