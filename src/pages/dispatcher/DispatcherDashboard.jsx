import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useMessageCount } from "@/hooks/useMessageCount";
import { useMessageNotification } from "@/hooks/useMessageNotification";
import MessageAlert from "@/components/MessageAlert";
import { Package, Users, TrendingUp, Clock, BarChart3, Settings, ShieldCheck, CreditCard, Megaphone, Store, Tag, Database, Bell, Truck, Trash2, Wallet, Radio, AlertCircle, Activity } from "lucide-react";
import MapLivreursActifs from "../../components/MapLivreursActifs";
import { getDispatchMode, setDispatchMode } from "@/lib/dispatch";
import { Card, CardContent } from "@/components/ui/card";
import CourseCard from "../../components/CourseCard";
import moment from "moment";

export default function DispatcherDashboard() {
  const [courses, setCourses] = useState([]);
  const [livreurs, setLivreurs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dispatchMode, setDispatchModeState] = useState(getDispatchMode());
  const [carteVisible, setCarteVisible] = useState(false);
  const [syncingNotifs, setSyncingNotifs] = useState(false);
  const [adminEmail, setAdminEmail] = useState(null);
  const [partenairesEnAttente, setPartenairesEnAttente] = useState([]);
  const [profilesEnAttente, setProfilesEnAttente] = useState([]);
  
  useEffect(() => {
    base44.auth.me().then(me => setAdminEmail(me?.email));
  }, []);
  
  const hasUnreadMessages = useMessageCount(adminEmail, "admin");
  const newMsg = useMessageNotification(adminEmail);

  const syncNotifications = async () => {
    setSyncingNotifs(true);
    try {
      await base44.functions.invoke('syncLivreurNotifications', {});
    } catch (_) {}
    setSyncingNotifs(false);
  };

  const toggleDispatchMode = () => {
    const newMode = dispatchMode === 'auto' ? 'manuel' : 'auto';
    setDispatchMode(newMode);
    setDispatchModeState(newMode);
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [coursesData, livreursPurs, livreursMultiAttente, livreursMultiValides, livreursMultiRefuses, partenairesAttente, profilesAttente] = await Promise.allSettled([
        base44.entities.Course.list("-created_date", 50),
        base44.entities.User.filter({ user_type: "livreur" }),
        base44.entities.User.filter({ statut_validation_livreur: "en_attente" }),
        base44.entities.User.filter({ statut_validation_livreur: "valide" }),
        base44.entities.User.filter({ statut_validation_livreur: "refuse" }),
        base44.entities.Partenaire.filter({ statut: "en_attente" }),
        base44.entities.UserProfile.filter({ status: "en_attente", deleted: false }),
       ]).then(results => results.map(r => r.status === 'fulfilled' ? r.value : []));
      const map = new Map();
      const allLivreurs = [...(livreursPurs || []), ...(livreursMultiAttente || []), ...(livreursMultiValides || []), ...(livreursMultiRefuses || [])];
      allLivreurs.forEach(u => map.set(u.id, u));
      const tousLivreurs = Array.from(map.values()).filter(u => {
        if (u.user_type === 'livreur') return true;
        if (u.user_roles) { try { return JSON.parse(u.user_roles).includes('livreur'); } catch (_) {} }
        return false;
      });
      setCourses(coursesData);
      setLivreurs(tousLivreurs);
      setPartenairesEnAttente((partenairesAttente || []).filter(p => !p.deleted));
      setProfilesEnAttente(profilesAttente || []);
      } catch (err) {
        console.error('Erreur lors du chargement:', err);
        setCourses([]);
        setLivreurs([]);
      } finally {
        setLoading(false);
      }
    };
    load();

    // Rafraîchissement automatique toutes les 30 secondes
    const interval = setInterval(load, 30000);

    const unsubCourse = base44.entities.Course.subscribe((event) => {
      if (event.type === 'create') setCourses(prev => [event.data, ...prev]);
      else if (event.type === 'update') setCourses(prev => prev.map(c => c.id === event.id ? event.data : c));
      else if (event.type === 'delete') setCourses(prev => prev.filter(c => c.id !== event.id));
    });
    const unsubUser = base44.entities.User.subscribe((event) => {
      const isLivreur = event.data?.user_type === 'livreur' || event.data?.statut_validation_livreur;
      if (!isLivreur) return;
      if (event.type === 'create') setLivreurs(prev => [...prev, event.data]);
      else if (event.type === 'update') setLivreurs(prev => {
        const exists = prev.find(l => l.id === event.id);
        if (exists) return prev.map(l => l.id === event.id ? event.data : l);
        return [...prev, event.data];
      });
      else if (event.type === 'delete') setLivreurs(prev => prev.filter(l => l.id !== event.id));
    });
    const unsubPartenaire = base44.entities.Partenaire.subscribe((event) => {
      if (event.type === 'create' && event.data?.statut === 'en_attente') {
        setPartenairesEnAttente(prev => [...prev, event.data]);
      } else if (event.type === 'update') {
        setPartenairesEnAttente(prev => {
          const filtered = prev.filter(p => p.id !== event.id);
          if (event.data?.statut === 'en_attente' && !event.data?.deleted) return [...filtered, event.data];
          return filtered;
        });
      } else if (event.type === 'delete') {
        setPartenairesEnAttente(prev => prev.filter(p => p.id !== event.id));
      }
    });
    const unsubUserProfile = base44.entities.UserProfile.subscribe((event) => {
      if (event.type === 'create' && event.data?.status === 'en_attente') {
        setProfilesEnAttente(prev => [...prev, event.data]);
      } else if (event.type === 'update') {
        setProfilesEnAttente(prev => {
          const filtered = prev.filter(p => p.id !== event.id);
          if (event.data?.status === 'en_attente' && !event.data?.deleted) return [...filtered, event.data];
          return filtered;
        });
      } else if (event.type === 'delete') {
        setProfilesEnAttente(prev => prev.filter(p => p.id !== event.id));
      }
    });
    return () => { unsubCourse(); unsubUser(); unsubPartenaire(); unsubUserProfile(); clearInterval(interval); };
  }, []);

  const today = new Date().toDateString();
  const coursesToday = courses.filter(c => new Date(c.created_date).toDateString() === today);
  const enAttente = courses.filter(c => ["en_attente", "aucun_livreur"].includes(c.statut) && !c.moyen_transport);
  const enCours = courses.filter(c => ["assignee_attente", "acceptee", "en_cours"].includes(c.statut) && !c.moyen_transport);
  const terminees = courses.filter(c => c.statut === "livree" && !c.moyen_transport);
  const livreursActifs = livreurs.filter(l => l.disponible);
  const livreursValides = livreurs.filter(l => l.statut_validation_livreur === "valide");
  const livreursEnAttente = livreurs.filter(l => !l.statut_validation_livreur || l.statut_validation_livreur === "en_attente");
  const livreursBlockes = livreurs.filter(l => l.livreur_bloque);
  const totalCommissionsJour = courses
    .filter(c => c.statut === "livree" && new Date(c.date_livraison).toDateString() === today)
    .reduce((sum, c) => sum + (c.commission_cdl || 0), 0);
  const totalImpaye = livreurs.reduce((sum, l) => sum + (l.solde_commission_du || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <MessageAlert newMsg={newMsg} />
      {newMsg && <div className="h-24" />}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tableau de bord CDL</h1>
          <p className="text-sm text-muted-foreground">Centrale des Livraisons - Ouagadougou</p>
        </div>
        <button
          onClick={toggleDispatchMode}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
            dispatchMode === 'auto'
              ? 'bg-green-100 text-green-700 border-green-300'
              : 'bg-amber-100 text-amber-700 border-amber-300'
          }`}
        >
          {dispatchMode === 'auto' ? '⚡ Mode automatique' : '✋ Mode manuel'}
        </button>
      </div>

      {/* Alerte messages non lus */}
      {hasUnreadMessages && (
        <Link to="/messages-admin">
          <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border-2 border-red-300 animate-pulse">
            <div className="h-10 w-10 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
              <Bell className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-red-800 text-sm">📩 Vous avez des messages non lus</p>
              <p className="text-xs text-red-600">Cliquez pour consulter votre messagerie</p>
            </div>
          </div>
        </Link>
      )}

      {/* Alerte livreurs en attente */}
      {livreursEnAttente.length > 0 && (
        <Link to="/validation-livreurs">
          <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-50 border-2 border-amber-300 animate-pulse">
            <div className="h-10 w-10 rounded-full bg-amber-400 flex items-center justify-center flex-shrink-0">
              <Bell className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-amber-800 text-sm">⚠️ {livreursEnAttente.length} livreur(s) en attente de validation</p>
              <p className="text-xs text-amber-600">Cliquez pour examiner les dossiers</p>
            </div>
            <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">{livreursEnAttente.length}</span>
          </div>
        </Link>
      )}

      {/* Alerte partenaires en attente */}
      {partenairesEnAttente.length > 0 && (
        <Link to="/gerer-partenaires?filtre=en_attente">
          <div className="flex items-center gap-3 p-4 rounded-xl bg-purple-50 border-2 border-purple-300">
            <div className="h-10 w-10 rounded-full bg-purple-500 flex items-center justify-center flex-shrink-0">
              <Store className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-purple-800 text-sm">🏪 {partenairesEnAttente.length} partenaire(s) en attente de validation</p>
              <p className="text-xs text-purple-600">Cliquez pour valider les dossiers</p>
            </div>
            <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">{partenairesEnAttente.length}</span>
          </div>
        </Link>
      )}

      {/* Alerte demandes de profil en attente (UserProfile) */}
      {profilesEnAttente.length > 0 && (
        <Link to="/gestion-profils">
          <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-50 border-2 border-blue-300 animate-pulse">
            <div className="h-10 w-10 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-blue-800 text-sm">📋 {profilesEnAttente.length} demande(s) de profil en attente</p>
              <p className="text-xs text-blue-600">Cliquez pour examiner et valider</p>
            </div>
            <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">{profilesEnAttente.length}</span>
          </div>
        </Link>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{courses.length}</p>
                <p className="text-xs text-muted-foreground">Total courses</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{enAttente.length}</p>
                <p className="text-xs text-muted-foreground">En attente</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                <Users className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{livreursActifs.length}/{livreurs.length}</p>
                <p className="text-xs text-muted-foreground">Livreurs en ligne</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold">{Math.round(totalCommissionsJour).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Commissions du jour</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Carte GPS temps réel - toggle */}
      <div className="space-y-2">
        <button
          onClick={() => setCarteVisible(!carteVisible)}
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl border bg-card hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-base">🗺️</span>
            <div className="text-left">
              <p className="text-sm font-semibold">Livreurs en temps réel</p>
              <p className="text-xs text-muted-foreground">
                {livreursActifs.filter(l => l.gps_latitude).length} livreur(s) avec GPS • {carteVisible ? "Cliquez pour fermer" : "Cliquez pour afficher"}
              </p>
            </div>
          </div>
          <span className={`text-xs font-medium px-2 py-1 rounded-full transition-all ${
            carteVisible ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          }`}>
            {carteVisible ? "Fermer" : "Voir carte"}
          </span>
        </button>
        {carteVisible && (
          <div className="animate-in slide-in-from-top-2 duration-200">
            <MapLivreursActifs livreurs={livreurs} courses={courses} height="250px" />
          </div>
        )}
      </div>

      {/* Pending courses */}
      {enAttente.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-amber-600">⚡ Courses en attente</h2>
            <Link to="/gerer-courses" className="text-xs text-primary font-medium">Voir tout</Link>
          </div>
          {enAttente.slice(0, 3).map((course) => (
            <Link key={course.id} to="/gerer-courses">
              <CourseCard course={course} />
            </Link>
          ))}
        </div>
      )}

      {/* Bases de données */}
      <div className="space-y-3">
        <h2 className="font-semibold text-base">📊 Bases de données</h2>
        <div className="grid grid-cols-4 gap-2">
          <Link to="/base-clients">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-3 text-center space-y-2">
                <Database className="h-6 w-6 text-orange-600 mx-auto" />
                <p className="text-xs font-medium truncate">Clients</p>
              </CardContent>
            </Card>
          </Link>
          <Link to="/base-livreurs">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-3 text-center space-y-2">
                <Truck className="h-6 w-6 text-blue-600 mx-auto" />
                <p className="text-xs font-medium truncate">Livreurs</p>
              </CardContent>
            </Card>
          </Link>
          <Link to="/base-partenaires">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-3 text-center space-y-2">
                <Store className="h-6 w-6 text-green-600 mx-auto" />
                <p className="text-xs font-medium truncate">Partenaires</p>
              </CardContent>
            </Card>
          </Link>
          <Link to="/base-commerciaux">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-3 text-center space-y-2">
                <Tag className="h-6 w-6 text-indigo-600 mx-auto" />
                <p className="text-xs font-medium truncate">Commerciaux</p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

      {/* Raccourcis */}
      <h2 className="font-semibold text-sm text-muted-foreground">Accès rapides</h2>
      <div className="grid grid-cols-2 gap-3">
        <Link to="/gerer-courses">
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-primary">
            <CardContent className="p-4 text-center space-y-2">
              <Package className="h-8 w-8 text-primary mx-auto" />
              <p className="text-sm font-medium">Courses Trajets</p>
              <div className="space-y-1 text-xs">
                    <div className="text-muted-foreground">Courses: <span className="font-bold text-foreground">{courses.filter(c => !c.moyen_transport).length}</span></div>
                    <div className="text-muted-foreground">Trajets: <span className="font-bold text-foreground">{courses.filter(c => c.moyen_transport).length}</span></div>
                  </div>
            </CardContent>
          </Card>
        </Link>
        <Link to="/gerer-livreurs">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-4 text-center space-y-2">
              <Users className="h-8 w-8 text-accent mx-auto" />
              <p className="text-sm font-medium">Gérer les livreurs</p>
            </CardContent>
          </Card>
        </Link>
        <Link to="/suivi-commissions">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-4 text-center space-y-2">
              <CreditCard className="h-8 w-8 text-primary mx-auto" />
              <p className="text-sm font-medium">Suivi des commissions</p>
            </CardContent>
          </Card>
        </Link>
        <Link to="/validation-livreurs">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-4 text-center space-y-2">
              <ShieldCheck className="h-8 w-8 text-green-600 mx-auto" />
              <p className="text-sm font-medium">Validation livreurs</p>
              {livreursEnAttente.length > 0 && (
                <span className="inline-block bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {livreursEnAttente.length}
                </span>
              )}
            </CardContent>
          </Card>
        </Link>
        <Link to="/statistiques">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-4 text-center space-y-2">
              <BarChart3 className="h-8 w-8 text-purple-600 mx-auto" />
              <p className="text-sm font-medium">Statistiques</p>
            </CardContent>
          </Card>
        </Link>
        <Link to="/parametres">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-4 text-center space-y-2">
              <Settings className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-sm font-medium">Paramètres</p>
            </CardContent>
          </Card>
        </Link>
        <Link to="/gerer-publicites">
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-accent/30">
            <CardContent className="p-4 text-center space-y-2">
              <Megaphone className="h-8 w-8 text-accent mx-auto" />
              <p className="text-sm font-medium">Publicités</p>
            </CardContent>
          </Card>
        </Link>
        <Link to="/gerer-partenaires?filtre=en_attente">
          <Card className={`hover:shadow-md transition-shadow cursor-pointer ${partenairesEnAttente.length > 0 ? 'border-l-4 border-l-purple-500 bg-purple-50' : ''}`}>
            <CardContent className="p-4 text-center space-y-2 relative">
              <Store className={`h-8 w-8 mx-auto ${partenairesEnAttente.length > 0 ? 'text-purple-600' : 'text-blue-600'}`} />
              <p className={`text-sm font-medium ${partenairesEnAttente.length > 0 ? 'text-purple-700' : ''}`}>Partenaires</p>
              {partenairesEnAttente.length > 0 && (
                <span className="absolute top-2 right-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {partenairesEnAttente.length}
                </span>
              )}
            </CardContent>
          </Card>
        </Link>
        <Link to="/gerer-commerciaux">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-4 text-center space-y-2">
              <Tag className="h-8 w-8 text-purple-600 mx-auto" />
              <p className="text-sm font-medium">Gérer les commerciaux</p>
            </CardContent>
          </Card>
        </Link>
        <Link to="/gestion-transactions">
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-green-500 bg-green-50">
            <CardContent className="p-4 text-center space-y-2">
              <Wallet className="h-8 w-8 text-green-600 mx-auto" />
              <p className="text-sm font-medium text-green-700">Bedou & Transactions</p>
            </CardContent>
          </Card>
        </Link>
        <Link to="/diffusion-globale">
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-accent bg-accent/5">
            <CardContent className="p-4 text-center space-y-2">
              <Radio className="h-8 w-8 text-accent mx-auto" />
              <p className="text-sm font-medium text-accent">Diffusion globale</p>
            </CardContent>
          </Card>
        </Link>
        <Link to="/gestion-profils">
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-primary bg-primary/5">
            <CardContent className="p-4 text-center space-y-2">
              <AlertCircle className="h-8 w-8 text-primary mx-auto" />
              <p className="text-sm font-medium text-primary">Gestion des profils</p>
            </CardContent>
          </Card>
        </Link>
        <Link to="/suppression">
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-red-500">
            <CardContent className="p-4 text-center space-y-2">
              <Trash2 className="h-8 w-8 text-red-600 mx-auto" />
              <p className="text-sm font-medium">Suppression</p>
            </CardContent>
          </Card>
        </Link>
        <Link to="/gerer-publicites">
          <Card className="hover:shadow-md transition-shadow cursor-pointer bg-gradient-to-br from-orange-500 to-amber-600 border-0">
            <CardContent className="p-4 text-center space-y-2">
              <Megaphone className="h-8 w-8 text-white mx-auto" />
              <p className="text-sm font-medium text-white">Publicités Admin</p>
            </CardContent>
          </Card>
        </Link>
        <Link to="/audit-utilisateurs" className="col-span-2">
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-indigo-500 bg-indigo-50">
            <CardContent className="p-4 flex items-center gap-4">
              <ShieldCheck className="h-8 w-8 text-indigo-600 flex-shrink-0" />
              <div className="text-left">
                <p className="text-sm font-bold text-indigo-700">Audit utilisateurs</p>
                <p className="text-xs text-indigo-600">Vérification comptes · Rôles · Anomalies</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link to="/health-dashboard" className="col-span-2">
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-teal-500 bg-teal-50">
            <CardContent className="p-4 flex items-center gap-4">
              <Activity className="h-8 w-8 text-teal-600 flex-shrink-0" />
              <div className="text-left">
                <p className="text-sm font-bold text-teal-700">Journal Santé Système</p>
                <p className="text-xs text-teal-600">Check-up backend · Logs automatiques · Historique des anomalies</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        </div>
        </div>
        );
        }