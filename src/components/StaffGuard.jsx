import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Shield, Loader2 } from "lucide-react";
import { isAdminUser } from "@/lib/activeProfile";

export default function StaffGuard({ requiredPerm }) {
  const [status, setStatus] = useState("loading");
  const [perm, setPerm] = useState(null);

  useEffect(() => {
    const check = async () => {
      const me = await base44.auth.me();
      const isAdmin = isAdminUser(me); // source unique: user.role === 'admin'
      if (isAdmin) { setStatus("ok"); return; }
      const perms = await base44.entities.StaffPermission.filter({ userEmail: me.email, isActive: true });
      const p = perms[0];
      if (!p || !p.isStaff || !p.staffAccessActive) { setStatus("denied"); return; }
      if (requiredPerm && !p[requiredPerm]) { setStatus("denied"); return; }
      setPerm(p);
      setStatus("ok");
    };
    check().catch(() => setStatus("denied"));
  }, [requiredPerm]);

  if (status === "loading") return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  if (status === "denied") return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-8 text-center">
      <Shield className="h-16 w-16 text-red-400" />
      <h2 className="text-xl font-bold">Accès refusé</h2>
      <p className="text-muted-foreground text-sm">Vous n'avez pas les permissions nécessaires pour accéder à cette section.</p>
    </div>
  );

  return <Outlet context={{ perm }} />;
}