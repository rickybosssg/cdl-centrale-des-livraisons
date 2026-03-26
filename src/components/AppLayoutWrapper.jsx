import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import AppLayout from "./AppLayout";

export default function AppLayoutWrapper() {
  const [userRole, setUserRole] = useState("client");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const me = await base44.auth.me();
      setUserRole(me.user_type || me.role || "client");
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return <AppLayout userRole={userRole} />;
}