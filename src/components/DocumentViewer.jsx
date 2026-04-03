import { useState } from "react";
import { Download, Eye, ZoomIn, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import moment from "moment";

// Source de vérité unique pour les clés et libellés de documents livreur
export const DOCS_CONFIG = [
  { key: "photo_profil",           label: "Photo de profil",      emoji: "🤳", required: true },
  { key: "photo_identite_recto",   label: "CNI – Recto",          emoji: "🪪", required: true },
  { key: "photo_identite_verso",   label: "CNI – Verso",          emoji: "🪪", required: true },
  { key: "photo_moyen_deplacement",label: "Moyen de déplacement", emoji: "🛵", required: true },
  { key: "permis",                 label: "Permis de conduire",   emoji: "📋", required: false },
  { key: "carte_grise",            label: "Carte grise",          emoji: "📄", required: false },
];

// Résoudre les anciens noms legacy → nouveaux noms
const LEGACY_MAP = {
  photo_moto: "photo_moyen_deplacement",
  photo_vehicle: "photo_moyen_deplacement",
  cni_recto: "photo_identite_recto",
  cni_verso: "photo_identite_verso",
  cnib_recto: "photo_identite_recto",
  cnib_verso: "photo_identite_verso",
  selfie: "photo_profil",
};

function parseAndNormalizeDocs(documentsJson, userObj) {
  const docs = {};

  // 1. Lire documents_json (source principale)
  if (documentsJson) {
    try {
      const parsed = typeof documentsJson === "string" ? JSON.parse(documentsJson) : documentsJson;
      Object.entries(parsed).forEach(([k, v]) => {
        if (!v) return;
        const normalKey = LEGACY_MAP[k] || k;
        docs[normalKey] = v;
      });
    } catch {}
  }

  // 2. Fallback : lire les champs legacy sur l'objet user si pas encore dans docs
  if (userObj) {
    const legacyFields = {
      photo_profil: userObj.photo_profil,
      photo_identite_recto: userObj.photo_identite_recto,
      photo_identite_verso: userObj.photo_identite_verso,
      photo_moyen_deplacement: userObj.photo_moto || userObj.photo_moyen_deplacement,
    };
    Object.entries(legacyFields).forEach(([k, v]) => {
      if (v && !docs[k]) docs[k] = v;
    });
  }

  return docs;
}

export default function DocumentViewer({ profileData, dataJson, profileType, userObj, profileStatus, onValidationBlock }) {
  const [selectedDoc, setSelectedDoc] = useState(null);

  if (profileType !== "livreur") return null;

  const docs = parseAndNormalizeDocs(profileData, userObj);

  // Engagement
  let engagement = null;
  if (dataJson) {
    try {
      const parsed = typeof dataJson === "string" ? JSON.parse(dataJson) : dataJson;
      engagement = parsed;
    } catch {}
  }
  // Un profil soumis (en_attente, actif, refuse) implique que l'engagement a forcément été accepté
  const SUBMITTED_STATUSES = ["en_attente", "actif", "refuse"];
  const inferredAccepted = SUBMITTED_STATUSES.includes(profileStatus);
  const engagementAccepted = !!engagement?.engagement_accepted || inferredAccepted;
  const engagementDate = engagement?.engagement_date || engagement?.accepted_at;

  const requiredDocs = DOCS_CONFIG.filter(d => d.required);
  const optionalDocs = DOCS_CONFIG.filter(d => !d.required && docs[d.key]);

  const missingRequired = requiredDocs.filter(d => !docs[d.key]);
  const isComplete = missingRequired.length === 0 && engagementAccepted;

  return (
    <div className="space-y-4">

      {/* Engagement */}
      <div className={`p-3 rounded-xl border-2 ${engagementAccepted ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}>
        <div className="flex items-center gap-2">
          {engagementAccepted
            ? <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
            : <XCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
          }
          <div>
            <p className={`text-sm font-semibold ${engagementAccepted ? "text-green-800" : "text-red-800"}`}>
              Engagement CDL : {engagementAccepted ? "✅ Accepté" : "❌ Non accepté"}
            </p>
            {engagementAccepted && engagementDate && (
              <p className="text-[10px] text-green-700">le {moment(engagementDate).format("DD/MM/YYYY à HH:mm")}</p>
            )}
            {!engagementAccepted && (
              <p className="text-xs text-red-700 mt-0.5">⚠️ La validation est bloquée tant que le livreur n'a pas accepté les conditions.</p>
            )}
          </div>
        </div>
      </div>

      {/* Alerte dossier incomplet */}
      {missingRequired.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-xl border border-amber-300 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">
            <span className="font-semibold">Dossier incomplet.</span> {missingRequired.length} document{missingRequired.length > 1 ? "s" : ""} manquant{missingRequired.length > 1 ? "s" : ""} :{" "}
            {missingRequired.map(d => d.label).join(", ")}.
          </p>
        </div>
      )}

      {/* Documents obligatoires */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Documents obligatoires ({requiredDocs.length - missingRequired.length}/{requiredDocs.length})</p>
        <div className="grid grid-cols-2 gap-2">
          {requiredDocs.map(cfg => {
            const url = docs[cfg.key];
            return (
              <div
                key={cfg.key}
                className={`rounded-xl border-2 overflow-hidden ${url ? "border-green-300 bg-green-50" : "border-red-200 bg-red-50"}`}
              >
                {/* Aperçu image */}
                {url ? (
                  <div
                    className="relative cursor-pointer group"
                    onClick={() => setSelectedDoc({ key: cfg.key, url, label: cfg.label })}
                  >
                    <img
                      src={url}
                      alt={cfg.label}
                      className="w-full h-24 object-cover"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                      <ZoomIn className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-all" />
                    </div>
                  </div>
                ) : (
                  <div className="h-24 flex items-center justify-center bg-red-100">
                    <XCircle className="h-8 w-8 text-red-400" />
                  </div>
                )}
                {/* Label + statut */}
                <div className="p-2">
                  <p className="text-[10px] font-semibold text-foreground truncate">{cfg.emoji} {cfg.label}</p>
                  {url
                    ? <p className="text-[10px] text-green-700 font-medium">✅ Fourni</p>
                    : <p className="text-[10px] text-red-700 font-medium">❌ Manquant</p>
                  }
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Documents optionnels fournis */}
      {optionalDocs.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Documents optionnels</p>
          <div className="grid grid-cols-2 gap-2">
            {optionalDocs.map(cfg => {
              const url = docs[cfg.key];
              return (
                <div
                  key={cfg.key}
                  className="rounded-xl border-2 border-blue-200 bg-blue-50 overflow-hidden cursor-pointer"
                  onClick={() => setSelectedDoc({ key: cfg.key, url, label: cfg.label })}
                >
                  <div className="relative group">
                    <img src={url} alt={cfg.label} className="w-full h-24 object-cover" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                      <ZoomIn className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-all" />
                    </div>
                  </div>
                  <div className="p-2">
                    <p className="text-[10px] font-semibold truncate">{cfg.emoji} {cfg.label}</p>
                    <p className="text-[10px] text-blue-700">✅ Fourni</p>
                  </div>
                </div>
              );
            })}
          </div>
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
                <Button size="sm" variant="outline" className="flex-1 gap-1.5 text-xs"
                  onClick={() => window.open(selectedDoc.url, "_blank")}>
                  <Eye className="h-3 w-3" /> Pleine taille
                </Button>
                <Button size="sm" variant="outline" className="flex-1 gap-1.5 text-xs"
                  onClick={() => { const a = document.createElement("a"); a.href = selectedDoc.url; a.download = `${selectedDoc.label}.jpg`; a.click(); }}>
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