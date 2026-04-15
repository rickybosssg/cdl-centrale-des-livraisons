import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Plus, TrendingUp, Eye, Calendar, AlertCircle, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BedouWidget from "@/components/BedouWidget";
import moment from "moment";

export default function DashboardAnnonceur({ user }) {
  const navigate = useNavigate();
  const [userProfile, setUserProfile] = useState(null);
  const [annonceur, setAnnonceur] = useState(null);
  const [pubs, setPubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        if (!user?.email) {
          setError('Utilisateur non authentifié');
          setLoading(false);
          return;
        }

        // Récupérer le profil utilisateur annonceur
        const userProfiles = await base44.entities.UserProfile.filter({
          user_email: user.email,
          profile_type: 'annonceur',
          deleted: false,
        }, "-created_date", 1);
        
        if (userProfiles && userProfiles.length > 0) {
          setUserProfile(userProfiles[0]);
        }

        // Récupérer le profil annonceur (entité Annonceur)
        const ann = await base44.entities.Annonceur.filter({ user_email: user.email }, "-created_date", 1);
        if (ann && ann.length > 0) {
          setAnnonceur(ann[0]);
        }

        // Récupérer les pubs
        const pubsData = await base44.entities.Publicite.filter(
          { created_by: user.email },
          "-created_date",
          100
        );
        setPubs(pubsData || []);
      } catch (e) {
        console.error("[DashboardAnnonceur] Error:", e);
        setError('Erreur lors du chargement des données');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.email]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // CAS 1 : Erreur
  if (error) {
    return (
      <div className="text-center py-12 space-y-4">
        <p className="text-red-600 font-semibold">{error}</p>
        <Button onClick={() => window.location.reload()}>Réessayer</Button>
      </div>
    );
  }

  // CAS 2 : Aucun profil annonceur (ni UserProfile ni Annonceur)
  if (!userProfile && !annonceur) {
    return (
      <div className="space-y-6 pb-20 max-w-md mx-auto pt-12">
        <div className="text-center space-y-4">
          <div className="text-5xl">📢</div>
          <h1 className="text-2xl font-bold">Devenir Annonceur</h1>
          <p className="text-muted-foreground">Publiez vos annonces sur CDL et atteignez des milliers d'utilisateurs</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => navigate(-1)}>Retour</Button>
          <Button className="flex-1" onClick={() => navigate('/settings')}>Faire une demande</Button>
        </div>
      </div>
    );
  }

  // CAS 3 : Profil en attente de validation
  if (userProfile?.status === 'en_attente') {
    return (
      <div className="space-y-6 pb-20 max-w-md mx-auto pt-12">
        <div className="text-center space-y-4">
          <div className="text-5xl">⏳</div>
          <h1 className="text-2xl font-bold">Demande en cours</h1>
          <p className="text-muted-foreground">Votre demande de profil annonceur est actuellement examinée par l'équipe CDL. Vous serez notifié dès validation.</p>
        </div>
        <Button className="w-full" onClick={() => navigate(-1)}>Retour à l'accueil</Button>
      </div>
    );
  }

  // CAS 4 : Profil refusé
  if (userProfile?.status === 'refuse') {
    return (
      <div className="space-y-6 pb-20 max-w-md mx-auto pt-12">
        <div className="text-center space-y-4">
          <div className="text-5xl">❌</div>
          <h1 className="text-2xl font-bold">Demande refusée</h1>
          <p className="text-muted-foreground">Votre demande annonceur a été refusée.</p>
          {userProfile?.refusal_reason && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-700"><strong>Motif :</strong> {userProfile.refusal_reason}</p>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => navigate(-1)}>Retour</Button>
          <Button className="flex-1" onClick={() => navigate('/settings')}>Renouveler demande</Button>
        </div>
      </div>
    );
  }

  // CAS 5 : Profil validé (afficher le dashboard)
  if (userProfile?.status === 'actif' || annonceur) {

    const pubsValides = pubs.filter(p => p.statut === "validée");
    const pubsEnAttente = pubs.filter(p => p.statut === "en_attente");
    const pubsExpires = pubs.filter(p => p.statut === "expirée");
    const totalDepense = pubs
      .filter(p => ["validée", "expirée"].includes(p.statut))
      .reduce((s, p) => s + (p.cout || 5000), 0);

    return (
      <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Mon espace Annonceur 📢</h1>
        <p className="text-sm text-muted-foreground">Créez et gérez vos publicités CDL</p>
      </div>

      {/* Bedou */}
      <BedouWidget user={user} />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <TrendingUp className="h-5 w-5 text-primary mx-auto mb-1" />
            <p className="text-xl font-bold">{pubs.length}</p>
            <p className="text-[10px] text-muted-foreground">Publicités créées</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Eye className="h-5 w-5 text-blue-600 mx-auto mb-1" />
            <p className="text-xl font-bold">{pubs.filter(p => p.active).length}</p>
            <p className="text-[10px] text-muted-foreground">Actives</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <DollarSign className="h-5 w-5 text-amber-600 mx-auto mb-1" />
            <p className="text-lg font-bold">{pubs.filter(p => ["validée", "expirée"].includes(p.statut)).reduce((s, p) => s + (p.cout || 5000), 0).toLocaleString()}F</p>
            <p className="text-[10px] text-muted-foreground">Dépensé</p>
          </CardContent>
        </Card>
      </div>

      {/* Boutons d'action */}
      <div className="grid grid-cols-2 gap-3">
        <Link to="/creer-publicite" className="flex-1">
          <Button className="w-full gap-2 py-6">
            <Plus className="h-5 w-5" />
            Créer
          </Button>
        </Link>
        <Link to="/mes-publicites-annonceur" className="flex-1">
          <Button variant="outline" className="w-full gap-2 py-6">
            <Eye className="h-5 w-5" />
            Mes pubs
          </Button>
        </Link>
      </div>
      </div>
    );
  }

  // Fallback (ne devrait jamais arriver ici)
  return (
    <div className="text-center py-12">
      <p className="text-muted-foreground mb-4">État annonceur indéterminé</p>
      <Button onClick={() => navigate(-1)}>Retour</Button>
    </div>
  );
}