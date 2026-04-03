import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, CheckCircle2, AlertCircle, Lock } from "lucide-react";
import { toast } from "sonner";
import DocumentUploader from "@/components/DocumentUploader";

export default function CompleteProfile() {
  const { profileId } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [profileRecord, setProfileRecord] = useState(null);
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
          // Charger profil complet
          const profiles = await base44.entities.UserProfile.filter({ id: profileId });
          if (profiles && profiles[0]) {
            setProfileRecord(profiles[0]);
            if (response.data.profileType === "livreur") {
              const data = profiles[0].data_json ? JSON.parse(profiles[0].data_json) : {};
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

    if (!engagementChecked) {
      toast.error("Vous devez accepter les conditions pour continuer");
      return;
    }

    try {
      // Forcer engagement_accepted=true au moment de la soumission (source de vérité)
      const profiles = await base44.entities.UserProfile.filter({ id: profileId });
      const current = profiles[0];
      const data = (() => {
        try { return current?.data_json ? JSON.parse(current.data_json) : {}; } catch { return {}; }
      })();
      data.engagement_accepted = true;
      data.engagement_date = new Date().toISOString();

      await base44.entities.UserProfile.update(profileId, {
        status: "en_attente",
        refusal_reason: null,
        data_json: JSON.stringify(data),
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

  const isLivreur = analysis?.profileType === "livreur";
  const missingCount = analysis?.missing?.length || 0;
  const canSubmit = analysis?.isComplete;

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">Compléter mon profil</h1>
          <p className="text-xs text-muted-foreground">
            {analysis.completionPercentage}% complété
          </p>
        </div>
        {canSubmit && (
          <span className="text-[10px] bg-green-100 text-green-700 px-2 py-1 rounded-full font-semibold">✅ Prêt</span>
        )}
      </div>

      <div className="px-4 space-y-4">
        {/* Bandeau refus */}
        {profileRecord?.status === "refuse" && (
          <Card className="border-red-300 bg-red-50">
            <CardContent className="p-4 space-y-2">
              <p className="font-semibold text-red-800 text-sm">❌ Votre profil a été refusé</p>
              {profileRecord.refusal_reason && (
                <div className="p-2 rounded-lg bg-red-100 border border-red-200 text-xs text-red-700">
                  <span className="font-semibold">Motif :</span> {profileRecord.refusal_reason}
                </div>
              )}
              <p className="text-xs text-red-700">Corrigez les documents indiqués ci-dessous, puis cliquez sur "Renvoyer ma demande".</p>
            </CardContent>
          </Card>
        )}

        {/* Barre progression */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs mb-1">
            <span className="font-medium text-foreground">{analysis.received.length} / {analysis.received.length + analysis.missing.length} documents</span>
            <span className={`font-semibold ${canSubmit ? 'text-green-600' : 'text-amber-600'}`}>
              {canSubmit ? '✅ Complet' : `⚠️ ${missingCount} manquant${missingCount > 1 ? 's' : ''}`}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all ${canSubmit ? 'bg-green-500' : 'bg-primary'}`}
              style={{ width: `${analysis.completionPercentage}%` }}
            />
          </div>
        </div>

        {/* Alerte documents manquants */}
        {!canSubmit && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-300">
            <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              <span className="font-semibold">Veuillez ajouter tous les documents obligatoires avant de soumettre.</span><br />
              Il vous reste <strong>{missingCount} document{missingCount > 1 ? 's' : ''}</strong> à fournir.
            </p>
          </div>
        )}

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
            <p className="text-sm font-semibold flex items-center gap-2 text-red-700">
              <AlertCircle className="h-5 w-5 text-red-600" />
              Documents obligatoires manquants ({analysis.missing.length})
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

        {/* Bouton soumission — toujours visible */}
        <div className="pt-2 space-y-2">
          {canSubmit && (
            <p className="text-xs text-center text-green-700 font-medium">✅ Tous les documents sont fournis. Votre dossier est prêt !</p>
          )}
          <Button
            className={`w-full font-semibold h-12 ${canSubmit ? 'bg-green-600 hover:bg-green-700' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}
            disabled={!canSubmit}
            onClick={handleSubmitForValidation}
          >
            {!canSubmit && <Lock className="h-4 w-4 mr-2" />}
            {canSubmit
              ? (profileRecord?.status === "refuse" ? "🔄 Renvoyer ma demande" : "📩 Envoyer pour validation")
              : `Compléter les documents (${missingCount} manquant${missingCount > 1 ? 's' : ''})`
            }
          </Button>
          {!canSubmit && (
            <p className="text-[11px] text-center text-muted-foreground">
              Le bouton se débloquera automatiquement quand tous les documents seront ajoutés.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}