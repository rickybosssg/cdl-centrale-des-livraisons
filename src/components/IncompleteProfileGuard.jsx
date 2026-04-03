import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { AlertCircle, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function IncompleteProfileGuard({ user, profile }) {
  const navigate = useNavigate();
  const [issues, setIssues] = useState([]);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!profile?.id) return;

    const check = async () => {
      try {
        const res = await base44.functions.invoke('validateProfileCompletion', {
          profile_id: profile.id,
        });

        if (res.data?.issues?.length > 0) {
          setIssues(res.data.issues);
        } else {
          setChecking(false);
        }
      } catch (err) {
        console.error('[IncompleteProfileGuard]', err);
        setChecking(false);
      }
    };

    check();
  }, [profile?.id]);

  // Si profil complet ou en attente validation, laisser passer
  if (!checking && issues.length === 0) return null;

  if (profile?.status !== 'incomplet') return null;

  const ISSUE_MESSAGES = {
    missing_data: '📋 Informations personnelles manquantes',
    missing_contact: '📞 Nom ou téléphone manquant',
    missing_transport: '🏍️ Moyen de transport non défini',
    missing_commerce: '🏪 Infos commerce manquantes',
    missing_documents: '📄 Aucun document fourni',
    missing_livreur_docs: '🆔 Photo profil + ID requises',
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full space-y-4 p-6">
        <div className="flex items-center gap-3">
          <AlertCircle className="h-6 w-6 text-amber-600" />
          <h2 className="font-bold text-lg">Profil incomplet</h2>
        </div>

        <p className="text-sm text-muted-foreground">
          Votre profil de {profile?.profile_type} nécessite des informations avant de pouvoir l'utiliser.
        </p>

        {issues.length > 0 && (
          <div className="space-y-2 bg-amber-50 p-3 rounded-lg border border-amber-200">
            {issues.map((issue) => (
              <div key={issue} className="flex items-start gap-2 text-sm text-amber-900">
                <FileText className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{ISSUE_MESSAGES[issue] || issue}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => navigate('/')}
          >
            Retour
          </Button>
          <Button
            className="flex-1"
            onClick={() => navigate(`/complete-profile/${profile.id}`)}
          >
            Compléter
          </Button>
        </div>
      </div>
    </div>
  );
}