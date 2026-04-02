import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, Check, X as XIcon, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

const TEST_PROFILES = ['client', 'livreur', 'partenaire', 'commercial'];

export default function TestPublicitesVisibilite() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [pubs, setPubs] = useState([]);
  const [visiblePubs, setVisiblePubs] = useState({});
  const [loading, setLoading] = useState(true);
  const [testResults, setTestResults] = useState({});

  useEffect(() => {
    const init = async () => {
      try {
        const me = await base44.auth.me();
        setCurrentUser(me);

        // Charger les pubs en base
        const allPubs = await base44.entities.Publicite.list('-created_date', 20);
        setPubs(allPubs);

        // Tester la visibilité pour chaque profil
        const results = {};
        for (const profile of TEST_PROFILES) {
          results[profile] = await testVisibilityForProfile(profile, allPubs);
        }
        setTestResults(results);
      } catch (err) {
        toast.error(`Erreur: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  const testVisibilityForProfile = async (profile, allPubs) => {
    try {
      const now = new Date().toISOString();

      // Simuler le filtre d'affichage
      const activePubs = allPubs.filter(p => {
        if (!p.active) return false;
        if (p.date_debut && p.date_fin) {
          const start = new Date(p.date_debut);
          const end = new Date(p.date_fin);
          return start <= new Date(now) && new Date(now) <= end;
        }
        return true;
      });

      // Pubs sans restriction de rôle (destinataires vide ou 'tous')
      const unrestricted = activePubs.filter(p => !p.destinataires || p.destinataires === 'tous' || p.destinataires === '');

      // Pubs ciblées pour ce profil
      const targetedMap = {
        client: 'clients',
        livreur: 'livreurs',
        partenaire: 'partenaires',
        commercial: 'commerciaux',
      };

      const targeted = activePubs.filter(p => {
        if (!p.destinataires) return false;
        return p.destinataires.includes(targetedMap[profile]);
      });

      const visible = [...unrestricted, ...targeted];
      return {
        totalActive: activePubs.length,
        unrestricted: unrestricted.length,
        targeted: targeted.length,
        visible: visible.length,
        pubIds: visible.map(p => ({ id: p.id, titre: p.titre || '(sans titre)', destinataires: p.destinataires || 'tous' })),
      };
    } catch (err) {
      return {
        error: err.message,
        totalActive: 0,
        visible: 0,
      };
    }
  };

  const testRealTimeSync = async () => {
    try {
      // Créer une pub de test
      const testPub = await base44.entities.Publicite.create({
        titre: `TEST TEMPS RÉEL - ${new Date().toLocaleTimeString()}`,
        image_url: 'https://via.placeholder.com/300x200?text=TEST',
        placement: 'toutes_pages',
        active: true,
        date_debut: new Date().toISOString().split('T')[0],
        date_fin: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        impressions: 0,
        clics: 0,
      });

      toast.success(`✅ Pub TEST créée: ${testPub.id}`);

      // Recharger
      setTimeout(async () => {
        const allPubs = await base44.entities.Publicite.list('-created_date', 20);
        setPubs(allPubs);
      }, 500);
    } catch (err) {
      toast.error(`Erreur création: ${err.message}`);
    }
  };

  const testDatabaseConsistency = async () => {
    try {
      const activePubs = pubs.filter(p => p.active);
      const summary = {
        totalInDb: pubs.length,
        active: activePubs.length,
        withoutDates: activePubs.filter(p => !p.date_debut || !p.date_fin).length,
        withoutImage: activePubs.filter(p => !p.image_url).length,
      };

      console.log('📊 DB Summary:', summary);
      toast.info(`📊 ${summary.active} pubs actives en base de données`);
    } catch (err) {
      toast.error(`Erreur BD: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-bold">Test Visibilité Publicités</h1>
      </div>

      {/* User courant */}
      <Card>
        <CardContent className="p-4 text-sm">
          <p>
            <strong>Utilisateur courant:</strong> {currentUser?.email} ({currentUser?.role})
          </p>
          <p className="text-muted-foreground text-xs mt-1">
            Note: Ce test simule la visibilité pour chaque profil. Faire test réel en changeant de compte.
          </p>
        </CardContent>
      </Card>

      {/* Boutons action */}
      <div className="flex gap-2">
        <Button onClick={testRealTimeSync} className="flex-1 bg-blue-600 hover:bg-blue-700">
          Créer pub TEST
        </Button>
        <Button onClick={testDatabaseConsistency} variant="outline" className="flex-1">
          Vérifier BD
        </Button>
      </div>

      {/* Résumé pubs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Publicités en base de données</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm font-semibold text-primary">{pubs.length} total</p>
          <p className="text-xs text-muted-foreground">
            {pubs.filter(p => p.active).length} actives · {pubs.filter(p => !p.active).length} inactives
          </p>
        </CardContent>
      </Card>

      {/* Test par profil */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm">Visibilité par profil</h3>
        {TEST_PROFILES.map(profile => {
          const result = testResults[profile];
          if (!result) return null;

          const isHealthy = result.visible > 0 && !result.error;
          return (
            <Card key={profile} className={`border-2 ${isHealthy ? 'border-green-200 bg-green-50/30' : 'border-red-200 bg-red-50/30'}`}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm capitalize">{profile}</span>
                  {isHealthy ? (
                    <Check className="h-5 w-5 text-green-600" />
                  ) : (
                    <XIcon className="h-5 w-5 text-red-600" />
                  )}
                </div>

                {result.error ? (
                  <p className="text-xs text-red-700">{result.error}</p>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="text-center">
                        <p className="font-bold">{result.totalActive}</p>
                        <p className="text-muted-foreground">Actives</p>
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-blue-600">{result.unrestricted}</p>
                        <p className="text-muted-foreground">Sans filtre</p>
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-green-600">{result.visible}</p>
                        <p className="text-muted-foreground">Visibles</p>
                      </div>
                    </div>

                    {result.visible > 0 && (
                      <div className="mt-2 space-y-1 text-xs">
                        {result.pubIds.slice(0, 3).map(p => (
                          <div key={p.id} className="bg-white/50 p-1.5 rounded text-[10px]">
                            <p className="font-medium truncate">{p.titre}</p>
                            <p className="text-muted-foreground">Pour: {p.destinataires}</p>
                          </div>
                        ))}
                        {result.pubIds.length > 3 && (
                          <p className="text-muted-foreground text-[10px]">+{result.pubIds.length - 3} autres</p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Checklist de test réel */}
      <Card className="border-yellow-200 bg-yellow-50/30">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4" /> Checklist Test Réel
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <div>
            <p className="font-semibold">✅ À tester manuellement:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground mt-1">
              <li>Publier une pub → Admin panel</li>
              <li>Se déconnecter → Se reconnecter AVEC compte CLIENT</li>
              <li>Vérifier que la pub est visible sur HOME/dashboard</li>
              <li>Faire la même chose avec LIVREUR, PARTENAIRE, COMMERCIAL</li>
              <li>Chaque profil doit voir la pub IMMÉDIATEMENT</li>
              <li>Tester dans APP WEB et APK Android</li>
            </ul>
          </div>
          <div className="mt-3">
            <p className="font-semibold">🔍 Points de vérification:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground mt-1">
              <li>Pub n'est PAS filtrée par rôle si "Destinataires" = vide ou "tous"</li>
              <li>Pub avec "destinataires" spécifiques n'apparaît qu'à ces rôles</li>
              <li>Dates valides (aujourd'hui entre début/fin)</li>
              <li>Status = active en base de données</li>
              <li>Pas de cache bloquant le refresh</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}