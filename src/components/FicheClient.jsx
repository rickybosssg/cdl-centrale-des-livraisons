import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { X, Phone, MapPin, Calendar, Save, Ban, UserCheck, MessageCircle, UserPlus, Zap } from "lucide-react";
import ChatAdmin from "./ChatAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";

import StatusBadge from "./StatusBadge";

import moment from "moment";
import { toast } from "sonner";

const STATUTS = ["Nouveau", "Actif", "Fidèle", "VIP", "Inactif", "Bloqué"];

const STATUT_COLORS = {
  Nouveau: "bg-gray-100 text-gray-700",
  Actif: "bg-green-100 text-green-700",
  Fidèle: "bg-blue-100 text-blue-700",
  VIP: "bg-amber-100 text-amber-700",
  Inactif: "bg-orange-100 text-orange-700",
  Bloqué: "bg-red-100 text-red-700",
};

export default function FicheClient({ client, onClose, onUpdated, onDeleted }) {
  const [adminUser, setAdminUser] = useState(null);
  const [activeTab, setActiveTab] = useState("info");
  const [saving, setSaving] = useState(false);

  useEffect(() => { base44.auth.me().then(setAdminUser); }, []);
  const [courses, setCourses] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [form, setForm] = useState({
    nom_complet: client.nom_complet || "",
    numero_telephone: client.numero_telephone || "",
    quartier_principal: client.quartier_principal || "",
    adresse_principale: client.adresse_principale || "",
    point_de_repere: client.point_de_repere || "",
    statut_client: client.statut_client || "Nouveau",
    note_admin: client.note_admin || "",
  });

  useEffect(() => {
    const loadCourses = async () => {
      if (!client.email) return;
      setLoadingCourses(true);
      const data = await base44.entities.Course.filter({ client_email: client.email }, "-created_date", 50);
      setCourses(data);
      setLoadingCourses(false);
    };
    loadCourses();
  }, [client.email]);

  const sauvegarder = async () => {
    setSaving(true);
    await base44.entities.Client.update(client.id, form);
    toast.success("Fiche client mise à jour");
    onUpdated?.({ ...client, ...form });
    setSaving(false);
  };

  const bloquer = async () => {
    const updated = { ...form, statut_client: "Bloqué" };
    await base44.entities.Client.update(client.id, { statut_client: "Bloqué" });
    toast.success("Client bloqué");
    setForm(updated);
    onUpdated?.({ ...client, ...updated });
  };

  const reactiver = async () => {
    const updated = { ...form, statut_client: "Actif" };
    await base44.entities.Client.update(client.id, { statut_client: "Actif" });
    toast.success("Client réactivé");
    setForm(updated);
    onUpdated?.({ ...client, ...updated });
  };

  const relancerWhatsApp = (message) => {
    const tel = (form.numero_telephone || "").replace(/\D/g, "");
    const texte = encodeURIComponent(message);
    window.open(`https://wa.me/${tel}?text=${texte}`, "_blank");
  };

  const msgInactif = `Bonjour ${form.nom_complet || ""},\nCDL vous manque 😊. Profitez de nos services de livraison rapide aujourd'hui !\nPassez votre commande maintenant 🚀`;
  const msgVIP = `Bonjour ${form.nom_complet || ""},\nMerci pour votre fidélité 💙. Vous êtes un client VIP CDL !\nNous sommes toujours là pour vous servir avec excellence.`;
  const msgPromo = `Bonjour ${form.nom_complet || ""},\nCDL vous offre une livraison rapide aujourd'hui 🚀. Commandez maintenant !`;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center" onClick={onClose}>
      <div
        className="bg-background w-full max-w-lg rounded-t-2xl max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-background border-b px-4 py-3 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-base">{form.nom_complet || "Client"}</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUT_COLORS[form.statut_client] || STATUT_COLORS.Nouveau}`}>
              {form.statut_client}
            </span>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="p-4 space-y-4">
          {/* Tabs custom scrollable */}
          <div className="flex overflow-x-auto border-b gap-0 -mx-4 px-4">
            {[
              { val: "info", label: "Infos" },
              { val: "courses", label: `Courses (${courses.length})` },
              { val: "relance", label: "Relance" },
              { val: "messages", label: "💬 Chat" },
              { val: "conversion", label: "Conversion" },
              { val: "admin", label: "Admin" },
            ].map(t => (
              <button
                key={t.val}
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActiveTab(t.val); }}
                className={`shrink-0 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === t.val
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div>

            {/* Onglet Infos */}
            {activeTab === "info" && <div className="space-y-3 mt-3">
              <div className="grid grid-cols-3 gap-2">
                <Card className="text-center">
                  <CardContent className="p-3">
                    <p className="text-xl font-bold text-primary">{client.nombre_total_courses || 0}</p>
                    <p className="text-[10px] text-muted-foreground">Courses</p>
                  </CardContent>
                </Card>
                <Card className="text-center">
                  <CardContent className="p-3">
                    <p className="text-sm font-bold text-green-600">{(client.total_depense || 0).toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">FCFA</p>
                  </CardContent>
                </Card>
                <Card className="text-center">
                  <CardContent className="p-3">
                    <p className="text-xs font-bold">{client.date_derniere_course ? moment(client.date_derniere_course).fromNow() : "—"}</p>
                    <p className="text-[10px] text-muted-foreground">Dernière</p>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-3">
                <div><label className="text-xs font-medium">Nom complet</label>
                  <Input value={form.nom_complet} onChange={e => setForm(f => ({ ...f, nom_complet: e.target.value }))} /></div>
                <div><label className="text-xs font-medium">Téléphone</label>
                  <Input value={form.numero_telephone} onChange={e => setForm(f => ({ ...f, numero_telephone: e.target.value }))} /></div>
                <div><label className="text-xs font-medium">Quartier principal</label>
                  <Input value={form.quartier_principal} onChange={e => setForm(f => ({ ...f, quartier_principal: e.target.value }))} /></div>
                <div><label className="text-xs font-medium">Adresse</label>
                  <Input value={form.adresse_principale} onChange={e => setForm(f => ({ ...f, adresse_principale: e.target.value }))} /></div>
                <div><label className="text-xs font-medium">Point de repère</label>
                  <Input value={form.point_de_repere} onChange={e => setForm(f => ({ ...f, point_de_repere: e.target.value }))} /></div>
              </div>

              {client.date_inscription && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  Client depuis le {moment(client.date_inscription).format("DD/MM/YYYY")}
                </div>
              )}

              <Button className="w-full" onClick={sauvegarder} disabled={saving}>
                <Save className="h-4 w-4 mr-1" />{saving ? "Sauvegarde..." : "Sauvegarder"}
              </Button>
            </div>}

            {/* Onglet Courses */}
            {activeTab === "courses" && <div className="mt-3">
              {loadingCourses ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                </div>
              ) : courses.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">Aucune course</p>
              ) : (
                <div className="space-y-2">
                  {courses.map(course => (
                    <Card key={course.id}>
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-mono text-muted-foreground">#{course.id?.slice(0, 8)}</p>
                            <p className="text-sm font-medium">{course.quartier_depart} → {course.quartier_arrivee}</p>
                            <p className="text-xs text-muted-foreground">{course.mode_paiement || "—"} • {moment(course.created_date).format("DD/MM/YY HH:mm")}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="font-bold text-primary text-sm">{(course.prix || 0).toLocaleString()} FCFA</p>
                            <StatusBadge statut={course.statut} />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>}

            {/* Onglet Relance WhatsApp */}
            {activeTab === "relance" && <div className="space-y-3 mt-3">
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl">
                <MessageCircle className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-sm font-semibold text-green-700">Relance WhatsApp</p>
                  <p className="text-xs text-green-600">{form.numero_telephone || "Aucun numéro"}</p>
                </div>
              </div>

              <Card>
                <CardContent className="p-3 space-y-2">
                  <p className="text-xs font-semibold">Message promotionnel</p>
                  <p className="text-xs text-muted-foreground">{msgPromo}</p>
                  <Button className="w-full bg-green-600 hover:bg-green-700" size="sm" onClick={() => relancerWhatsApp(msgPromo)}>
                    <MessageCircle className="h-4 w-4 mr-1" />Envoyer via WhatsApp
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-3 space-y-2">
                  <p className="text-xs font-semibold">Message client inactif</p>
                  <p className="text-xs text-muted-foreground">{msgInactif}</p>
                  <Button className="w-full bg-green-600 hover:bg-green-700" size="sm" onClick={() => relancerWhatsApp(msgInactif)}>
                    <MessageCircle className="h-4 w-4 mr-1" />Envoyer via WhatsApp
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-3 space-y-2">
                  <p className="text-xs font-semibold">Message client VIP</p>
                  <p className="text-xs text-muted-foreground">{msgVIP}</p>
                  <Button className="w-full bg-green-600 hover:bg-green-700" size="sm" onClick={() => relancerWhatsApp(msgVIP)}>
                    <MessageCircle className="h-4 w-4 mr-1" />Envoyer via WhatsApp
                  </Button>
                </CardContent>
              </Card>
            </div>}

            {/* Onglet Messages */}
            {activeTab === "messages" && <div className="mt-3">
              {client.email ? (
                <ChatAdmin userEmail={client.email} userRole="client" currentUser={adminUser} />
              ) : (
                <p className="text-sm text-muted-foreground text-center py-6">Email client non disponible</p>
              )}
            </div>}

            {/* Onglet Conversion Rôle */}
            {activeTab === "conversion" && <div className="space-y-3 mt-3">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
                <p className="text-sm font-semibold text-blue-700 mb-1">🔄 Convertir en professionnel</p>
                <p className="text-xs text-blue-600">Transformer ce client en livreur, partenaire ou commercial</p>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {[
                  { role: "livreur", label: "🛵 Livreur", desc: "Peut recevoir des courses" },
                  { role: "partenaire", label: "🏪 Partenaire", desc: "Peut vendre des produits" },
                  { role: "commercial", label: "📣 Commercial", desc: "Peut promouvoir CDL" },
                ].map(opt => (
                  <Button
                    key={opt.role}
                    variant="outline"
                    className="w-full justify-start h-auto py-3"
                    onClick={async () => {
                      setSaving(true);
                      try {
                        const users = await base44.entities.User.filter({ email: client.email });
                        if (users.length === 0) {
                          toast.error("Utilisateur non trouvé");
                          setSaving(false);
                          return;
                        }
                        const user = users[0];
                        await base44.asServiceRole.entities.User.update(user.id, {
                          user_type: opt.role,
                          user_roles: JSON.stringify([opt.role]),
                          statut_validation_livreur: opt.role === "livreur" ? "en_attente" : null,
                          statut_validation_partenaire: opt.role === "partenaire" ? "en_attente" : null,
                          statut_validation_commercial: opt.role === "commercial" ? "en_attente" : null,
                          profil_valide: false,
                        });
                        toast.success(`Client converti en ${opt.label} - En attente de validation`);
                        setActiveTab("admin");
                      } catch (err) {
                        toast.error("Erreur: " + err.message);
                      } finally {
                        setSaving(false);
                      }
                    }}
                    disabled={saving}
                  >
                    <div className="text-left">
                      <p className="font-medium text-sm">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.desc}</p>
                    </div>
                  </Button>
                ))}
              </div>
            </div>}

            {/* Onglet Admin */}
            {activeTab === "admin" && <div className="space-y-4 mt-3">
              <div>
                <label className="text-xs font-medium mb-1 block">Statut client</label>
                <div className="flex gap-1.5 flex-wrap">
                  {STATUTS.map(s => (
                    <button
                      key={s}
                      onClick={() => setForm(f => ({ ...f, statut_client: s }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        form.statut_client === s ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium mb-1 block">Note administrateur</label>
                <Textarea
                  rows={4}
                  placeholder="Ajouter une note sur ce client..."
                  value={form.note_admin}
                  onChange={e => setForm(f => ({ ...f, note_admin: e.target.value }))}
                />
              </div>

              {client.note_admin && (
                <Card className="bg-amber-50 border-amber-200">
                  <CardContent className="p-3">
                    <p className="text-xs font-semibold text-amber-700 mb-1">Note actuelle</p>
                    <p className="text-sm text-amber-800">{client.note_admin}</p>
                  </CardContent>
                </Card>
              )}

              <div className="flex gap-2 pt-2">
                {form.statut_client !== "Bloqué" ? (
                  <Button variant="destructive" className="flex-1" onClick={bloquer}>
                    <Ban className="h-4 w-4 mr-1" />Bloquer
                  </Button>
                ) : (
                  <Button variant="outline" className="flex-1 text-green-600 border-green-300" onClick={reactiver}>
                    <UserCheck className="h-4 w-4 mr-1" />Réactiver
                  </Button>
                )}
                <Button className="flex-1" onClick={sauvegarder} disabled={saving}>
                  <Save className="h-4 w-4 mr-1" />{saving ? "..." : "Sauvegarder"}
                </Button>
              </div>


            </div>}
          </div>
        </div>
      </div>
    </div>
  );
}