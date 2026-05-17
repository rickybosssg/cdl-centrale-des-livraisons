/**
 * useDriverCourseAlert — Hook global realtime pour la carte d'acceptation livreur
 *
 * Source unique : écoute l'entité Course en BDD.
 * Déclenche l'alerte dès qu'une course statut=assignee_attente est assignée à ce livreur,
 * peu importe l'onglet où il se trouve.
 *
 * Usage :
 *   const { alertCourse, clearAlert, user } = useDriverCourseAlert();
 *   <NewCourseAlert course={alertCourse} onClose={clearAlert} user={user} />
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";

export function useDriverCourseAlert() {
  const [user, setUser] = useState(null);
  const [alertCourse, setAlertCourse] = useState(null);
  const alertCourseRef = useRef(null);
  const userEmailRef = useRef(null);

  // Charger l'user au mount
  useEffect(() => {
    base44.auth.me().then(me => {
      if (!me?.email) return;
      setUser(me);
      userEmailRef.current = me.email;

      // Vérifier immédiatement s'il y a une course assignée en attente
      base44.entities.Course.filter({ livreur_email: me.email, statut: "assignee_attente" }, "-created_date", 1)
        .then(data => {
          if (data?.[0]) {
            alertCourseRef.current = data[0];
            setAlertCourse(data[0]);
          }
        })
        .catch(() => {});
    }).catch(() => {});
  }, []);

  // Subscription BDD — source unique
  useEffect(() => {
    const unsub = base44.entities.Course.subscribe((ev) => {
      if (!ev.data) return;
      const email = userEmailRef.current;
      if (!email) return;

      const isForMe = ev.data.livreur_email === email;
      const isProposed = ev.data.statut === "assignee_attente";

      if (isForMe && isProposed) {
        // Nouveau dispatch reçu — afficher la carte
        if (alertCourseRef.current?.id !== ev.data.id) {
          alertCourseRef.current = ev.data;
          setAlertCourse(ev.data);
        }
      } else if (alertCourseRef.current?.id === ev.id) {
        // La course qu'on proposait a changé (annulée, réassignée…) → fermer
        alertCourseRef.current = null;
        setAlertCourse(null);
      }
    });

    return () => { if (unsub) unsub(); };
  }, []);

  const clearAlert = useCallback(() => {
    alertCourseRef.current = null;
    setAlertCourse(null);
  }, []);

  return { alertCourse, clearAlert, user };
}