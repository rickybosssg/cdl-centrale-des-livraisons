import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { vibrateNotif, playNotificationSound } from "@/lib/vibration";

export function useMessageNotification(userEmail) {
  const [newMsg, setNewMsg] = useState(null);
  const timeout = useRef(null);

  useEffect(() => {
    if (!userEmail) return;

    const unsub = base44.entities.MessageAdmin.subscribe((event) => {
      if (event.type === "create" && event.data?.livreur_email === userEmail) {
        // Notifier si c'est un message entrant (pas de l'admin)
        if (event.data?.sender_role !== "admin") {
          playNotificationSound();
          vibrateNotif();
          setNewMsg({
            role: event.data.sender_role,
            contenu: event.data.contenu,
            sender: event.data.sender_email,
          });
          if (timeout.current) clearTimeout(timeout.current);
          timeout.current = setTimeout(() => setNewMsg(null), 6000);
        }
      }
    });

    return () => {
      unsub();
      if (timeout.current) clearTimeout(timeout.current);
    };
  }, [userEmail]);

  return newMsg;
}