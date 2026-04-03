import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { vibrateNotif, playNotificationSound } from "@/lib/vibration";

export function useMessageNotification(userEmail) {
  const [newMsg, setNewMsg] = useState(null);
  const timeout = useRef(null);

  useEffect(() => {
    if (!userEmail) return;

    let isMounted = true;

    const unsub = base44.entities.MessageAdmin.subscribe((event) => {
      if (!isMounted) return;
      if (event.type === "create" && event.data?.livreur_email === userEmail) {
        if (event.data?.sender_role !== "admin") {
          playNotificationSound();
          vibrateNotif();
          if (isMounted) {
            setNewMsg({
              role: event.data.sender_role,
              contenu: event.data.contenu,
              sender: event.data.sender_email,
            });
          }
          if (timeout.current) clearTimeout(timeout.current);
          if (isMounted) {
            timeout.current = setTimeout(() => {
              if (isMounted) setNewMsg(null);
            }, 6000);
          }
        }
      }
    });

    return () => {
      isMounted = false;
      if (unsub) unsub();
      if (timeout.current) clearTimeout(timeout.current);
    };
  }, [userEmail]);

  return newMsg;
}