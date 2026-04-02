import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Package, Users, TrendingUp, Clock, AlertCircle, Bell, Zap } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import AdminNotificationSystem from "@/components/AdminNotificationSystem";
import moment from "moment";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [kpis, setKpis] = useState({
    coursesToday: 0,
    revenueToday: 0,
    livreursOnline: 0,
    newUsers: 0,
    pendingRequests: 0,
    totalCourses: 0,
  });
  const [resetting, setResetting] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const today = new Date().toDateString();
      
      // Charger les données en parallèle
      const [courses, livreurs, users, partenaires, profiles] = await Promise.allSettled([
        base44.entities.Course.list("-created_date", 100),
        base44.entities.User.filter({ user_type: "livreur", disponible: true }),
        base44.entities.User.list("-created_date", 100),
        base44.entities.Partenaire.filter({ statut: "en_attente" }),
        base44.entities.UserProfile.filter({ status: "en_attente", deleted: false }),
      ]).then(results => results.map(r => r.status === 'fulfilled' ? r.value : []));

      // Calculer les KPIs
      const coursesData = courses || [];
      const coursesToday = coursesData.filter(c => new Date(c.created_date).toDateString() === today).length;
      const revenueToday = coursesData
        .filter(c => new Date(c.created_date).toDateString() === today && c.statut === "livree")
        .reduce((sum, c) => sum + (c.commission_cdl || 0), 0);
      const livreursOnline = (livreurs || []).length;
      const newUsersData = (users || []).filter(u => new Date(u.created_date).toDateString() === today);
      const pendingCount = (profiles || []).length; // Uniquement UserProfile en_attente
      const totalCourses = coursesData.length;
      console.log(`[AdminDashboard] Courses totales en base: ${totalCourses}`);
      console.log(`[AdminDashboard] Demandes profils en attente (UserProfile): ${(profiles || []).length}`);

      setKpis({
        coursesToday,
        revenueToday: Math.round(revenueToday),
        livreursOnline,
        newUsers: newUsersData.length,
        pendingRequests: pendingCount,
        totalCourses,
      });

      // Alertes
      const alertList = [];
      if (pendingCount > 0) alertList.push({ type: 'pending', count: pendingCount });
      if ((livreurs || []).filter(l => l.livreur_bloque).length > 0) alertList.push({ type: 'blocked' });
      if (coursesToday > 20) alertList.push({ type: 'high_activity' });
      
      setAlerts(alertList);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000); // Rafraîchir chaque 30s
    return () => clearInterval(interval);
  }, []);

  const handleResetData = async () => {
    const confirmed = window.confirm(
      "⚠️ Êtes-vous sûr de vouloir réinitialiser toutes les courses et statistiques ?\n\nCette action est définitive."
    );
    if (!confirmed) return;

    setResetting(true);
    try {
      const res = await base44.functions.invoke('resetAdminData', {});
      console.log('[AdminDashboard] Réinitialisation:', res.data);
      if (res.data?.success) {
        toast.success('✅ Données réinitialisées, rechargement...');
        setTimeout(() => loadData(), 500);
      } else {
        toast.error(res.data?.error || 'Erreur');
      }
    } catch (err) {
      console.error('[AdminDashboard] Erreur reset:', err);
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

  const alertConfig = {
    pending: { icon: AlertCircle, color: 'bg-blue-50 border-blue-300', text: '📋 ' + kpis.pendingRequests + ' demandes en attente' },
    blocked: { icon: AlertCircle, color: 'bg-red-50 border-red-300', text: '🔒 Livreurs bloqués détectés' },
    high_activity: { icon: Zap, color: 'bg-amber-50 border-amber-300', text: '⚡ Activité élevée détectée' },
  };

  return (
    <div className="pb-24 space-y-4">
      {/* Header */}
      <div className="sticky top-0 bg-background/95 backdrop-blur p-4 border-b z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">CDL Control Center</h1>
            <p className="text-xs text-muted-foreground">{moment().format('DD MMM YYYY')}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => navigate('/settings')}>
            <Bell className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Notifications */}
      <div className="px-4">
        <AdminNotificationSystem />
      </div>

      {/* Alertes */}
      {alerts.length > 0 && (
        <div className="px-4 space-y-2">
          {alerts.map((alert, idx) => {
            const cfg = alertConfig[alert.type];
            return (
              <div key={idx} className={`p-3 rounded-xl border-2 ${cfg.color}`}>
                <p className="text-sm font-semibold">{cfg.text}</p>
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
        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="p-4">
            <p className="text-3xl font-bold text-purple-600">{kpis.newUsers}</p>
            <p className="text-xs text-muted-foreground mt-1">Nouveaux utilisateurs</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-orange-500 col-span-2">
          <CardContent className="p-4">
            <p className="text-3xl font-bold text-orange-600">{kpis.totalCourses}</p>
            <p className="text-xs text-muted-foreground mt-1">Total courses en base</p>
          </CardContent>
        </Card>
      </div>

      {/* Bouton réinitialisation */}
      <div className="px-4">
        <Button
          variant="destructive"
          className="w-full text-xs h-9"
          onClick={handleResetData}
          disabled={resetting}
        >
          {resetting ? "Réinitialisation..." : "🔄 Réinitialiser les statistiques"}
        </Button>
      </div>

      {/* Actions rapides */}
      <div className="px-4 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Accès rapide</p>
        <Link to="/gestion-profils">
          <Button className="w-full justify-start gap-2" variant="outline">
            <Users className="h-4 w-4" />
            👤 Gestion des profils
          </Button>
        </Link>
        <Link to="/pending-profiles">
          <Button className="w-full justify-start gap-2" variant="outline">
            <AlertCircle className="h-4 w-4" />
            📋 Demandes de profils ({kpis.pendingRequests})
          </Button>
        </Link>
        <Link to="/livreurs-incomplets">
          <Button className="w-full justify-start gap-2 border-amber-300 hover:bg-amber-50 text-amber-800" variant="outline">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            ⚠️ Livreurs incomplets
          </Button>
        </Link>
        <Link to="/gerer-courses">
          <Button className="w-full justify-start gap-2" variant="outline">
            <Package className="h-4 w-4" />
            📦 Gérer les courses
          </Button>
        </Link>
        <Link to="/validation-livreurs">
          <Button className="w-full justify-start gap-2" variant="outline">
            <Users className="h-4 w-4" />
            🛵 Valider les livreurs
          </Button>
        </Link>
        <Link to="/gerer-livreurs">
          <Button className="w-full justify-start gap-2" variant="outline">
            <TrendingUp className="h-4 w-4" />
            📊 Gestion livreurs
          </Button>
        </Link>
        <Link to="/gestion-transactions">
          <Button className="w-full justify-start gap-2" variant="outline">
            <Clock className="h-4 w-4" />
            💰 Finances & Bedou
          </Button>
        </Link>
        <Link to="/dispatch-monitor">
          <Button className="w-full justify-start gap-2 border-green-300 hover:bg-green-50 text-green-800" variant="outline">
            <Zap className="h-4 w-4 text-green-600" />
            ⚡ Dispatch Monitor (temps réel)
          </Button>
        </Link>
        <Link to="/whatsapp-orders">
          <Button className="w-full justify-start gap-2 border-green-400 hover:bg-green-50 text-green-900" variant="outline">
            <span className="text-base">📲</span>
            Commandes WhatsApp
          </Button>
        </Link>
      </div>

      {/* Info rapide */}
      <div className="px-4 pb-4">
        <Card className="bg-primary/5">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">
              ⚡ Dashboard mis à jour chaque 30 secondes. Cliquez sur une section pour plus de détails.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}