import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import DocumentUploader from "@/components/DocumentUploader";

export default function CompleteProfile() {
  const { profileId } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState({});
  const [engagementChecked, setEngagementChecked] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await base44.functions.invoke("getMissingDocuments", {
          profileId,
        });

        if (response.data?.success) {
          setProfile(response.data);
          setAnalysis(response.data);
          // Charger état engagement
          if (response.data.profileType === "livreur") {
            const profiles = await base44.entities.UserProfile.filter({ id: profileId });
            if (profiles && profiles[0]) {
              const data = profiles[0].data_json
                ? JSON.parse(profiles[0].data_json)
                : {};
              setEngagementChecked(!!data.engagement_accepted);
            }
          }
        } else {
          toast.error(response.data?.error || "Erreur");
        }
      } catch (err) {
        toast.error("Erreur: " + err.message);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [profileId]);

  const handleUpload = async (docKey, docLabel, file) => {
    if (!file) return;

    setUploading(prev => ({ ...prev, [docKey]: true }));
    try {
      // Upload fichier
      const uploadRes = await base44.integrations.Core.UploadFile({ file });
      const fileUrl = uploadRes.file_url;

      // Récupérer profil actuel
      const profiles = await base44.entities.UserProfile.filter({ id: profileId });
      if (!profiles || profiles.length === 0) {
        toast.error("Profil introuvable");
        return;
      }

      const current = profiles[0];
      const docs = (() => {
        try {
          return current.documents_json ? JSON.parse(current.documents_json) : {};
        } catch {
          return {};
        }
      })();

      // Ajouter nouveau document
      docs[docKey] = fileUrl;

      // Mettre à jour profil
      await base44.entities.UserProfile.update(profileId, {
        documents_json: JSON.stringify(docs),
      });

      toast.success(`✅ ${docLabel} ajouté`);

      // Rafraîchir analyse
      const newResponse = await base44.functions.invoke("getMissingDocuments", {
        profileId,
      });
      if (newResponse.data?.success) {
        setAnalysis(newResponse.data);
      }
    } catch (err) {
      toast.error("Erreur upload: " + err.message);
    } finally {
      setUploading(prev => ({ ...prev, [docKey]: false }));
    }
  };

  const handleEngagementChange = async (checked) => {
    try {
      const profiles = await base44.entities.UserProfile.filter({ id: profileId });
      if (!profiles || profiles.length === 0) return;

      const current = profiles[0];
      const data = (() => {
        try {
          return current.data_json ? JSON.parse(current.data_json) : {};
        } catch {
          return {};
        }
      })();

      data.engagement_accepted = checked;

      await base44.entities.UserProfile.update(profileId, {
        data_json: JSON.stringify(data),
      });

      setEngagementChecked(checked);
      toast.success(checked ? "✅ Conditions acceptées" : "Conditions retirées");

      // Rafraîchir
      const newResponse = await base44.functions.invoke("getMissingDocuments", {
        profileId,
      });
      if (newResponse.data?.success) {
        setAnalysis(newResponse.data);
      }
    } catch (err) {
      toast.error("Erreur: " + err.message);
    }
  };

  const handleSubmitForValidation = async () => {
    if (!analysis || !analysis.isComplete) {
      toast.error("Veuillez compléter tous les documents");
      return;
    }

    try {
      await base44.entities.UserProfile.update(profileId, {
        status: "en_attente",
      });

      toast.success("✅ Dossier envoyé pour validation");
      setTimeout(() => navigate("/settings"), 1500);
    } catch (err) {
      toast.error("Erreur: " + err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="space-y-4 p-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <p className="text-center text-muted-foreground">Profil non trouvé</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-lg font-bold">Compléter mon profil</h1>
          <p className="text-xs text-muted-foreground">
            {analysis.completionPercentage}% complété
          </p>
        </div>
      </div>

      <div className="px-4 space-y-4">
        {/* Barre progression */}
        <div className="space-y-2">
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all"
              style={{ width: `${analysis.completionPercentage}%` }}
            />
          </div>
          <p className="text-xs text-center text-muted-foreground">
            {analysis.received.length}/{analysis.received.length + analysis.missing.length} documents
          </p>
        </div>

        {/* Documents reçus */}
        {analysis.received.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Documents reçus ({analysis.received.length})
            </p>
            {analysis.received.map(doc => (
              <Card key={doc.key} className="border-green-200 bg-green-50">
                <CardContent className="p-4 space-y-3">
                  <div>
                    <p className="font-medium text-sm">{doc.label}</p>
                    <p className="text-[10px] text-green-700">✅ Validé</p>
                  </div>
                  <DocumentUploader
                    docKey={doc.key}
                    docLabel={doc.label}
                    onUpload={handleUpload}
                    disabled={uploading[doc.key]}
                    preview={doc.url}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Documents manquants */}
        {analysis.missing.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-semibold flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              Pièces manquantes ({analysis.missing.length})
            </p>
            {analysis.missing.map(doc => {
              if (doc.type === "checkbox") {
                return (
                  <Card key={doc.key} className="border-red-200 bg-red-50">
                    <CardContent className="p-4 space-y-3">
                      <p className="font-medium text-sm">{doc.label}</p>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={engagementChecked}
                          onChange={e => handleEngagementChange(e.target.checked)}
                          className="w-4 h-4"
                        />
                        <span className="text-xs text-muted-foreground">
                          J'accepte les conditions d'utilisation CDL
                        </span>
                      </label>
                    </CardContent>
                  </Card>
                );
              }

              return (
                <Card key={doc.key} className="border-red-200 bg-red-50">
                  <CardContent className="p-4 space-y-3">
                    <div>
                      <p className="font-medium text-sm">{doc.label}</p>
                      <p className="text-[10px] text-red-700">❌ Manquant</p>
                    </div>
                    <DocumentUploader
                      docKey={doc.key}
                      docLabel={doc.label}
                      onUpload={handleUpload}
                      disabled={uploading[doc.key]}
                      preview={null}
                    />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Message complétude */}
        {analysis.isComplete && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="p-4 space-y-3">
              <p className="font-semibold text-green-900">✅ Dossier complet !</p>
              <p className="text-xs text-green-800">
                Tous les documents obligatoires ont été fournis. Vous pouvez envoyer votre dossier pour validation par l'équipe CDL.
              </p>
              <Button
                className="w-full bg-green-600 hover:bg-green-700"
                onClick={handleSubmitForValidation}
              >
                📩 Envoyer pour validation
              </Button>
            </CardContent>
          </Card>
        )}

        {!analysis.isComplete && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-4">
              <p className="text-xs text-amber-800">
                ⏳ Complétez tous les documents manquants pour envoyer votre dossier
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}