/**
 * ValidationLivreurs — PHASE 3
 * Vue admin : liste des livreurs avec statut, barre de progression, documents, valider/refuser
 */
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import {
  ArrowLeft, User, CheckCircle2, XCircle, ChevronDown, ChevronUp,
  Phone, MessageCircle, FileText, RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNavigate } from "react-router-dom";
import moment from "moment";
import { toast } from "sonner";

// ── Barre de progression dossier ──────────────────────────────────────────────
function ProgressionDossier({ user, profile }) {
  const hasDocs = profile?.documents_json && (() => {
    try {
      const d = JSON.parse(profile.documents_json);
      return d.photo_profil && d.photo_identite_recto && d.photo_identite_verso && d.photo_moyen_deplacement;
    } catch { return false; }
  })();
  const hasInfos = !!(user?.telephone && user?.quartier);
  const isValidated = profile?.status === 'actif';

  const pct = isValidated ? 100 : hasDocs ? 75 : hasInfos ? 50 : 25;

  const color = pct === 100
    ? "from-green-500 to-green-400"
    : pct === 75
    ? "from-blue-500 to-blue-400"
    : pct === 50
    ? "from-amber-500 to-amber-400"
    : "from-gray-400 to-gray-300";

  const LABELS = { 25: "Compte créé", 50: "Infos complètes", 75: "Docs envoyés", 100: "Validé ✅" };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-400">{LABELS[pct]}</span>
        <span className="text-xs font-extrabold text-primary">{pct}%</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between">
        {[25, 50, 75, 100].map(s => (
          <div key={s} className={`h-1.5 w-1.5 rounded-full ${pct >= s ? "bg-primary" : "bg-gray-200"}`} />
        ))}
      </div>
    </div>
  );
}

// ── Badge statut ──────────────────────────────────────────────────────────────
function StatutBadge({ statut }) {
  const cfg = {
    en_attente: { cls: "bg-amber-100 text-amber-700 border border-amber-200", label: "🟡 En attente" },
    actif:      { cls: "bg-green-100 text-green-700 border border-green-200",  label: "🟢 Validé" },
    valide:     { cls: "bg-green-100 text-green-700 border border-green-200",  label: "🟢 Validé" },
    refuse:     { cls: "bg-red-100 text-red-700 border border-red-200",        label: "🔴 Refusé" },
    suspendu:   { cls: "bg-orange-100 text-orange-700",                        label: "⏸️ Suspendu" },
  };
  const key = statut || "en_attente";
  const c = cfg[key] || cfg.en_attente;
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${c.cls}`}>{c.label}</span>;
}

// ── Miniature document ────────────────────────────────────────────────────────
function DocThumb({ url, label }) {
  if (!url) return (
    <div className="flex flex-col items-center gap-1">
      <div className="h-16 w-16 rounded-xl bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center">
        <FileText className="h-5 w-5 text-gray-300" />
      </div>
      <span className="text-[9px] text-gray-400 text-center leading-tight">{label}</span>
    </div>
  );
  return (
    <div className="flex flex-col items-center gap-1">
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt={label} className="h-16 w-16 rounded-xl object-cover border-2 border-primary/30 hover:border-primary transition-all" />
      </a>
      <span className="text-[9px] text-gray-500 text-center leading-tight">{label}</span>
    </div>
  );
}

// ── Carte livreur ─────────────────────────────────────────────────────────────
function LivreurCard({ livreur, profile, onValidate, onRefuse, processing }) {
  const [expanded, setExpanded] = useState(false);
  const [motif, setMotif] = useState("");
  const [showRefuseInput, setShowRefuseInput] = useState(false);

  const docs = (() => {
    try { return JSON.parse(profile?.documents_json || "{}"); }
    catch { return {}; }
  })();

  const statut = profile?.status || livreur.statut_validation_livreur || "en_attente";
  const motifRefus = profile?.refusal_reason || livreur.motif_refus;

  return (
    <Card className={`overflow-hidden ${statut === "en_attente" ? "border-amber-200" : statut === "actif" || statut === "valide" ? "border-green-200" : "border-red-200"}`}>
      <CardContent className="p-4 space-y-3">
        {/* Identité */}
        <div className="flex items-start gap-3">
          {livreur.photo_profil || docs.photo_profil ? (
            <img src={livreur.photo_profil || docs.photo_profil} alt="" className="h-12 w-12 rounded-full object-cover border-2 border-primary/20 flex-shrink-0" />
          ) : (
            <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
              <User className="h-6 w-6 text-gray-400" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-sm text-gray-900">{livreur.full_name}</p>
              <StatutBadge statut={statut} />
            </div>
            <p className="text-xs text-gray-500">{livreur.telephone || "—"} · {livreur.quartier || "—"}</p>
            <p className="text-[10px] text-gray-400">{livreur.email}</p>
            <p className="text-[10px] text-gray-400">Inscrit le {moment(livreur.created_date).format("DD/MM/YYYY")}</p>
          </div>
          <button onClick={() => setExpanded(!expanded)} className="p-1.5 rounded-lg bg-gray-100 active:scale-90">
            {expanded ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
          </button>
        </div>

        {/* Barre de progression */}
        <ProgressionDossier user={livreur} profile={profile} />

        {/* Motif refus */}
        {motifRefus && (
          <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            ❌ Motif refus : <span className="font-semibold">{motifRefus}</span>
          </div>
        )}

        {/* Panel étendu */}
        {expanded && (
          <div className="space-y-4 pt-2 border-t border-gray-100">
            {/* Documents */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Documents soumis</p>
              <div className="grid grid-cols-4 gap-2">
                <DocThumb url={docs.photo_profil} label="Selfie" />
                <DocThumb url={docs.photo_identite_recto} label="CNIB Recto" />
                <DocThumb url={docs.photo_identite_verso} label="CNIB Verso" />
                <DocThumb url={docs.photo_moyen_deplacement} label="Véhicule" />
              </div>
            </div>

            {/* Infos livreur */}
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Informations</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="px-3 py-2 rounded-lg bg-gray-50 border">
                  <p className="text-gray-400">Téléphone</p>
                  <p className="font-semibold text-gray-800">{livreur.telephone || "—"}</p>
                </div>
                <div className="px-3 py-2 rounded-lg bg-gray-50 border">
                  <p className="text-gray-400">Quartier</p>
                  <p className="font-semibold text-gray-800">{livreur.quartier || "—"}</p>
                </div>
                <div className="px-3 py-2 rounded-lg bg-gray-50 border">
                  <p className="text-gray-400">Véhicule</p>
                  <p className="font-semibold text-gray-800">{(() => {
                    try {
                      const d = JSON.parse(profile?.data_json || "{}");
                      const m = JSON.parse(d.moyen_deplacement || "[]");
                      return m.join(", ") || "—";
                    } catch { return "—"; }
                  })()}</p>
                </div>
                <div className="px-3 py-2 rounded-lg bg-gray-50 border">
                  <p className="text-gray-400">Docs complets</p>
                  <p className="font-semibold">
                    {docs.photo_profil && docs.photo_identite_recto && docs.photo_identite_verso && docs.photo_moyen_deplacement
                      ? <span className="text-green-600">✅ Oui</span>
                      : <span className="text-red-500">❌ Incomplet</span>}
                  </p>
                </div>
              </div>
            </div>

            {/* Contacts */}
            <div className="flex gap-2">
              {livreur.telephone && (
                <a href={`tel:${livreur.telephone}`} className="flex-1">
                  <button className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-primary/30 text-primary text-xs font-semibold">
                    <Phone className="h-3.5 w-3.5" /> Appeler
                  </button>
                </a>
              )}
              {livreur.telephone && (
                <a href={`https://wa.me/${livreur.telephone?.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer" className="flex-1">
                  <button className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-green-300 text-green-700 text-xs font-semibold">
                    <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                  </button>
                </a>
              )}
            </div>
          </div>
        )}

        {/* Boutons valider/refuser (seulement si en_attente ou refuse) */}
        {(statut === "en_attente" || statut === "refuse") && (
          <div className="space-y-2 pt-1">
            {showRefuseInput && (
              <input
                value={motif}
                onChange={e => setMotif(e.target.value)}
                placeholder="Motif du refus (ex: CNIB illisible, selfie flou...)"
                className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
              />
            )}
            <div className="flex gap-2">
              {!showRefuseInput ? (
                <button
                  onClick={() => setShowRefuseInput(true)}
                  className="flex-1 py-3 rounded-xl border-2 border-red-200 text-red-600 text-sm font-bold flex items-center justify-center gap-1.5 active:scale-95"
                >
                  <XCircle className="h-4 w-4" /> Refuser
                </button>
              ) : (
                <>
                  <button onClick={() => { setShowRefuseInput(false); setMotif(""); }}
                    className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-500 text-sm font-medium active:scale-95">
                    Annuler
                  </button>
                  <button
                    onClick={() => { onRefuse(livreur, profile, motif); setShowRefuseInput(false); setMotif(""); }}
                    disabled={processing}
                    className="flex-[2] py-3 rounded-xl bg-red-500 text-white text-sm font-bold active:scale-95 disabled:opacity-50"
                  >
                    Confirmer le refus
                  </button>
                </>
              )}
              {!showRefuseInput && (
                <button
                  onClick={() => onValidate(livreur, profile)}
                  disabled={processing}
                  className="flex-[2] py-3 rounded-xl bg-green-500 text-white text-sm font-extrabold flex items-center justify-center gap-1.5 active:scale-95 shadow-md shadow-green-200 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" /> Valider ✅
                </button>
              )}
            </div>
          </div>
        )}

        {/* Déjà validé */}
        {(statut === "actif" || statut === "valide") && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-50 border border-green-200">
            <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
            <p className="text-xs font-semibold text-green-700">
              Validé le {profile?.validated_at ? moment(profile.validated_at).format("DD/MM/YYYY") : livreur.date_validation ? moment(livreur.date_validation).format("DD/MM/YYYY") : "—"}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function ValidationLivreurs() {
  const navigate = useNavigate();
  const [livreurs, setLivreurs] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [admin, setAdmin] = useState(null);

  const loadData = async () => {
    setLoading(true);
    const me = await base44.auth.me();
    setAdmin(me);

    const [usersData, profilesData] = await Promise.all([
      base44.entities.User.filter({ user_type: "livreur" }),
      base44.entities.UserProfile.filter({ profile_type: "livreur", deleted: false }),
    ]);
    setLivreurs(usersData || []);
    setProfiles(profilesData || []);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    const unsubs = [
      base44.entities.User.subscribe(e => { if (e.data?.user_type === 'livreur') loadData(); }),
      base44.entities.UserProfile.subscribe(e => { if (e.data?.profile_type === 'livreur') loadData(); }),
    ];
    return () => unsubs.forEach(u => u?.());
  }, []);

  const getProfile = (livreur) => profiles.find(p => p.user_email === livreur.email);
  const getStatut = (livreur) => {
    const p = getProfile(livreur);
    return p?.status || livreur.statut_validation_livreur || "en_attente";
  };

  const handleValidate = async (livreur, profile) => {
    setProcessing(true);
    const now = new Date().toISOString();
    try {
      if (profile) {
        await base44.entities.UserProfile.update(profile.id, {
          status: 'actif', validated_at: now, validated_by: admin?.email, refusal_reason: null,
        });
      }
      await base44.entities.User.update(livreur.id, {
        statut_validation_livreur: 'valide', profil_valide: true, actif: true, date_validation: now,
      });
      // Push FCM via sendCdlNotification (canal cdl_critical_alerts_v2)
      base44.functions.invoke('sendCdlNotification', {
        user_email: livreur.email,
        title: '✅ Profil livreur validé !',
        body: `Félicitations ${livreur.full_name} ! Votre profil a été validé. Vous pouvez maintenant passer en ligne et recevoir des courses CDL 🛵`,
        data: {
          type: 'profile_validated',
          entity_id: profile?.id || livreur.id,
          entity_type: 'UserProfile',
          notif_route: '/',
        },
      }).catch(e => console.warn('[ValidationLivreurs] FCM push non-bloquant:', e.message));
      toast.success(`✅ ${livreur.full_name} validé — push FCM envoyé`);
      await loadData();
    } catch (err) {
      toast.error('Erreur : ' + err.message);
    }
    setProcessing(false);
  };

  const handleRefuse = async (livreur, profile, motif) => {
    setProcessing(true);
    const reason = motif || "Documents insuffisants ou illisibles";
    try {
      if (profile) {
        await base44.entities.UserProfile.update(profile.id, { status: 'refuse', refusal_reason: reason });
      }
      await base44.entities.User.update(livreur.id, {
        statut_validation_livreur: 'refuse', profil_valide: false, motif_refus: reason,
      });
      // Push FCM via sendCdlNotification (canal cdl_critical_alerts_v2)
      base44.functions.invoke('sendCdlNotification', {
        user_email: livreur.email,
        title: '❌ Dossier livreur refusé',
        body: `Motif : ${reason}. Corrigez vos documents et resoumettez votre dossier.`,
        data: {
          type: 'profile_refused',
          entity_id: profile?.id || livreur.id,
          entity_type: 'UserProfile',
          notif_route: '/settings',
        },
      }).catch(e => console.warn('[ValidationLivreurs] FCM push non-bloquant:', e.message));
      toast.success(`Dossier de ${livreur.full_name} refusé — push FCM envoyé`);
      await loadData();
    } catch (err) {
      toast.error('Erreur : ' + err.message);
    }
    setProcessing(false);
  };

  const enAttente = livreurs.filter(l => {
    const s = getStatut(l);
    return !s || s === "en_attente";
  });
  const valides = livreurs.filter(l => {
    const s = getStatut(l);
    return s === "actif" || s === "valide";
  });
  const refuses = livreurs.filter(l => getStatut(l) === "refuse");

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Validation livreurs</h1>
          <p className="text-xs text-muted-foreground">{livreurs.length} livreur(s) au total</p>
        </div>
        <Button variant="ghost" size="icon" onClick={loadData}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <Tabs defaultValue="attente">
        <TabsList className="w-full">
          <TabsTrigger value="attente" className="flex-1 text-xs relative">
            🟡 Attente
            {enAttente.length > 0 && (
              <span className="ml-1 h-4 w-4 bg-amber-500 text-white rounded-full text-[9px] font-bold inline-flex items-center justify-center">
                {enAttente.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="valides" className="flex-1 text-xs">🟢 Validés ({valides.length})</TabsTrigger>
          <TabsTrigger value="refuses" className="flex-1 text-xs">🔴 Refusés ({refuses.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="attente" className="space-y-3 mt-3">
          {enAttente.length === 0
            ? <p className="text-center text-sm text-muted-foreground py-10">✅ Aucun dossier en attente</p>
            : enAttente.map(l => (
              <LivreurCard key={l.id} livreur={l} profile={getProfile(l)}
                onValidate={handleValidate} onRefuse={handleRefuse} processing={processing} />
            ))
          }
        </TabsContent>

        <TabsContent value="valides" className="space-y-3 mt-3">
          {valides.length === 0
            ? <p className="text-center text-sm text-muted-foreground py-10">Aucun livreur validé</p>
            : valides.map(l => (
              <LivreurCard key={l.id} livreur={l} profile={getProfile(l)}
                onValidate={handleValidate} onRefuse={handleRefuse} processing={processing} />
            ))
          }
        </TabsContent>

        <TabsContent value="refuses" className="space-y-3 mt-3">
          {refuses.length === 0
            ? <p className="text-center text-sm text-muted-foreground py-10">Aucun dossier refusé</p>
            : refuses.map(l => (
              <LivreurCard key={l.id} livreur={l} profile={getProfile(l)}
                onValidate={handleValidate} onRefuse={handleRefuse} processing={processing} />
            ))
          }
        </TabsContent>
      </Tabs>
    </div>
  );
}