import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Trash2, Lock, Mail, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";

export default function Settings() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadUser = async () => {
    const me = await base44.auth.me();
    setUser(me);
    setLoading(false);
  };

  useState(() => { loadUser(); }, []);

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await base44.asServiceRole.entities.User.delete(user.id);
      toast.success("Compte supprimé avec succès");
      await base44.auth.logout();
      navigate("/");
    } catch (error) {
      toast.error("Erreur lors de la suppression");
      console.error(error);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">Paramètres</h1>
      </div>

      {/* Profil */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            Mon compte
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground">Nom complet</p>
            <p className="font-semibold">{user?.full_name}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Email</p>
            <p className="font-semibold text-sm">{user?.email}</p>
          </div>
          {user?.telephone && (
            <div>
              <p className="text-xs text-muted-foreground">Téléphone</p>
              <p className="font-semibold">{user.telephone}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground">Rôle</p>
            <span className="inline-block mt-1 px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
              {user?.user_type || user?.role || "Client"}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Sécurité */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" />
            Sécurité
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Authentification gérée par Base44. Pour changer votre mot de passe, contactez l'administrateur.</p>
        </CardContent>
      </Card>

      {/* Supprimer le compte */}
      <Card className="border-red-200 bg-red-50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-red-700">
            <Trash2 className="h-4 w-4" />
            Supprimer mon compte
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-red-600">
            ⚠️ Cette action est irréversible. Toutes vos données seront supprimées.
          </p>
          <Button
            variant="destructive"
            className="w-full"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Supprimer définitivement mon compte
          </Button>
        </CardContent>
      </Card>

      {/* Dialog confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Supprimer votre compte</DialogTitle>
            <DialogDescription>
              ⚠️ Vous êtes sur le point de supprimer votre compte de manière irréversible. Toutes vos données, historiques et préférences seront perdus.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm font-semibold">Êtes-vous absolument certain ?</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setDeleteDialogOpen(false)}
                disabled={deleting}
              >
                Annuler
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleDeleteAccount}
                disabled={deleting}
              >
                {deleting ? "Suppression..." : "Supprimer"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}