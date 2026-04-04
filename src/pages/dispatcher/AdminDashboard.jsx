import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Package, Users, TrendingUp, Clock, AlertCircle, Bell, Zap, LayoutGrid, Truck, Store, Megaphone, Wallet, Sparkles, Trash2, Activity } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import AdminNotificationSystem from "@/components/AdminNotificationSystem";
import AdminBadge from "@/components/AdminBadge";
import moment from "moment";

export default function AdminDashboard() {
  console.log('[AdminDashboard] RENDER - Composant en cours de rendu');
  const navigate = useNavigate();
  const [kpis, setKpis] = useState({
    coursesToday: 0,
    revenueToday: 0,
    livreursOnline: 0,
    livreursDisponibles: 0,
    clientsOnline: 0,
    coursesEnAttente: 0,
    newUsers: 0,
    pendingRequests: 0,
    totalCourses: 0,
    totalRevenuCDL: 0,
    totalPartenairesActifs: 0,
    revenuAbonnements: 0,
  });
  const [counts, setCounts] = useState({
    livreurs: { pending: 0, count: 0 },
    clients: { new: 0, count: 0 },
    partenaires: { pending: 0, count: 0 },
    commerciaux: { pending: 0, count: 0 },
    profilesIncomplets: 0,
  });
  const [resetting, setResetting] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [demandeBedouCount, setDemandeBedouCount] = useState(0);
  const [zonesData, setZonesData] = useState([]);

  const loadData = async () => {
    try {
      // Charger KPIs
      const today = new Date().toDateString();
      const [courses, livreurs, users, partenaires, profiles, countsRes, allClients] = await Promise.allSettled([
        base44.entities.Course.list("-created_date", 100),
        base44.entities.User.filter({ user_type: "livreur", disponible: true }),
        base44.entities.User.list("-created_date", 100),
        base44.entities.Partenaire.list('-created_date', 200),
        base44.entities.UserProfile.filter({ status: "en_attente", deleted: false }),
        base44.functions.invoke('getAdminCounts', {}),
        base44.entities.User.filter({ user_type: "client" }),
      ]).then(results => results.map(r => r.status === 'fulfilled' ? r.value : []));

      const coursesData = courses || [];
      const coursesToday = coursesData.filter(c => new Date(c.created_date).toDateString() === today).length;
      const revenueToday = coursesData
        .filter(c => new Date(c.created_date).toDateString() === today && c.statut === 'livree')
        .reduce((sum, c) => sum + (c.commission_cdl || 0), 0);
      const livreursOnline = (livreurs || []).length;
      const livreursDisponibles = (livreurs || []).filter(l => !l.livreur_bloque).length;
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      const onlineClients = (allClients || []).filter(c => c.last_seen && new Date(c.last_seen) > fiveMinAgo);
      const clientsOnline = onlineClients.length;
      const coursesEnAttente = (courses || []).filter(c => c.statut === 'en_attente').length;

      // Calcul zones
      const zoneClientsMap = {};
      onlineClients.forEach(c => {
        const zone = c.quartier || c.quartier_principal || 'Zone inconnue';
        zoneClientsMap[zone] = (zoneClientsMap[zone] || 0) + 1;
      });
      const livreursOnlineList = livreurs || [];
      const zoneLivreursMap = {};
      livreursOnlineList.forEach(l => {
        const zone = l.quartier || 'Zone inconnue';
        zoneLivreursMap[zone] = (zoneLivreursMap[zone] || 0) + 1;
      });
      const zonesComputed = Object.entries(zoneClientsMap)
        .map(([zone, clients]) => ({ zone, clients, livreurs: zoneLivreursMap[zone] || 0 }))
        .sort((a, b) => b.clients - a.clients)
        .slice(0, 8);
      setZonesData(zonesComputed);
      const newUsersData = (users || []).filter(u => new Date(u.created_date).toDateString() === today);
      const pendingCount = (profiles || []).length;
      const totalCourses = coursesData.length;

      const totalRevenuCDL = coursesData
        .filter(c => c.statut === 'livree')
        .reduce((sum, c) => sum + (c.commission_cdl || Math.round((c.prix || 0) * 0.2)), 0);

      const partenairesActifs = (partenaires || []).filter(p => p.statut === 'actif');
      const revenuAbonnements = partenairesActifs.reduce((sum, p) => {
        const moisDepuis = p.date_paiement_abonnement
          ? Math.max(1, Math.round((Date.now() - new Date(p.date_paiement_abonnement)) / (1000*60*60*24*30)))
          : 1;
        return sum + (moisDepuis <= 1 ? 10000 : 30000);
      }, 0);

      setKpis({
        coursesToday,
        revenueToday: Math.round(revenueToday),
        livreursOnline,
        livreursDisponibles,
        clientsOnline,
        coursesEnAttente,
        newUsers: newUsersData.length,
        pendingRequests: pendingCount,
        totalCourses,
        totalRevenuCDL: Math.round(totalRevenuCDL),
        totalPartenairesActifs: partenairesActifs.length,
        revenuAbonnements,
      });

      // Charger les compteurs admin
      if (countsRes.data) {
        setCounts(countsRes.data);
      }

      // Charger les demandes Bedou en attente
      const [recharges, retraits] = await Promise.allSettled([
        base44.entities.DemandeRecharge.filter({ statut: 'en_attente' }),
        base44.entities.DemandeRetrait.filter({ statut: 'en_attente' }),
      ]).then(results => results.map(r => r.status === 'fulfilled' ? r.value : []));
      setDemandeBedouCount((recharges || []).length + (retraits || []).length);

      const alertList = [];
      if (countsRes.data?.livreurs?.pending > 0) alertList.push({ type: 'livreurs', count: countsRes.data.livreurs.pending });
      if (countsRes.data?.partenaires?.pending > 0) alertList.push({ type: 'partenaires', count: countsRes.data.partenaires.pending });
      if (countsRes.data?.commerciaux?.pending > 0) alertList.push({ type: 'commerciaux', count: countsRes.data.commerciaux.pending });
      if ((livreurs || []).filter(l => l.livreur_bloque).length > 0) alertList.push({ type: 'blocked' });
      if ((recharges || []).length + (retraits || []).length > 0) alertList.push({ type: 'bedou', count: (recharges || []).length + (retraits || []).length });
      
      setAlerts(alertList);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log('[AdminDashboard] Component mounted');
    console.log('[AdminDashboard] Admin dashboard loaded');
    loadData();
    const interval = setInterval(loadData, 30000);

    const unsubProfile = base44.entities.UserProfile.subscribe(() => { loadData(); });
    const unsubPartenaire = base44.entities.Partenaire.subscribe(() => loadData());
    const unsubs = [];
    unsubs.push(base44.entities.User.subscribe((event) => {
      if (['livreur', 'client', 'commercial'].includes(event.data?.user_type)) { loadData(); }
    }));
    unsubs.push(base44.entities.Partenaire.subscribe(() => loadData()));
    unsubs.push(base44.entities.UserProfile.subscribe(() => loadData()));
    unsubs.push(base44.entities.Course.subscribe(() => loadData()));

    return () => {
      clearInterval(interval);
      unsubs.forEach(u => u?.());
      unsubProfile();
      unsubPartenaire();
    };
  }, []);

  const handleResetData = async () => {
    const confirmed = window.confirm("⚠️ Êtes-vous sûr de vouloir réinitialiser toutes les courses et statistiques ?");
    if (!confirmed) return;

    setResetting(true);
    try {
      const res = await base44.functions.invoke('resetAdminData', {});
      if (res.data?.success) {
        toast.success('✅ Données réinitialisées');
        setTimeout(() => loadData(), 500);
      } else {
        toast.error(res.data?.error || 'Erreur');
      }
    } catch (err) {
      console.error('[AdminDashboard] Error reset:', err);
      toast.error('Erreur: ' + err.message);
    }
    setResetting(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  console.log('[AdminDashboard] Dashboard rendered - visible to admin');

  const alertConfig = {
    livreurs: { icon: Truck, text: '📋 ' + counts.livreurs?.pending + ' livreurs à valider' },
    partenaires: { icon: Store, text: '🏪 ' + counts.partenaires?.pending + ' partenaires en attente' },
    commerciaux: { icon: Megaphone, text: '📢 ' + counts.commerciaux?.pending + ' commerciaux à valider' },
    blocked: { icon: AlertCircle, text: '🔒 Livreurs bloqués détectés' },
  };

  console.log('[AdminDashboard] Affichage du JSX');
  return (
    <div className="pb-24 space-y-4" key="dashboard-root-div">
      <div className="sticky top-0 bg-background/95 backdrop-blur p-4 border-b z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">CDL Control Center</h1>
            <p className="text-xs text-muted-foreground">{moment().format('DD MMM YYYY')}</p>
          </div>
          <Button variant="ghost" size="icon">
            <Bell className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div className="px-4">
        <AdminNotificationSystem />
      </div>

      {alerts.length > 0 && (
        <div className="px-4 space-y-2">
          {alerts.map((alert, idx) => {
            const cfg = alertConfig[alert.type];
            return (
              <div key={idx} className="p-3 rounded-xl border-2 border-red-300 bg-red-50">
                <p className="text-sm font-semibold text-red-700">{cfg.text}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* KPIs */}
      <div className="px-4 grid grid-cols-2 gap-3">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="p-4">
            <p className="text-3xl font-bold text-primary">{kpis.coursesToday}</p>
            <p className="text-xs text-muted-foreground mt-1">Courses aujourd'hui</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-4">
            <p className="text-3xl font-bold text-green-600">{kpis.revenueToday.toLocaleString()} F</p>
            <p className="text-xs text-muted-foreground mt-1">Revenus du jour</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <p className="text-3xl font-bold text-blue-600">{kpis.livreursOnline}</p>
            <p className="text-xs text-muted-foreground mt-1">Livreurs en ligne</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-cyan-500">
          <CardContent className="p-4">
            <p className="text-3xl font-bold text-cyan-600">{kpis.clientsOnline}</p>
            <p className="text-xs text-muted-foreground mt-1">Clients en ligne</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="p-4">
            <p className="text-3xl font-bold text-purple-600">{kpis.newUsers}</p>
            <p className="text-xs text-muted-foreground mt-1">Nouveaux utilisateurs</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="p-4">
            <p className="text-3xl font-bold text-orange-600">{kpis.totalCourses}</p>
            <p className="text-xs text-muted-foreground mt-1">Total courses</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-4">
            <p className="text-3xl font-bold text-red-600">{kpis.coursesEnAttente}</p>
            <p className="text-xs text-muted-foreground mt-1">Courses en attente</p>
          </CardContent>
        </Card>
        {/* Bloc Ratio Offre / Demande */}
        {(() => {
          const ratio = kpis.livreursDisponibles >= kpis.coursesEnAttente && kpis.clientsOnline <= 3
            ? { label: 'Faible demande', color: 'bg-blue-50 border-blue-300', badge: 'bg-blue-100 text-blue-700', dot: '🔵' }
            : kpis.livreursDisponibles >= kpis.coursesEnAttente
            ? { label: 'Offre suffisante', color: 'bg-green-50 border-green-300', badge: 'bg-green-100 text-green-700', dot: '🟢' }
            : kpis.coursesEnAttente <= kpis.livreursDisponibles + 2
            ? { label: 'Équilibré', color: 'bg-amber-50 border-amber-300', badge: 'bg-amber-100 text-amber-700', dot: '🟡' }
            : kpis.coursesEnAttente > kpis.livreursDisponibles * 2
            ? { label: 'Pénurie critique', color: 'bg-red-50 border-red-300', badge: 'bg-red-100 text-red-700', dot: '🔴' }
            : { label: 'Tension', color: 'bg-orange-50 border-orange-300', badge: 'bg-orange-100 text-orange-700', dot: '🟠' };
          return (
            <Card className={`col-span-2 border-2 ${ratio.color}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-muted-foreground" />
                      <p className="text-sm font-semibold text-muted-foreground">Ratio Offre / Demande</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {kpis.livreursDisponibles} livreurs dispo · {kpis.coursesEnAttente} courses · {kpis.clientsOnline} clients actifs
                    </p>
                  </div>
                  <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${ratio.badge}`}>
                    {ratio.dot} {ratio.label}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })()}
        <Card className="border-l-4 border-l-green-700 col-span-2">
          <CardContent className="p-4">
            <p className="text-3xl font-bold text-green-700">{kpis.totalRevenuCDL.toLocaleString()} F</p>
            <p className="text-xs text-muted-foreground mt-1">💰 Total gains CDL</p>
          </CardContent>
        </Card>
      </div>

      <div className="px-4">
        <Button
          variant="destructive"
          className="w-full text-xs h-9"
          onClick={handleResetData}
          disabled={resetting}
        >
          {resetting ? "Réinitialisation..." : "🔄 Réinitialiser"}
        </Button>
      </div>

      {/* Actions rapides avec badges */}
      <div className="px-4 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Autres accès</p>

        <Link to="/validation-livreurs">
          <div className="relative">
            <Button className="w-full justify-start gap-2" variant="outline">
              <Truck className="h-4 w-4" />
              🛵 Validation livreurs
            </Button>
            <AdminBadge count={counts.livreurs?.pending} />
          </div>
        </Link>

        <Link to="/gerer-clients">
          <div className="relative">
            <Button className="w-full justify-start gap-2" variant="outline">
              <Users className="h-4 w-4" />
              👤 Gestion clients
            </Button>
            <AdminBadge count={counts.clients?.new} />
          </div>
        </Link>

        <Link to="/gerer-partenaires">
          <div className="relative">
            <Button className="w-full justify-start gap-2" variant="outline">
              <Store className="h-4 w-4" />
              🏪 Gestion partenaires
            </Button>
            <AdminBadge count={counts.partenaires?.pending} />
          </div>
        </Link>

        <Link to="/gerer-commerciaux">
          <div className="relative">
            <Button className="w-full justify-start gap-2" variant="outline">
              <Megaphone className="h-4 w-4" />
              💼 Gestion commerciaux
            </Button>
            <AdminBadge count={counts.commerciaux?.pending} />
          </div>
        </Link>

        <Link to="/gerer-courses">
          <Button className="w-full justify-start gap-2" variant="outline">
            <Package className="h-4 w-4" />
            📦 Gérer les courses
          </Button>
        </Link>

        <Link to="/livreurs-incomplets">
          <Button className="w-full justify-start gap-2 border-amber-300 hover:bg-amber-50 text-amber-800" variant="outline">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            ⚠️ Livreurs incomplets
          </Button>
        </Link>

        <Link to="/gestion-transactions">
          <Button className="w-full justify-start gap-2" variant="outline">
            <TrendingUp className="h-4 w-4" />
            💰 Finances & Bedou
          </Button>
        </Link>

        <Link to="/dispatch-monitor">
          <Button className="w-full justify-start gap-2 border-green-300 hover:bg-green-50 text-green-800" variant="outline">
            <Zap className="h-4 w-4 text-green-600" />
            ⚡ Dispatch Monitor
          </Button>
        </Link>

        <Link to="/gestion-profils">
          <div className="relative">
            <Button className="w-full justify-start gap-2 bg-gradient-to-r from-primary to-blue-600 text-white font-semibold">
              <LayoutGrid className="h-4 w-4" />
              ⚙️ Gestion des profils
            </Button>
            <AdminBadge count={counts.profilesIncomplets} />
          </div>
        </Link>

        <Link to="/gestion-bedou">
          <div className="relative">
            <Button className="w-full justify-start gap-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold">
              <Wallet className="h-4 w-4" />
              💰 Bedou & Transactions
            </Button>
            <AdminBadge count={demandeBedouCount} />
          </div>
        </Link>
      </div>

      {/* GRILLE 2 : Suppression + PUBLICITÉS ADMIN */}
      <div className="px-4 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          {/* Suppression */}
          <Link to="/suppression">
            <Button className="w-full justify-start gap-2" variant="outline">
              <Trash2 className="h-4 w-4" />
              🗑️ Suppression
            </Button>
          </Link>

          {/* PUBLICITÉS ADMIN */}
          <Link to="/gerer-publicites">
            <Button className="w-full justify-start gap-2 bg-gradient-to-r from-orange-500 to-amber-600 text-white font-bold">
              <Megaphone className="h-4 w-4" />
              📢 Pubs Admin
            </Button>
          </Link>
        </div>
      </div>

      {/* Clients en ligne par zone */}
      {zonesData.length > 0 && (
        <div className="px-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">📍 Clients actifs par zone</p>
          <div className="space-y-2">
            {zonesData.map(({ zone, clients, livreurs: liv }) => {
              const ratio = liv === 0 ? 'critique' : clients > liv * 2 ? 'tension' : clients > liv ? 'fragile' : 'ok';
              const colors = {
                ok: 'bg-green-50 border-green-200 text-green-700',
                fragile: 'bg-amber-50 border-amber-200 text-amber-700',
                tension: 'bg-orange-50 border-orange-200 text-orange-700',
                critique: 'bg-red-50 border-red-200 text-red-700',
              };
              const dots = { ok: '🟢', fragile: '🟡', tension: '🟠', critique: '🔴' };
              return (
                <div key={zone} className={`flex items-center justify-between px-3 py-2.5 rounded-xl border ${colors[ratio]}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{dots[ratio]}</span>
                    <span className="text-sm font-semibold">{zone}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-medium">
                    <span>👤 {clients} client{clients > 1 ? 's' : ''}</span>
                    <span>🛵 {liv} livreur{liv > 1 ? 's' : ''}</span>
                    {ratio === 'critique' || ratio === 'tension' ? <span className="font-bold">🔥</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="px-4 pb-4">
        <Card className="bg-primary/5">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">
              ⚡ Dashboard synchronisé en temps réel. Badges automatiques pour les éléments à traiter.
            </p>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}