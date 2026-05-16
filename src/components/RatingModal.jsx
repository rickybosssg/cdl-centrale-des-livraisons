/**
 * RatingModal — Notation livreur côté client
 * Overlay custom centré — safe-area Android — z-index maximal
 *
 * Logs: RATING_MODAL_CENTERED_OK | RATING_MODAL_VISIBLE_IMMEDIATELY_OK | RATING_MODAL_SAFEAREA_OK
 */
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Star, MessageSquare, X } from "lucide-react";
import { toast } from "sonner";

const LABELS = ["", "😞 Très mauvais", "😐 Mauvais", "😊 Correct", "😄 Bon", "🤩 Excellent"];

export default function RatingModal({ open, onOpenChange, course, user }) {
  const [note, setNote] = useState(0);
  const [commentaire, setCommentaire] = useState("");
  const [hoveredNote, setHoveredNote] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [visible, setVisible] = useState(false);

  // Animation d'entrée
  useEffect(() => {
    if (open) {
      console.log("[RATING_MODAL_VISIBLE_IMMEDIATELY_OK] modal ouverte");
      console.log("[RATING_MODAL_CENTERED_OK] overlay centré activé");
      console.log("[RATING_MODAL_SAFEAREA_OK] safe-area appliqué");
      // Bloquer le scroll body
      document.body.style.overflow = "hidden";
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const handleClose = () => {
    setVisible(false);
    setTimeout(() => onOpenChange(false), 200);
  };

  const handleSubmit = async () => {
    if (note === 0) {
      toast.error("Veuillez sélectionner une note");
      return;
    }
    setSubmitting(true);
    try {
      await base44.entities.LivreurRating.create({
        course_id: course.id,
        livreur_email: course.livreur_email,
        livreur_name: course.livreur_name,
        client_email: user?.email || course.client_email,
        client_name: user?.full_name || course.client_name,
        note,
        commentaire: commentaire.trim() || null,
      });

      const ratings = await base44.entities.LivreurRating.filter({ livreur_email: course.livreur_email });
      const moyenneNote = ratings.length > 0
        ? Math.round((ratings.reduce((s, r) => s + r.note, 0) / ratings.length) * 10) / 10
        : 0;

      const livreurs = await base44.entities.User.filter({ email: course.livreur_email });
      if (livreurs.length > 0) {
        await base44.entities.User.update(livreurs[0].id, {
          note_moyenne: moyenneNote,
          nombre_notes: ratings.length,
        });
      }

      toast.success(`✅ Merci ! Vous avez noté ${course.livreur_name} ${note}/5`);
      setNote(0);
      setCommentaire("");
      handleClose();
    } catch (err) {
      console.error("[RatingModal] Submit error:", err);
      toast.error("Erreur lors de l'enregistrement de la note");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    // Overlay : fixed, couvre tout, z-index max, fond sombre
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        zIndex: 9999,
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      {/* Fond sombre — clic ferme */}
      <div
        className={`absolute inset-0 bg-black/60 transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`}
        onClick={handleClose}
      />

      {/* Panneau centré */}
      <div
        className={`relative w-full max-w-sm mx-4 bg-card rounded-2xl shadow-2xl overflow-hidden transition-all duration-200 ${
          visible ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-4"
        }`}
        style={{ maxHeight: "90vh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Scroll interne si petit écran */}
        <div className="overflow-y-auto" style={{ maxHeight: "90vh" }}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
              <span className="font-bold text-base">Noter votre livreur</span>
            </div>
            <button
              onClick={handleClose}
              className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          <div className="px-4 pb-5 space-y-4">

            {/* Infos livreur */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
              {/* Avatar initial */}
              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary to-blue-400 flex items-center justify-center flex-shrink-0 shadow-sm">
                <span className="text-white font-extrabold text-lg">
                  {course.livreur_name?.charAt(0)?.toUpperCase() || "?"}
                </span>
              </div>
              <div className="min-w-0">
                <p className="font-bold text-sm truncate">{course.livreur_name || "Livreur"}</p>
                <p className="text-xs text-muted-foreground">
                  {course.quartier_depart} → {course.quartier_arrivee}
                </p>
                <p className="text-[10px] text-muted-foreground">Course #{course.id?.slice(-5).toUpperCase()}</p>
              </div>
            </div>

            {/* Sélection étoiles */}
            <div className="space-y-2">
              <p className="text-sm font-semibold text-center">Quelle est votre note ?</p>
              <div className="flex justify-center gap-1.5">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setNote(n)}
                    onMouseEnter={() => setHoveredNote(n)}
                    onMouseLeave={() => setHoveredNote(0)}
                    className="transition-transform active:scale-90 p-1"
                  >
                    <Star
                      className={`h-10 w-10 transition-all ${
                        n <= (hoveredNote || note)
                          ? "fill-amber-400 text-amber-400 scale-110"
                          : "text-gray-300"
                      }`}
                    />
                  </button>
                ))}
              </div>
              <p className={`text-center text-sm font-bold transition-opacity ${note > 0 ? "opacity-100 text-amber-600" : "opacity-0"}`}>
                {LABELS[note] || " "}
              </p>
            </div>

            {/* Commentaire optionnel */}
            <div className="space-y-1">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <MessageSquare className="h-3.5 w-3.5" />
                Commentaire (optionnel)
              </label>
              <textarea
                className="w-full border rounded-xl px-3 py-2 text-sm placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary bg-background"
                placeholder="Partagez votre expérience..."
                rows={3}
                value={commentaire}
                onChange={e => setCommentaire(e.target.value)}
                maxLength={200}
                autoCorrect="off"
                autoCapitalize="sentences"
              />
              <p className="text-[10px] text-muted-foreground text-right">{commentaire.length}/200</p>
            </div>

            {/* Boutons */}
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                className="flex-1 h-11 rounded-xl"
                onClick={handleClose}
                disabled={submitting}
              >
                Passer
              </Button>
              <Button
                className="flex-1 h-11 rounded-xl gap-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold"
                onClick={handleSubmit}
                disabled={note === 0 || submitting}
              >
                {submitting ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Star className="h-4 w-4 fill-white" />
                )}
                {submitting ? "Envoi..." : "Envoyer"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}