/**
 * useDriverCourseAlert — Hook global realtime pour la carte d'acceptation livreur
 *
 * SOURCE PRIMAIRE : Course.subscribe() — affichage immédiat sans fetch intermédiaire
 * SOURCE SECONDAIRE : Notification.subscribe() — pour les assignations admin manuelles
 * SOURCE INITIALE : Notification non lue au mount (rattrapage si app fermée)
 *
 * RÈGLE : notification reçue OU course assignée → bloc affiché IMMÉDIATEMENT (< 500ms)
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";

export function useDriverCourseAlert() {
  const [user, setUser] = useState(null);
  const [alertCourse, setAlertCourse] = useState(null);
  const alertCourseRef = useRef(null);
  const userEmailRef = useRef(null);

  // ── Charger l'user au mount ──────────────────────────────────────────────
  useEffect(() => {
    base44.auth.me().then(me => {
      if (!me?.email) return;
      setUser(me);
      userEmailRef.current = me.email;
      console.log('[DRIVER_ALERT] user ready:', me.email);

      // Rattrapage initial : course en attente assignée à ce livreur non encore vue
      base44.entities.Course.filter({ livreur_email: me.email, statut: "assignee_attente" }, "-created_date", 1)
        .then(courses => {
          if (courses?.[0] && alertCourseRef.current?.id !== courses[0].id) {
            console.log('[DRIVER_ALERT] initial rattrapage course:', courses[0].id);
            alertCourseRef.current = courses[0];
            setAlertCourse(courses[0]);
          }
        })
        .catch(() => {});
    }).catch(() => {});
  }, []);

  // ── SOURCE PRIMAIRE : Course.subscribe() — INSTANTANÉ (< 500ms) ─────────
  // Déclenche le bloc dès que la course est assignée à ce livreur
  useEffect(() => {
    const unsub = base44.entities.Course.subscribe((ev) => {
      const email = userEmailRef.current;
      if (!email || !ev.data) return;

      const course = ev.data;
      const isForMe = course.livreur_email === email;
      const isAssigned = ["assignee_attente", "en_attente"].includes(course.statut);

      if (ev.type === "create" && isForMe && isAssigned) {
        console.log(`[DRIVER_ALERT] course CREATE assigned to me: ${ev.id} | statut: ${course.statut}`);
        alertCourseRef.current = course;
        setAlertCourse(course);
      } else if (ev.type === "update") {
        // Course assignée à moi → afficher
        if (isForMe && isAssigned && alertCourseRef.current?.id !== ev.id) {
          console.log(`[DRIVER_ALERT] course UPDATE assigned to me: ${ev.id} | statut: ${course.statut}`);
          alertCourseRef.current = course;
          setAlertCourse(course);
        }
        // Course déjà affichée → mettre à jour les données
        else if (alertCourseRef.current?.id === ev.id) {
          console.log(`[DRIVER_ALERT] course UPDATE existing alert: ${ev.id} | new statut: ${course.statut}`);
          alertCourseRef.current = course;
          setAlertCourse(course);
        }
      }
    });
    console.log('[DRIVER_ALERT] Course subscription active');
    return () => { if (unsub) unsub(); };
  }, []);

  // ── SOURCE SECONDAIRE : Notification.subscribe() — pour assignation admin ─
  // Complément : si la course est déjà "acceptee" dans la subscription mais notif arrive
  useEffect(() => {
    const unsub = base44.entities.Notification.subscribe((notif) => {
      const email = userEmailRef.current;
      if (!email || !notif.data) return;
      if (notif.data.destinataire_email !== email) return;

      const titre = notif.data.titre || '';
      const isCourseNotif = titre.toLowerCase().includes('nouvelle course') ||
                            titre.toLowerCase().includes('course assignée') ||
                            titre.toLowerCase().includes('nouveau trajet');
      if (!isCourseNotif || !notif.data.course_id) return;

      console.log(`[DRIVER_ALERT] Notification received for course: ${notif.data.course_id} | titre: ${titre}`);

      // Si la subscription Course a déjà affiché le bloc → ne pas refaire un fetch
      if (alertCourseRef.current?.id === notif.data.course_id) {
        console.log('[DRIVER_ALERT] bloc already shown for this course, skipping fetch');
        return;
      }

      // Fetch uniquement si la subscription Course n'a pas encore déclenché le bloc
      base44.entities.Course.filter({ id: notif.data.course_id }).then(courses => {
        if (!courses?.[0]) return;
        const course = courses[0];
        if (course.livreur_email !== email) return;
        if (alertCourseRef.current?.id === course.id) return;
        console.log(`[DRIVER_ALERT] Notification fallback showing course: ${course.id}`);
        alertCourseRef.current = course;
        setAlertCourse(course);
      }).catch(() => {});
    });
    return () => { if (unsub) unsub(); };
  }, []);

  const clearAlert = useCallback(() => {
    alertCourseRef.current = null;
    setAlertCourse(null);
  }, []);

  return { alertCourse, clearAlert, user };
}