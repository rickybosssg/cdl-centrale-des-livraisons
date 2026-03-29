import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import RoleSetup from "../components/RoleSetup";
import ClientHome from "./client/ClientHome";
import LivreurHome from "./client/LivreurHome";
import DispatcherDashboard from "./dispatcher/DispatcherDashboard";
import DashboardPartenaire from "./partenaire/DashboardPartenaire";
import DashboardCommercial from "./commercial/DashboardCommercial";
import RoleSwitcher from "../components/RoleSwitcher";

export default function Home() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeRole, setActiveRole] = useState(null);

  const getRoles = (u) => {
    if (!u) return [];
    if (u.user_roles) {
      try { return JSON.parse(u.user_roles); } catch (_) {}
    }
    return u.user_type ? [u.user_type] : [];
  };

  const loadUser = async () => {
    const me = await base44.auth.me();
    setUser(me);
    const roles = getRoles(me);
    if (!activeRole && roles.length > 0) setActiveRole(roles[0]);
    setLoading(false);
  };

  const handleRoleAdded = async (newRole) => {
    const me = await base44.auth.me();
    setUser(me);
    setActiveRole(newRole);
  };

  useEffect(() => {
    loadUser();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!user?.user_type) {
    return <RoleSetup onComplete={loadUser} isAdmin={user?.role === 'admin'} />;
  }

  const roles = getRoles(user);
  const role = activeRole || roles[0] || user.user_type;

  const renderDashboard = () => {
    switch (role) {
      case "client":     return <ClientHome user={user} />;
      case "livreur":    return <LivreurHome user={user} />;
      case "dispatcher": return <DispatcherDashboard />;
      case "partenaire": return <DashboardPartenaire user={user} />;
      case "commercial": return <DashboardCommercial user={user} />;
      default:           return <ClientHome user={user} />;
    }
  };

  return (
    <div className="space-y-0">
      <div className="flex justify-end pb-3">
        <RoleSwitcher
          user={user}
          roles={roles}
          currentRole={role}
          onSwitch={setActiveRole}
          onRoleAdded={handleRoleAdded}
        />
      </div>
      {renderDashboard()}
    </div>
  );
}