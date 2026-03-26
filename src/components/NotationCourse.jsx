import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function NotationCourse({ course, onDone }) {
  const [note, setNote] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [commentaire, setCommentaire] = useState("");
  const [saving, setSaving] = useState(false);

  const soumettre = async () => {
    if (note === 0) { toast.error("Veuillez choisir une note"); return; }
    setSaving(true);
    await base44.entities.Course.update(course.id, {
      note_client: note,
      commentaire_client: commentaire,
      note_donnee: true,
    });
    // Mettre à jour la moyenne du livreur
    const livreurs = await base44.entities.User.filter({ email: course.livreur_email });
    if (livreurs.length > 0) {
      const l = livreurs[0];
      const totalNotes = (l.total_notes || 0) + 1;
      const sommeNotes = (l.somme_notes || 0) + note;
      await base44.entities.User.update(l.id, {
        total_notes: totalNotes,
        somme_notes: sommeNotes,
        note_moyenne: sommeNotes / totalNotes,
      });
    }
    toast.success("Merci pour votre avis !");
    setSaving(false);
    onDone?.();
  };

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Évaluer votre livreur</CardTitle>
        <p className="text-xs text-muted-foreground">{course.livreur_name}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Étoiles */}
        <div className="flex gap-1 justify-center">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onMouseEnter={() => setHovered(star)}
              onMouseLeave={() => setHovered(0)}
              onClick={() => setNote(star)}
              className="transition-transform hover:scale-110"
            >
              <Star
                className={`h-9 w-9 transition-colors ${
                  star <= (hovered || note)
                    ? "text-amber-400 fill-amber-400"
                    : "text-muted-foreground"
                }`}
              />
            </button>
          ))}
        </div>
        <p className="text-center text-sm font-medium text-amber-600">
          {note === 1 && "Très mauvais"}
          {note === 2 && "Mauvais"}
          {note === 3 && "Correct"}
          {note === 4 && "Bien"}
          {note === 5 && "Excellent !"}
        </p>
        {/* Commentaire */}
        <textarea
          className="w-full rounded-lg border border-input bg-background p-3 text-sm resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          rows={3}
          placeholder="Laissez un commentaire (optionnel)..."
          value={commentaire}
          onChange={(e) => setCommentaire(e.target.value)}
        />
        <Button className="w-full" onClick={soumettre} disabled={saving || note === 0}>
          {saving ? "Envoi..." : "Soumettre mon avis"}
        </Button>
      </CardContent>
    </Card>
  );
}