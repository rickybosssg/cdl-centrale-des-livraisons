import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

export function useMessageCount(userEmail) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!userEmail) return;

    const loadCount = async () => {
      const messages = await base44.entities.MessageAdmin.filter({ livreur_email: userEmail }, "-created_date", 500);
      const unread = messages.filter(m => !m.lu_livreur && m.sender_role === "admin").length;
      setUnreadCount(unread);
    };

    loadCount();

    const unsub = base44.entities.MessageAdmin.subscribe((event) => {
      if (event.data?.livreur_email !== userEmail) return;
      if (event.type === "create" && !event.data.lu_livreur && event.data.sender_role === "admin") {
        setUnreadCount(prev => prev + 1);
      } else if (event.type === "update") {
        loadCount();
      }
    });

    return unsub;
  }, [userEmail]);

  return unreadCount;
}