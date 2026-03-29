import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { MessageCircle } from "lucide-react";
import ChatLivreur from "@/components/ChatLivreur";

export default function MesDiscussions() {
  const [user, setUser] = useState(null);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    base44.auth.me().then(async (me) => {
      setUser(me);
      const msgs = await base44.entities.MessageAdmin.filter({ livreur_email: me.email });
      setUnread(msgs.filter(m => !m.lu_livreur && m.sender_role === "admin").length);
    });
  }, []);

  if (!user) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <MessageCircle className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold">Discussion avec l'Administrateur</h1>
        {unread > 0 && (
          <span className="text-xs bg-red-500 text-white rounded-full px-2 py-0.5 font-bold">{unread}</span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Communiquez directement avec l'administration CDL pour toute question concernant votre dossier.
      </p>
      <ChatLivreur livreurEmail={user.email} currentUser={user} />
    </div>
  );
}