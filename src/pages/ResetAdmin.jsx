import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

export default function ResetAdmin() {
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser);
  }, []);

  const resetAdmin = async () => {
    setLoading(true);
    try {
      await base44.functions.invoke('resetAdminRole', {});
      toast.success("Rôle administrateur rétabli !");
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (err) {
      toast.error("Erreur: " + err.message);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-sm w-full">
        <CardContent className="p-8 text-center space-y-4">
          <div className="text-4xl">🔑</div>
          <h1 className="text-2xl font-bold">Rétablir Admin</h1>
          <p className="text-sm text-muted-foreground">
            Email: <span className="font-mono font-semibold">{user?.email}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Rôle actuel: <span className="font-semibold text-amber-600">{user?.role || "inconnu"}</span>
          </p>
          <Button 
            onClick={resetAdmin} 
            disabled={loading}
            className="w-full"
            size="lg"
          >
            {loading ? "Rétablissement..." : "Rétablir administrateur"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}