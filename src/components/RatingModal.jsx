import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { Star, MessageSquare } from "lucide-react";
import { toast } from "sonner";

export default function RatingModal({ open, onOpenChange, course, user }) {
  const [note, setNote] = useState(0);
  const [commentaire, setCommentaire] = useState("");
  const [hoveredNote, setHoveredNote] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (note === 0) {
      toast.error("Veuillez sélectionner une note");
      return;
    }

    setSubmitting(true);
    try {
      // Créer la note
      await base44.entities.LivreurRating.create({
        course_id: course.id,
        livreur_email: course.livreur_email,
        livreur_name: course.livreur_name,
        client_email: user?.email || course.client_email,
        client_name: user?.full_name || course.client_name,
        note,
        commentaire: commentaire.trim() || null,
      });

      // Récalculer la note moyenne du livreur
      const ratings = await base44.entities.LivreurRating.filter({
        livreur_email: course.livreur_email,
      });
      const moyenneNote = ratings.length > 0
        ? Math.round((ratings.reduce((s, r) => s + r.note, 0) / ratings.length) * 10) / 10
        : 0;

      // Mettre à jour le profil du livreur
      const livreurs = await base44.entities.User.filter({
        email: course.livreur_email,
      });
      if (livreurs.length > 0) {
        await base44.entities.User.update(livreurs[0].id, {
          note_moyenne: moyenneNote,
          nombre_notes: ratings.length,
        });
      }

      toast.success(`✅ Merci ! Vous avez noté ${course.livreur_name} ${note}/5`);
      setNote(0);
      setCommentaire("");
      onOpenChange(false);
    } catch (err) {
      console.error("[RatingModal] Submit error:", err);
      toast.error("Erreur lors de l'enregistrement de la note");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-amber-500" />
            Noter votre livreur
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Infos livreur */}
          <div className="p-3 rounded-xl bg-muted/50 text-center">
            <p className="font-semibold">{course.livreur_name}</p>
            <p className="text-xs text-muted-foreground">Course #{course.id?.slice(0, 8)}</p>
          </div>

          {/* Sélection note */}
          <div className="space-y-2">
            <p className="text-sm font-semibold">Votre note</p>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNote(n)}
                  onMouseEnter={() => setHoveredNote(n)}
                  onMouseLeave={() => setHoveredNote(0)}
                  className="relative transition-transform active:scale-90"
                >
                  <Star
                    className={`h-12 w-12 transition-all ${
                      n <= (hoveredNote || note)
                        ? "fill-amber-400 text-amber-400 scale-110"
                        : "text-gray-300"
                    }`}
                  />
                </button>
              ))}
            </div>
            {note > 0 && (
              <p className="text-center text-sm font-bold text-amber-600">
                {["", "😞 Très mauvais", "😐 Mauvais", "😊 Correct", "😄 Bon", "🤩 Excellent"][note]}
              </p>
            )}
          </div>

          {/* Commentaire optionnel */}
          <div className="space-y-1">
            <label className="flex items-center gap-1.5 text-xs font-semibold">
              <MessageSquare className="h-3.5 w-3.5" />
              Commentaire (optionnel)
            </label>
            <textarea
              className="w-full border rounded-lg px-3 py-2 text-sm placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Partagez votre expérience..."
              rows={3}
              value={commentaire}
              onChange={e => setCommentaire(e.target.value)}
              maxLength={200}
            />
            <p className="text-[10px] text-muted-foreground text-right">{commentaire.length}/200</p>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Passer
            </Button>
            <Button
              className="flex-1 gap-1.5 bg-amber-600 hover:bg-amber-700"
              onClick={handleSubmit}
              disabled={note === 0 || submitting}
            >
              {submitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Envoi...
                </>
              ) : (
                <>
                  <Star className="h-4 w-4" />
                  Envoyer la note
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}