import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function InviterAdmin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleInvite = async () => {
    if (!email.trim()) {
      toast.error("Entrez un email");
      return;
    }

    setLoading(true);
    try {
      await base44.users.inviteUser(email.trim(), "admin");
      toast.success(`Admin invité : ${email}`);
      setEmail("");
    } catch (err) {
      toast.error("Erreur : " + (err.message || "Impossible d'inviter"));
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">Inviter un Admin</h1>
      </div>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div>
            <label className="text-sm font-medium">Email du nouvel administrateur</label>
            <Input
              type="email"
              placeholder="admin@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleInvite()}
              disabled={loading}
            />
          </div>
          <Button
            onClick={handleInvite}
            disabled={loading || !email.trim()}
            className="w-full"
          >
            {loading ? "Envoi en cours..." : "Inviter"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}