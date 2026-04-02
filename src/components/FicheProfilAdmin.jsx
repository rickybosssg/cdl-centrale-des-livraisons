import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Phone, MessageCircle, Mail, MapPin, Calendar, User, CheckCircle2, XCircle, Lock, Unlock, Trash2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import moment from "moment";

const val = (v) => v || <span className="text-muted-foreground italic">non renseigné</span>;

export default function FicheProfilAdmin({ type, data, onClose, onUpdated }) {
  const [courses, setCourses] = useState([]);
  const [codePromo, setCodePromo] = useState(null);
  const [logs, setLogs] = useState([]);
  const [adminUser, setAdminUser] = useState(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    base44.auth.me().then(setAdminUser);
    if (!data) return;

    const email = data.email || data.user_email;

    if (type === "client") {
      base44.entities.Course.filter({ client_email: email }, "-created_date", 20).then(setCourses).catch(() => {});
    }
    if (type === "commercial") {
      base44.entities.CodePromo.filter({ commercial_email: email }).then(r => setCodePromo(r[0] || null)).catch(() => {});
    }
    base44.entities.AdminActionLog.filter({ target_email: email }, "-created_date", 15).then(setLogs).catch(() => {});
  }, [data, type]);

  if (!data) return null;

  const email = data.email || data.user_email;
  const telephone = data.telephone || data.numero_telephone;
  const whatsapp = data.whatsapp || telephone;
  const nom = data.nom_complet || data.full_name || data.nom_responsable || "—";
  const quartier = data.quartier || data.quartier_principal || data.adresse || "—";

  const logAction = async (action, reason) => {
    if (!adminUser) return;
    await base44.entities.AdminActionLog.create({
      admin_email: adminUser.email,
      object_type: type,
      object_id: data.id,
      object_name: nom,
      action,
      reason,
      target_email: email,
    }).catch(() => {});
  };

  // ── Actions ──────────────────────────────────────────────────────────────────

  const handleBlock = async () => {
    setProcessing(true);
    const isBlocked = data.statut_client === "Bloqué" || data.statut === "suspendu" || data.livreur_bloque || data.suspended;
    if (type === "client") {
      await base44.entities.Client.update(data.id, { statut_client: isBlocked ? "Actif" : "Bloqué" });
      await logAction(isBlocked ? "unsuspend" : "suspend", isBlocked ? "Déblocage client" : "Blocage client");
    } else if (type === "livreur") {
      await base44.entities.User.update(data.id, { livreur_bloque: !isBlocked });
      await logAction(!isBlocked ? "suspend" : "unsuspend", "Blocage livreur");
    } else if (type === "partenaire") {
      await base44.entities.Partenaire.update(data.id, { suspended: !isBlocked, statut: isBlocked ? "actif" : "suspendu" });
      await logAction(!isBlocked ? "suspend" : "unsuspend", "Suspension partenaire");
    } else if (type === "commercial") {
      await base44.entities.User.update(data.id, { bloque: !isBlocked });
      await logAction(!isBlocked ? "suspend" : "unsuspend", "Blocage commercial");
    }
    toast.success(isBlocked ? "Compte débloqué" : "Compte bloqué");
    setProcessing(false);
    onUpdated?.();
  };

  const handleToggleVisibility = async () => {
    if (type !== "partenaire") return;
    setProcessing(true);
    await base44.entities.Partenaire.update(data.id, { ouvert: !data.ouvert });
    toast.success(data.ouvert ? "Boutique fermée" : "Boutique ouverte");
    setProcessing(false);
    onUpdated?.();
  };

  const handleToggleCodePromo = async () => {
    if (!codePromo) return;
    setProcessing(true);
    await base44.entities.CodePromo.update(codePromo.id, { actif: !codePromo.actif });
    setCodePromo(p => ({ ...p, actif: !p.actif }));
    toast.success(codePromo.actif ? "Code promo désactivé" : "Code promo activé");
    setProcessing(false);
  };

  const handleMarquerAbonnement = async (statut) => {
    if (type !== "partenaire") return;
    setProcessing(true);
    const now = new Date().toISOString();
    const fin = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await base44.entities.Partenaire.update(data.id, {
      statut_abonnement: statut,
      date_paiement_abonnement: now,
      date_expiration_abonnement: fin,
    });
    await logAction("modify", `Abonnement marqué : ${statut}`);
    toast.success(`Abonnement ${statut}`);
    setProcessing(false);
    onUpdated?.();
  };

  const isBlocked = data.statut_client === "Bloqué" || data.statut === "suspendu" || data.livreur_bloque || data.suspended;

  const BlockBtn = () => (
    <Button variant="outline" size="sm" className={isBlocked ? "border-green-300 text-green-700" : "border-red-300 text-red-700"} onClick={handleBlock} disabled={processing}>
      {isBlocked ? <><Unlock className="h-3.5 w-3.5 mr-1" />Débloquer</> : <><Lock className="h-3.5 w-3.5 mr-1" />Bloquer</>}
    </Button>
  );

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[92vh] overflow-y-auto max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{type === "client" ? "👤" : type === "livreur" ? "🛵" : type === "partenaire" ? "🏪" : "💼"}</span>
            Fiche {type}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">

          {/* ── IDENTITÉ ── */}
          <Section title="Identité">
            <Row icon={<User className="h-3.5 w-3.5" />} label="Nom" value={val(nom)} />
            {type === "partenaire" && <Row label="Boutique" value={val(data.nom_commerce)} />}
            {type === "partenaire" && <Row label="Catégorie" value={val(data.type_commerce)} />}
            {type === "partenaire" && data.type_activite && <Row label="Activité" value={data.type_activite} />}
            <Row icon={<Calendar className="h-3.5 w-3.5" />} label="Inscription" value={data.created_date ? moment(data.created_date).format("DD/MM/YYYY") : val(null)} />
            {data.date_inscription && <Row label="Date inscr." value={moment(data.date_inscription).format("DD/MM/YYYY")} />}
            {(data.validated_at || data.date_validation) && (
              <Row label="Validé le" value={moment(data.validated_at || data.date_validation).format("DD/MM/YYYY")} />
            )}
            <Row icon={<MapPin className="h-3.5 w-3.5" />} label="Quartier" value={val(quartier)} />
          </Section>

          {/* ── CONTACTS ── */}
          <Section title="Contacts">
            <Row icon={<Phone className="h-3.5 w-3.5" />} label="Téléphone" value={telephone ? (
              <a href={`tel:${telephone}`} className="text-primary underline">{telephone}</a>
            ) : val(null)} />
            {whatsapp && whatsapp !== telephone && <Row label="WhatsApp" value={whatsapp} />}
            <Row icon={<Mail className="h-3.5 w-3.5" />} label="E-mail" value={val(email)} />
            <div className="flex gap-2 mt-2">
              {telephone && (
                <a href={`tel:${telephone}`} className="flex-1">
                  <Button variant="outline" size="sm" className="w-full text-xs border-blue-300 text-blue-700"><Phone className="h-3 w-3 mr-1" />Appeler</Button>
                </a>
              )}
              {(whatsapp || telephone) && (
                <a href={`https://wa.me/${(whatsapp || telephone).replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer" className="flex-1">
                  <Button variant="outline" size="sm" className="w-full text-xs border-green-300 text-green-700"><MessageCircle className="h-3 w-3 mr-1" />WhatsApp</Button>
                </a>
              )}
            </div>
          </Section>

          {/* ── STATUT ── */}
          <Section title="Statut">
            {type === "client" && <StatutBadge statut={data.statut_client || "Actif"} />}
            {type === "livreur" && <StatutBadge statut={data.statut_validation_livreur || "en_attente"} />}
            {type === "partenaire" && <StatutBadge statut={data.statut || "en_attente"} />}
            {type === "commercial" && <StatutBadge statut={data.statut_validation_commercial || "en_attente"} />}
            {isBlocked && <p className="text-xs text-red-600 font-medium mt-1">⛔ Compte bloqué / suspendu</p>}
          </Section>

          {/* ── DONNÉES MÉTIER ── */}
          {type === "client" && (
            <Section title="Activité client">
              <Row label="Courses totales" value={data.nombre_total_courses || 0} />
              <Row label="Total dépensé" value={`${(data.total_depense || 0).toLocaleString()} FCFA`} />
              <Row label="Dernière course" value={data.date_derniere_course ? moment(data.date_derniere_course).fromNow() : val(null)} />
              {courses.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs font-semibold">Dernières courses</p>
                  {courses.slice(0, 5).map(c => (
                    <div key={c.id} className="text-xs p-1.5 rounded bg-muted/40 border flex justify-between">
                      <span>{c.quartier_depart} → {c.quartier_arrivee}</span>
                      <span className={`font-medium ${c.statut === 'livree' ? 'text-green-600' : c.statut === 'annulee' ? 'text-red-500' : 'text-amber-600'}`}>{c.statut}</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          )}

          {type === "livreur" && (
            <Section title="Profil livreur">
              <Row label="Zone" value={val(data.quartier)} />
              <Row label="Moyen déplacement" value={val(data.moyen_deplacement)} />
              <Row label="Livraisons totales" value={data.nombre_courses_terminees || data.total_livraisons || 0} />
              <Row label="Commission due" value={`${(data.solde_commission_du || 0).toLocaleString()} FCFA`} />
              <Row label="Bloqué" value={data.livreur_bloque ? "Oui ⛔" : "Non ✅"} />
              {data.motif_refus && <Row label="Motif refus" value={data.motif_refus} />}
            </Section>
          )}

          {type === "partenaire" && (
            <Section title="Données partenaire">
              <Row label="Adresse" value={val(data.adresse)} />
              <Row label="Abonnement" value={<span className={`font-semibold ${data.statut_abonnement === 'Actif' ? 'text-green-600' : 'text-red-600'}`}>{data.statut_abonnement || "—"}</span>} />
              <Row label="Début abonnement" value={data.date_paiement_abonnement ? moment(data.date_paiement_abonnement).format("DD/MM/YYYY") : val(null)} />
              <Row label="Expiration" value={data.date_expiration_abonnement ? moment(data.date_expiration_abonnement).format("DD/MM/YYYY") : val(null)} />
              <Row label="Visibilité" value={data.ouvert ? "🟢 Visible" : "🔴 Masqué"} />
              <Row label="Vues" value={data.nombre_vues || 0} />
              <Row label="Commandes" value={data.nombre_commandes || 0} />
              <Row label="CA total" value={`${(data.chiffre_affaires || 0).toLocaleString()} FCFA`} />
              <div className="flex gap-2 mt-2 flex-wrap">
                <Button variant="outline" size="sm" className="text-xs" onClick={handleToggleVisibility} disabled={processing}>
                  {data.ouvert ? <><EyeOff className="h-3 w-3 mr-1" />Masquer</> : <><Eye className="h-3 w-3 mr-1" />Afficher</>}
                </Button>
                <Button variant="outline" size="sm" className="text-xs border-green-300 text-green-700" onClick={() => handleMarquerAbonnement("Actif")} disabled={processing}>
                  ✅ Marquer payé
                </Button>
                <Button variant="outline" size="sm" className="text-xs border-red-300 text-red-700" onClick={() => handleMarquerAbonnement("Expiré")} disabled={processing}>
                  ❌ Marquer impayé
                </Button>
              </div>
            </Section>
          )}

          {type === "commercial" && codePromo && (
            <Section title="Code promo & performances">
              <Row label="Code" value={<span className="font-mono font-bold text-primary">{codePromo.code}</span>} />
              <Row label="Statut code" value={codePromo.actif ? <span className="text-green-600 font-medium">Actif ✅</span> : <span className="text-red-500">Inactif ❌</span>} />
              <Row label="Utilisations" value={codePromo.nombre_utilisations || 0} />
              <Row label="Commission due" value={`${(codePromo.commission_due || 0).toLocaleString()} FCFA`} />
              <Row label="Commission payée" value={`${(codePromo.commission_payee || 0).toLocaleString()} FCFA`} />
              <Row label="Statut paiement" value={codePromo.statut_paiement || "—"} />
              <Button variant="outline" size="sm" className="mt-2 text-xs" onClick={handleToggleCodePromo} disabled={processing}>
                {codePromo.actif ? "❌ Désactiver le code" : "✅ Activer le code"}
              </Button>
            </Section>
          )}

          {/* ── ACTIONS ADMIN ── */}
          <Section title="Actions admin">
            <div className="flex gap-2 flex-wrap">
              <BlockBtn />
              {email && (
                <a href={`mailto:${email}`}>
                  <Button variant="outline" size="sm" className="text-xs"><Mail className="h-3 w-3 mr-1" />E-mail</Button>
                </a>
              )}
            </div>
          </Section>

          {/* ── HISTORIQUE ── */}
          {logs.length > 0 && (
            <Section title="Historique des actions">
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {logs.map(log => (
                  <div key={log.id} className="text-xs p-1.5 rounded bg-muted/40 border">
                    <div className="flex justify-between">
                      <span className="font-medium">{log.action} — {log.reason || "—"}</span>
                      <span className="text-muted-foreground">{moment(log.created_date).format("DD/MM/YY HH:mm")}</span>
                    </div>
                    <p className="text-muted-foreground">Par {log.admin_email}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground border-b pb-1">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ icon, label, value }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      {icon && <span className="text-muted-foreground mt-0.5 flex-shrink-0">{icon}</span>}
      <span className="text-muted-foreground min-w-[110px] flex-shrink-0">{label}</span>
      <span className="font-medium flex-1">{value}</span>
    </div>
  );
}

function StatutBadge({ statut }) {
  const cfg = {
    "actif": "bg-green-100 text-green-700", "Actif": "bg-green-100 text-green-700",
    "valide": "bg-green-100 text-green-700", "Validé": "bg-green-100 text-green-700",
    "en_attente": "bg-amber-100 text-amber-700", "En attente": "bg-amber-100 text-amber-700",
    "refuse": "bg-red-100 text-red-700", "Refusé": "bg-red-100 text-red-700",
    "suspendu": "bg-red-100 text-red-700", "Bloqué": "bg-red-100 text-red-700",
    "Nouveau": "bg-gray-100 text-gray-700", "Fidèle": "bg-blue-100 text-blue-700",
    "VIP": "bg-amber-100 text-amber-700", "Inactif": "bg-orange-100 text-orange-700",
  };
  return (
    <span className={`inline-block text-xs px-2.5 py-1 rounded-full font-semibold ${cfg[statut] || "bg-gray-100 text-gray-600"}`}>
      {statut}
    </span>
  );
}