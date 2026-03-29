import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ChatAdmin from "@/components/ChatAdmin";

export default function MesMessages() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    base44.auth.me().then(u => {
      setUser(u);
      if (u?.email) {
        base44.entities.MessageAdmin.filter({ livreur_email: u.email })
          .then(msgs => setUnread(msgs.filter(m => !m.lu_livreur).length))
          .catch(() => {});
      }
    });
  }, []);

  if (!user) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  const role = user.user_type || "client";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">Messages</h1>
          {unread > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{unread}</span>
          )}
        </div>
      </div>

      <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 text-sm text-primary font-medium">
        💬 Discussion avec l'Administrateur CDL
      </div>

      <ChatAdmin userEmail={user.email} userRole={role} currentUser={user} />
    </div>
  );
}