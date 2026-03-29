import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

export function useMessageCount(userEmail, userRole) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!userEmail) return;

    const loadCount = async () => {
      const messages = await base44.entities.MessageAdmin.list("-created_date", 500);
      let unread = 0;

      if (userRole === "admin") {
        // Pour les admins: compter les messages non lus par l'admin
        unread = messages.filter(m => !m.lu_admin).length;
      } else {
        // Pour les autres rôles: compter les messages destinés à cet utilisateur et non lus par lui
        unread = messages.filter(m => m.livreur_email === userEmail && !m.lu_livreur).length;
      }
      setUnreadCount(unread);
    };

    loadCount();

    const unsub = base44.entities.MessageAdmin.subscribe((event) => {
      if (event.type === "create") {
        if (userRole === "admin" && !event.data.lu_admin) {
          setUnreadCount(prev => prev + 1);
        } else if (userRole !== "admin" && event.data.livreur_email === userEmail && !event.data.lu_livreur) {
          setUnreadCount(prev => prev + 1);
        }
      } else if (event.type === "update") {
        loadCount();
      }
    });

    return unsub;
  }, [userEmail, userRole]);

  return unreadCount;
}