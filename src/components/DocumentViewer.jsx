import { useState } from "react";
import { Download, Eye, CheckCircle2, XCircle, ShieldCheck, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import moment from "moment";

// Liste canonique des documents livreur requis
const REQUIRED_DOCS = [
  { key: "photo_profil",          label: "Photo de profil",   emoji: "🤳", required: true },
  { key: "photo_identite_recto",  label: "CNI – Recto",       emoji: "🪪", required: true },
  { key: "photo_identite_verso",  label: "CNI – Verso",       emoji: "🪪", required: true },
  { key: "photo_moyen_deplacement", label: "Véhicule / Moto", emoji: "🛵", required: true },
];

/**
 * Construit une map unifiée des documents depuis :
 * - les champs directs de l'objet user (legacy)
 * - le documents_json du profil UserProfile (nouveau système)
 */
function buildUnifiedDocs(user, livreurProfile) {
  const map = {};

  // 1. Champs directs sur user (legacy)
  if (user?.photo_profil)          map.photo_profil = user.photo_profil;
  if (user?.photo_identite_recto)  map.photo_identite_recto = user.photo_identite_recto;
  if (user?.photo_identite_verso)  map.photo_identite_verso = user.photo_identite_verso;
  // Normaliser photo_moto → photo_moyen_deplacement
  if (user?.photo_moto)            map.photo_moyen_deplacement = user.photo_moto;
  if (user?.photo_moyen_deplacement) map.photo_moyen_deplacement = user.photo_moyen_deplacement;

  // 2. documents_json du profil (prioritaire — source de vérité principale)
  if (livreurProfile?.documents_json) {
    try {
      const parsed = typeof livreurProfile.documents_json === "string"
        ? JSON.parse(livreurProfile.documents_json)
        : livreurProfile.documents_json;
      // Écraser les valeurs legacy si présentes dans documents_json
      if (parsed.photo_profil)          map.photo_profil = parsed.photo_profil;
      if (parsed.photo_identite_recto)  map.photo_identite_recto = parsed.photo_identite_recto;
      if (parsed.photo_identite_verso)  map.photo_identite_verso = parsed.photo_identite_verso;
      if (parsed.photo_moyen_deplacement) map.photo_moyen_deplacement = parsed.photo_moyen_deplacement;
      // Alias éventuels
      if (parsed.photo_moto && !map.photo_moyen_deplacement) map.photo_moyen_deplacement = parsed.photo_moto;
    } catch (_) {}
  }

  return map;
}

/**
 * Lit l'engagement depuis data_json du profil
 */
function getEngagement(livreurProfile) {
  if (!livreurProfile?.data_json) return null;
  try {
    const data = typeof livreurProfile.data_json === "string"
      ? JSON.parse(livreurProfile.data_json)
      : livreurProfile.data_json;
    return {
      accepted: !!data.engagement_accepted,
      date: data.engagement_date || livreurProfile.created_date,
    };
  } catch (_) {
    return null;
  }
}

/**
 * Props:
 *  - user : objet User complet
 *  - profiles : tableau de UserProfile
 *  - profileType : string (n'affiche que pour 'livreur')
 *
 * Compatibilité legacy :
 *  - profileData (string JSON) + profileType → ancienne API conservée
 */
export default function DocumentViewer({ user, profiles, profileData, profileType }) {
  const [selectedDoc, setSelectedDoc] = useState(null);

  if (profileType && profileType !== "livreur") return null;

  // Résoudre le profil livreur
  const livreurProfile = profiles?.find(p => p.profile_type === "livreur")
    || (profileData ? { documents_json: profileData } : null);

  // Construire la source unifiée
  const docs = buildUnifiedDocs(user, livreurProfile);
  const engagement = getEngagement(livreurProfile);

  const allMissing = REQUIRED_DOCS.every(d => !docs[d.key]);
  // Si pas de profil livreur du tout, ne rien afficher
  if (!livreurProfile && allMissing) return null;

  const missingCount = REQUIRED_DOCS.filter(d => !docs[d.key]).length;
  const isComplete = missingCount === 0 && engagement?.accepted;

  return (
    <div className="space-y-3">
      {/* En-tête statut global */}
      <div className={`flex items-center justify-between px-3 py-2 rounded-lg border ${isComplete ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
        <p className="text-xs font-semibold">
          {isComplete ? '✅ Dossier complet' : `⚠️ ${missingCount > 0 ? `${missingCount} document(s) manquant(s)` : 'Engagement non accepté'}`}
        </p>
        <span className="text-[10px] text-muted-foreground">
          {REQUIRED_DOCS.length - missingCount}/{REQUIRED_DOCS.length} docs
        </span>
      </div>

      {/* Liste unifiée des documents requis */}
      <div className="grid grid-cols-2 gap-2">
        {REQUIRED_DOCS.map(doc => {
          const url = docs[doc.key];
          return (
            <div
              key={doc.key}
              onClick={() => url && setSelectedDoc({ label: doc.label, url })}
              className={`rounded-xl border-2 overflow-hidden ${url ? 'border-green-300 cursor-pointer hover:shadow-md transition-shadow' : 'border-red-200'}`}
            >
              {url ? (
                <div className="relative">
                  <img
                    src={url}
                    alt={doc.label}
                    className="w-full h-20 object-cover"
                    onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                  />
                  <div className="hidden h-20 bg-green-50 items-center justify-center text-2xl">{doc.emoji}</div>
                  <div className="absolute top-1 right-1">
                    <CheckCircle2 className="h-4 w-4 text-green-600 bg-white rounded-full" />
                  </div>
                </div>
              ) : (
                <div className="h-20 bg-red-50 flex flex-col items-center justify-center gap-1">
                  <XCircle className="h-5 w-5 text-red-400" />
                  <span className="text-[10px] text-red-500">Manquant</span>
                </div>
              )}
              <div className={`px-2 py-1 ${url ? 'bg-green-50' : 'bg-red-50'}`}>
                <p className="text-[10px] font-semibold truncate">{doc.emoji} {doc.label}</p>
                <p className={`text-[9px] font-medium ${url ? 'text-green-600' : 'text-red-500'}`}>
                  {url ? '✓ Fourni' : '✗ Non fourni'}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bloc engagement */}
      <Card className={`border-2 ${engagement?.accepted ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
        <CardContent className="p-3 flex items-start gap-3">
          {engagement?.accepted
            ? <ShieldCheck className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
            : <ShieldX className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          }
          <div className="flex-1">
            <p className={`text-sm font-semibold ${engagement?.accepted ? 'text-green-800' : 'text-red-700'}`}>
              Engagement CDL : {engagement?.accepted ? 'Accepté ✅' : 'Non accepté ❌'}
            </p>
            {engagement?.accepted && engagement.date && (
              <p className="text-[10px] text-green-700 mt-0.5">
                Accepté le {moment(engagement.date).format("DD/MM/YYYY à HH:mm")}
              </p>
            )}
            {!engagement?.accepted && (
              <p className="text-[10px] text-red-600 mt-0.5 font-medium">
                ⚠️ Le livreur n'a pas encore accepté les conditions d'utilisation CDL.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Alerte non validable si engagement manquant */}
      {!engagement?.accepted && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-red-100 border border-red-300">
          <XCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
          <p className="text-xs text-red-700 font-semibold">Ce profil ne peut pas être validé tant que l'engagement n'est pas accepté.</p>
        </div>
      )}

      {/* Modal aperçu plein écran */}
      <Dialog open={!!selectedDoc} onOpenChange={() => setSelectedDoc(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedDoc?.label}</DialogTitle>
          </DialogHeader>
          {selectedDoc?.url && (
            <div className="space-y-3">
              <div className="rounded-xl overflow-hidden bg-gray-100 max-h-[60vh] flex items-center justify-center">
                <img
                  src={selectedDoc.url}
                  alt={selectedDoc.label}
                  className="max-w-full max-h-[60vh] object-contain"
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1 gap-2 text-xs"
                  onClick={() => window.open(selectedDoc.url, '_blank')}>
                  <Eye className="h-3 w-3" /> Pleine taille
                </Button>
                <Button size="sm" variant="outline" className="flex-1 gap-2 text-xs"
                  onClick={() => { const a = document.createElement('a'); a.href = selectedDoc.url; a.download = `${selectedDoc.label}.jpg`; a.click(); }}>
                  <Download className="h-3 w-3" /> Télécharger
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}