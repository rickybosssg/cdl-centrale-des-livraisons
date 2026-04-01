import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle } from "lucide-react";

export default function AdminRoleCorrection() {
  const [email, setEmail] = useState("weezyh2@gmail.com");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleSetAdmin = async () => {
    if (!email || !email.includes("@")) {
      toast.error("Email invalide");
      return;
    }

    setLoading(true);
    try {
      const res = await base44.functions.invoke("setAdminRole", { target_email: email });
      console.log("[AdminRoleCorrection] Résultat:", res.data);

      if (res.data?.success) {
        setResult(res.data);
        toast.success(`✅ Rôle admin attribué à ${email}`);
        setEmail("");
      } else {
        toast.error(res.data?.error || "Erreur");
      }
    } catch (err) {
      console.error("[AdminRoleCorrection] Erreur:", err);
      toast.error("Erreur: " + err.message);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background p-4 flex items-center justify-center">
      <div className="w-full max-w-md space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Correction rôle administrateur
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Email de l'utilisateur</label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
              />
            </div>

            <Button
              onClick={handleSetAdmin}
              disabled={loading || !email}
              className="w-full"
            >
              {loading ? "⏳ Traitement..." : "🔧 Attribuer rôle admin"}
            </Button>

            {result && (
              <div className="p-4 rounded-lg bg-green-50 border border-green-200 space-y-2">
                <div className="flex items-center gap-2 text-green-700 font-semibold">
                  <CheckCircle2 className="h-5 w-5" />
                  Succès
                </div>
                <div className="text-sm text-green-600">
                  <p>✅ Email: {result.user.email}</p>
                  <p>✅ Rôle: {result.user.role}</p>
                  <p>✅ Profil actif: {result.user.active_profile_type}</p>
                </div>
              </div>
            )}

            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
              ⚠️ Cette opération est sécurisée et ne peut être exécutée que par un administrateur existant.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}