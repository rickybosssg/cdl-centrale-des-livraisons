/**
 * AucunLivreurPanel — Écran "Aucun livreur trouvé" complet et actionnable
 * 3 actions claires : Relancer / Augmenter prix / Mode manuel / Annuler
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, TrendingUp, UserPlus, X, Clock, Package, Loader2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import moment from "moment";

const PRICE_PRESETS = [500, 1000, 2000];

export default function AucunLivreurPanel({ course, onCourseUpdate, onCancel, compact = false }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState(null); // null | "relance" | "prix" | "manuel"
  const [loading, setLoading] = useState(false);
  const [prixDelta, setPrixDelta] = useState(null); // +500, +1000, custom
  const [customPrix, setCustomPrix] = useState("");
  const [manuelDone, setManuelDone] = useState(false);

  if (!course) return null;

  const prixActuel = course.prix || 0;
  const tentatives = course.nombre_tentatives || 0;
  const derniereHeure = course.heure_assignation || course.updated_date || course.created_date;

  // ── RELANCER le dispatch ──────────────────────────────────────────────────
  const handleRelance = async () => {
    if (loading) return;
    setLoading(true);
    setMode("relance");
    try {
      // Remettre en attente SANS recréer — on garde l'historique
      await base44.entities.Course.update(course.id, {
        statut: "en_attente",
        nombre_tentatives: tentatives, // conserver pour l'historique
        heure_assignation: null,
        livreur_email: null,
        livreur_name: null,
        telephone_livreur: null,
      });
      // Relancer cdlDispatch (pas autoDispatch — évite double dispatch)
      await base44.functions.invoke("cdlDispatch", { course_id: course.id, force: true }).catch(() =>
        base44.functions.invoke("autoDispatch", { course_id: course.id, force: true }).catch(() => {})
      );
      toast.success("🔄 Recherche relancée !");
      onCourseUpdate?.({ ...course, statut: "en_attente" });
    } catch (err) {
      toast.error("Erreur relance : " + err.message);
    } finally {
      setLoading(false);
      setMode(null);
    }
  };

  // ── AUGMENTER LE PRIX ─────────────────────────────────────────────────────
  const handlePrix = async (delta) => {
    if (loading) return;
    const nouveauPrix = prixActuel + delta;
    setLoading(true);
    try {
      const commission = Math.round(nouveauPrix * 0.2);
      await base44.entities.Course.update(course.id, {
        prix: nouveauPrix,
        commission_cdl: commission,
        gain_livreur: nouveauPrix - commission,
        statut: "en_attente",
        nombre_tentatives: tentatives,
        heure_assignation: null,
        livreur_email: null,
        livreur_name: null,
        telephone_livreur: null,
      });
      await base44.functions.invoke("cdlDispatch", { course_id: course.id, force: true }).catch(() =>
        base44.functions.invoke("autoDispatch", { course_id: course.id, force: true }).catch(() => {})
      );
      toast.success(`✅ Prix augmenté à ${nouveauPrix.toLocaleString()} F — recherche relancée`);
      onCourseUpdate?.({ ...course, prix: nouveauPrix, statut: "en_attente" });
      setMode(null);
      setPrixDelta(null);
      setCustomPrix("");
    } catch (err) {
      toast.error("Erreur : " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCustomPrix = () => {
    const val = parseInt(customPrix, 10);
    if (!val || val <= 0) { toast.error("Montant invalide"); return; }
    handlePrix(val);
  };

  // ── MODE MANUEL — alerter l'admin ─────────────────────────────────────────
  const handleManuel = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await base44.entities.Course.update(course.id, {
        statut: "en_attente",
        mode_assignation: "manuel",
        historique_assignation: (() => {
          try {
            const h = course.historique_assignation ? JSON.parse(course.historique_assignation) : [];
            h.push({ message: "Client demande assignation manuelle", heure: new Date().toISOString(), statut: "manuel_request" });
            return JSON.stringify(h);
          } catch { return JSON.stringify([{ message: "Client demande assignation manuelle", heure: new Date().toISOString(), statut: "manuel_request" }]); }
        })(),
      });
      // Notifier l'admin
      await base44.entities.Notification.create({
        destinataire_role: "admin",
        destinataire_email: "admin",
        titre: "🖐 Assignation manuelle demandée",
        message: `Course ${course.quartier_depart}→${course.quartier_arrivee} (${prixActuel} F) — le client demande un opérateur. ${tentatives} tentative(s).`,
        type: "warning",
        course_id: course.id,
        target_screen: `/gerer-courses`,
      }).catch(() => {});
      setManuelDone(true);
      toast.success("✅ Un opérateur CDL a été alerté");
      onCourseUpdate?.({ ...course, statut: "en_attente", mode_assignation: "manuel" });
    } catch (err) {
      toast.error("Erreur : " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── ANNULER ───────────────────────────────────────────────────────────────
  const handleAnnuler = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await base44.entities.Course.update(course.id, {
        statut: "annulee",
        admin_cancel_reason: "Annulé par client — aucun livreur trouvé",
      });
      // Pas de débit Bedou car aucun livreur n'a accepté
      toast.success("Course annulée — aucun frais prélevé");
      onCancel?.();
      navigate("/mes-courses");
    } catch (err) {
      toast.error("Erreur annulation : " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`rounded-2xl overflow-hidden border-2 border-orange-300 bg-white shadow-lg ${compact ? "" : "mx-0"}`}>
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-red-500 px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          <motion.span
            className="text-xl"
            animate={{ rotate: [0, -15, 15, -10, 10, 0] }}
            transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 3 }}
          >😕</motion.span>
          <div>
            <p className="font-black text-sm">Aucun livreur trouvé pour le moment</p>
            <p className="text-[11px] text-white/80">Choisissez une action pour continuer</p>
          </div>
        </div>
      </div>

      {/* Infos course */}
      <div className="px-4 py-3 bg-orange-50 border-b border-orange-100 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1 text-muted-foreground">
            <Package className="h-3 w-3" />{course.type_colis}
          </span>
          <span className="font-bold text-orange-700">{prixActuel.toLocaleString()} F</span>
          {tentatives > 0 && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <RefreshCw className="h-3 w-3" />{tentatives} tentative{tentatives > 1 ? "s" : ""}
            </span>
          )}
        </div>
        {derniereHeure && (
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />Dernière tentative {moment(derniereHeure).format("HH:mm")}
          </span>
        )}
      </div>

      {/* Corps — actions */}
      <div className="p-4 space-y-3">
        {/* Message rassurant */}
        <p className="text-xs text-gray-600 text-center leading-relaxed">
          Nous n'avons pas encore trouvé de livreur disponible. Vous pouvez relancer, ajuster le prix ou demander l'aide d'un opérateur.
        </p>

        {/* ── ACTION 1 : Relancer ── */}
        <button
          disabled={loading}
          onClick={handleRelance}
          className="w-full flex items-center justify-between p-3.5 rounded-xl border-2 border-primary bg-primary/5 hover:bg-primary/10 active:scale-[0.98] transition-all disabled:opacity-60"
        >
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              {loading && mode === "relance" ? <Loader2 className="h-4 w-4 text-primary animate-spin" /> : <RefreshCw className="h-4 w-4 text-primary" />}
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-primary">Relancer la recherche</p>
              <p className="text-[10px] text-muted-foreground">Même course, même prix — nouveau dispatch</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-primary flex-shrink-0" />
        </button>

        {/* ── ACTION 2 : Augmenter le prix ── */}
        <div className="rounded-xl border-2 border-amber-300 overflow-hidden">
          <button
            className="w-full flex items-center justify-between p-3.5 bg-amber-50 hover:bg-amber-100 active:scale-[0.98] transition-all"
            onClick={() => setMode(mode === "prix" ? null : "prix")}
            disabled={loading}
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="h-4 w-4 text-amber-600" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-amber-800">Augmenter le prix</p>
                <p className="text-[10px] text-amber-600">Un meilleur prix attire plus de livreurs</p>
              </div>
            </div>
            <ChevronRight className={`h-4 w-4 text-amber-500 transition-transform ${mode === "prix" ? "rotate-90" : ""}`} />
          </button>

          <AnimatePresence>
            {mode === "prix" && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="p-3 space-y-3 bg-white border-t border-amber-100">
                  <p className="text-xs text-muted-foreground">Prix actuel : <strong>{prixActuel.toLocaleString()} F</strong></p>
                  {/* Presets */}
                  <div className="grid grid-cols-3 gap-2">
                    {PRICE_PRESETS.map(delta => (
                      <button
                        key={delta}
                        onClick={() => { setPrixDelta(delta); setCustomPrix(""); }}
                        className={`py-2 rounded-xl text-xs font-bold border-2 transition-all ${prixDelta === delta ? "border-amber-500 bg-amber-100 text-amber-800" : "border-gray-200 bg-gray-50 text-gray-700"}`}
                      >
                        +{delta.toLocaleString()} F
                        <span className="block text-[9px] font-normal text-muted-foreground">→ {(prixActuel + delta).toLocaleString()} F</span>
                      </button>
                    ))}
                  </div>
                  {/* Custom */}
                  <div className="flex gap-2 items-center">
                    <input
                      type="number"
                      placeholder="Autre montant (+F)"
                      value={customPrix}
                      onChange={e => { setCustomPrix(e.target.value); setPrixDelta(null); }}
                      className="flex-1 px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => { setMode(null); setPrixDelta(null); }}>Annuler</Button>
                    <Button
                      size="sm"
                      className="flex-1 bg-amber-600 hover:bg-amber-700 text-white gap-1"
                      disabled={loading || (!prixDelta && !customPrix)}
                      onClick={() => prixDelta ? handlePrix(prixDelta) : handleCustomPrix()}
                    >
                      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      Confirmer
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── ACTION 3 : Mode Manuel ── */}
        {!manuelDone ? (
          <button
            disabled={loading}
            onClick={handleManuel}
            className="w-full flex items-center justify-between p-3.5 rounded-xl border-2 border-purple-300 bg-purple-50 hover:bg-purple-100 active:scale-[0.98] transition-all disabled:opacity-60"
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                {loading && mode === "manuel" ? <Loader2 className="h-4 w-4 text-purple-600 animate-spin" /> : <UserPlus className="h-4 w-4 text-purple-600" />}
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-purple-800">Demander un opérateur</p>
                <p className="text-[10px] text-purple-600">Un agent CDL cherche un livreur pour vous</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-purple-500 flex-shrink-0" />
          </button>
        ) : (
          <div className="flex items-center gap-3 p-3.5 rounded-xl border-2 border-green-300 bg-green-50">
            <span className="text-xl">✅</span>
            <div>
              <p className="text-sm font-bold text-green-800">Opérateur alerté</p>
              <p className="text-[10px] text-green-600">Un agent CDL cherche un livreur pour vous.</p>
            </div>
          </div>
        )}

        {/* ── ACTION 4 : Annuler ── */}
        <button
          disabled={loading}
          onClick={handleAnnuler}
          className="w-full flex items-center justify-between p-3 rounded-xl border border-red-200 bg-red-50/50 hover:bg-red-50 active:scale-[0.98] transition-all disabled:opacity-60"
        >
          <div className="flex items-center gap-3">
            <X className="h-4 w-4 text-red-500 flex-shrink-0" />
            <div className="text-left">
              <p className="text-sm font-medium text-red-700">Annuler la course</p>
              <p className="text-[10px] text-red-500">Aucun frais — aucun livreur n'a accepté</p>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}