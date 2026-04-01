import { useState } from "react";
import { X, Download, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const DOCUMENT_LABELS = {
  photo_profil: { label: "Photo de profil", emoji: "🤳" },
  photo_identite_recto: { label: "CNI – Recto", emoji: "🪪" },
  photo_identite_verso: { label: "CNI – Verso", emoji: "🪪" },
  photo_moyen_deplacement: { label: "Moyen de déplacement", emoji: "🛵" },
};

export default function DocumentViewer({ profileData, profileType }) {
  const [selectedDoc, setSelectedDoc] = useState(null);

  if (!profileData || profileType !== 'livreur') return null;

  const docs = {};
  try {
    const parsed = typeof profileData === 'string' ? JSON.parse(profileData) : profileData;
    Object.keys(DOCUMENT_LABELS).forEach(key => {
      if (parsed[key]) docs[key] = parsed[key];
    });
  } catch (e) {
    console.warn('[DocumentViewer] Erreur parsing documents:', e);
    return null;
  }

  if (Object.keys(docs).length === 0) return null;

  return (
    <div className="space-y-2 mt-3 pt-3 border-t">
      <p className="text-xs font-semibold text-muted-foreground uppercase">📄 Documents fournis</p>
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(docs).map(([key, url]) => {
          const cfg = DOCUMENT_LABELS[key];
          return (
            <button
              key={key}
              onClick={() => setSelectedDoc({ key, url, label: cfg.label })}
              className="p-2 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors text-left"
            >
              <p className="text-xs font-medium text-blue-900">{cfg.emoji} {cfg.label}</p>
              <p className="text-[10px] text-blue-600">✓ Envoyé</p>
            </button>
          );
        })}
      </div>

      {/* Modal aperçu */}
      <Dialog open={!!selectedDoc} onOpenChange={() => setSelectedDoc(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>{selectedDoc?.label}</span>
            </DialogTitle>
          </DialogHeader>
          {selectedDoc?.url && (
            <div className="space-y-3">
              <div className="rounded-lg overflow-hidden bg-gray-100 max-h-96">
                <img
                  src={selectedDoc.url}
                  alt={selectedDoc.label}
                  className="w-full h-auto max-h-96 object-cover"
                  onError={(e) => {
                    e.target.style.display = 'none';
                  }}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 gap-2 text-xs"
                  onClick={() => window.open(selectedDoc.url, '_blank')}
                >
                  <Eye className="h-3 w-3" />
                  Voir pleine taille
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 gap-2 text-xs"
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = selectedDoc.url;
                    a.download = `${selectedDoc.label}.jpg`;
                    a.click();
                  }}
                >
                  <Download className="h-3 w-3" />
                  Télécharger
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}