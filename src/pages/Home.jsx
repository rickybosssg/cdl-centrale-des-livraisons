import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import RoleSetup from "../components/RoleSetup";
import ClientHome from "./client/ClientHome";
import LivreurHome from "./client/LivreurHome";
import DispatcherDashboard from "./dispatcher/DispatcherDashboard";

export default function Home() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUser = async () => {
    const me = await base44.auth.me();
    setUser(me);
    setLoading(false);
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
    return <RoleSetup onComplete={loadUser} />;
  }

  switch (user.user_type) {
    case "client":
      return <ClientHome user={user} />;
    case "livreur":
      return <LivreurHome user={user} />;
    case "dispatcher":
      return <DispatcherDashboard />;
    default:
      return <ClientHome user={user} />;
  }
}