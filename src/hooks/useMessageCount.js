import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

export function useMessageCount(userEmail, userRole) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!userEmail) return;

    let isMounted = true;

    const loadCount = async () => {
      if (!isMounted) return;
      try {
        if (userRole === "admin") {
          const messages = await base44.entities.MessageAdmin.list("-created_date", 500);
          if (isMounted) setUnreadCount(messages.filter(m => !m.lu_admin).length);
        } else {
          const messages = await base44.entities.MessageAdmin.filter({ livreur_email: userEmail }, "-created_date", 500);
          if (isMounted) setUnreadCount(messages.filter(m => !m.lu_livreur).length);
        }
      } catch (err) {
        console.error('[useMessageCount] Error:', err);
      }
    };

    loadCount();

    const unsub = base44.entities.MessageAdmin.subscribe((event) => {
      if ((event.type === "create" || event.type === "update") && isMounted) {
        loadCount();
      }
    });

    return () => {
      isMounted = false;
      if (unsub) unsub();
    };
  }, [userEmail, userRole]);

  return unreadCount > 0;
}