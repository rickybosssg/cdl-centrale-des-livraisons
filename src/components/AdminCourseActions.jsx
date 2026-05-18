import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Trash2, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * AdminCourseActions — Boutons + modals Annuler / Supprimer une course (admin uniquement)
 * Props:
 *   course     : objet Course
 *   onDone     : callback après action réussie
 *   size       : "sm" | "default"
 */
export default function AdminCourseActions({ course, onDone, size = "sm" }) {
  const [mode, setMode] = useState(null); // "cancel" | "delete" | null
  const [raison, setRaison] = useState("");
  const [loading, setLoading] = useState(false);

  if (!course) return null;

  const isAlreadyCancelled = ["annulee", "annulee_par_admin"].includes(course.statut);
  const isDeleted = !!course.is_deleted;

  if (isDeleted) return null; // course supprimée = non affichée

  const handleConfirm = async () => {
    if (!raison.trim()) { toast.error("Veuillez saisir une raison"); return; }
    if (loading) return;
    const action = mode === 'cancel' ? 'cancel_admin' : 'delete_admin';
    console.log(`[CANCEL_STARTED] course=${course.id} | statut=${course.statut} | action=${action} | raison=${raison.trim()} | ts=${new Date().toISOString()}`);
    setLoading(true);
    try {
      const res = await base44.functions.invoke("cancelCourseAction", {
        courseId: course.id,
        action,
        raison: raison.trim(),
      });

      if (!res?.data?.success) {
        const errMsg = res?.data?.error || res?.data?.message || "Erreur inconnue";
        console.error(`[CANCEL_ERROR] course=${course.id} | errMsg=${errMsg} | response=`, res?.data);
        throw new Error(errMsg);
      }

      console.log(`[COURSE_UPDATED] course=${course.id} | nouveau_statut=${action === 'cancel_admin' ? 'annulee' : 'deleted'} | ts=${new Date().toISOString()}`);

      // Mise à jour optimiste IMMÉDIATE — avant même le realtime subscription
      const updatedCourse = action === 'cancel_admin'
        ? { ...course, statut: 'annulee', annulee_par_admin: true }
        : { ...course, is_deleted: true };

      // Notifie le parent pour retrait immédiat de la liste courante
      onDone?.(course.id, action, updatedCourse);

      console.log(`[UI_REMOVED_FROM_LISTS] course=${course.id} | action=${action} | ts=${new Date().toISOString()}`);

      toast.success(mode === "cancel" ? "✅ Course annulée avec succès" : "✅ Course supprimée");
      setMode(null);
      setRaison("");
    } catch (err) {
      console.error(`[CANCEL_ERROR] course=${course.id} | exception=${err.message}`);
      toast.error("❌ Erreur : " + (err.message || "inconnue"));
    } finally {
      setLoading(false);
    }
  };

  return (
    // stopPropagation : empêche le clic sur les boutons d'ouvrir les dialogs parents (détail, card, row)
    <div onClick={(e) => e.stopPropagation()}>
      {/* ── Boutons inline ── */}
      <div className="flex gap-1.5">
        {!isAlreadyCancelled && (
          <Button
            size={size}
            variant="outline"
            className="border-orange-300 text-orange-700 hover:bg-orange-50 gap-1"
            onClick={(e) => { e.stopPropagation(); setMode("cancel"); setRaison(""); }}
          >
            <XCircle className="h-3.5 w-3.5" />
            {size !== "sm" && "Annuler"}
          </Button>
        )}
        <Button
          size={size}
          variant="outline"
          className="border-red-300 text-red-700 hover:bg-red-50 gap-1"
          onClick={(e) => { e.stopPropagation(); setMode("delete"); setRaison(""); }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {size !== "sm" && "Supprimer"}
        </Button>
      </div>

      {/* ── Modal confirmation ── */}
      <Dialog open={!!mode} onOpenChange={(v) => { if (!loading) setMode(v ? mode : null); }}>
        <DialogContent className="max-w-sm" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {mode === "cancel" ? (
                <><XCircle className="h-5 w-5 text-orange-600" /> Annuler la course</>
              ) : (
                <><Trash2 className="h-5 w-5 text-red-600" /> Supprimer la course</>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Résumé course */}
            <div className="p-3 rounded-xl bg-muted/50 border text-sm space-y-1">
              <p className="font-semibold text-xs text-muted-foreground">Course concernée</p>
              <p className="font-medium">{course.quartier_depart} → {course.quartier_arrivee}</p>
              <p className="text-xs text-muted-foreground">
                {course.client_name} · {course.prix?.toLocaleString()} FCFA · <span className="font-mono">{course.statut}</span>
              </p>
              {course.livreur_name && (
                <p className="text-xs text-muted-foreground">🛵 {course.livreur_name}</p>
              )}
            </div>

            {/* Impact */}
            <div className={`p-3 rounded-xl border text-xs space-y-1.5 ${
              mode === "cancel" ? "bg-orange-50 border-orange-200 text-orange-800" : "bg-red-50 border-red-200 text-red-800"
            }`}>
              <div className="flex items-center gap-1.5 font-bold">
                <AlertTriangle className="h-3.5 w-3.5" />
                Impact de cette action
              </div>
              {mode === "cancel" ? (
                <ul className="space-y-1 ml-5 list-disc">
                  <li>Statut → <strong>annulee</strong> (annulée par admin)</li>
                  <li>Dispatch en cours stoppé immédiatement</li>
                  {course.livreur_name && <li>Livreur <strong>{course.livreur_name}</strong> libéré</li>}
                  <li>Client et livreur notifiés</li>
                  <li>Course conservée dans l'historique</li>
                </ul>
              ) : (
                <ul className="space-y-1 ml-5 list-disc">
                  <li>Masquée des listes standards</li>
                  <li>Suppression <strong>logique</strong> (données préservées)</li>
                  <li>Traçabilité admin conservée</li>
                </ul>
              )}
            </div>

            {/* Raison */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">
                Raison {mode === "cancel" ? "d'annulation" : "de suppression"} *
              </label>
              <Textarea
                placeholder={mode === "cancel" ? "Ex: Course en double, erreur de saisie, demande client..." : "Ex: Test, doublon, données incorrectes..."}
                value={raison}
                onChange={(e) => setRaison(e.target.value)}
                rows={3}
                className="text-sm"
                disabled={loading}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                className="flex-1"
                onClick={(e) => { e.stopPropagation(); setMode(null); }}
                disabled={loading}
              >
                Fermer
              </Button>
              <Button
                type="button"
                className={`flex-1 gap-2 ${
                  mode === "cancel" ? "bg-orange-600 hover:bg-orange-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"
                }`}
                onClick={(e) => { e.stopPropagation(); handleConfirm(); }}
                disabled={loading || !raison.trim()}
              >
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Traitement...</> : mode === "cancel" ? "Confirmer l'annulation" : "Confirmer la suppression"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}