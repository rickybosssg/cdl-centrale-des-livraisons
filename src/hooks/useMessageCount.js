import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

export function useMessageCount(userEmail, userRole) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!userEmail) return;

    const loadCount = async () => {
      if (userRole === "admin") {
        const messages = await base44.entities.MessageAdmin.list("-created_date", 500);
        const unread = messages.filter(m => !m.lu_admin).length;
        setUnreadCount(unread);
      } else {
        const messages = await base44.entities.MessageAdmin.filter({ livreur_email: userEmail }, "-created_date", 500);
        const unread = messages.filter(m => !m.lu_livreur).length;
        setUnreadCount(unread);
      }
    };

    loadCount();

    const unsub = base44.entities.MessageAdmin.subscribe((event) => {
      if (event.type === "create" || event.type === "update") {
        loadCount();
      }
    });

    return unsub;
  }, [userEmail, userRole]);

  return unreadCount > 0;
}