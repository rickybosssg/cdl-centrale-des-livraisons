/**
 * useDriverCourseAlert — Hook global realtime pour la carte d'acceptation livreur
 *
 * SOURCE UNIQUE : Notification interne (entity Notification)
 * Si notification interne arrive avec course_id → bloc résumé affiché IMMÉDIATEMENT
 *
 * RÈGLE ABSOLUE : "notification interne reçue = bloc résumé affiché avec le même course_id"
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
  // File d'attente : notifications reçues AVANT que userEmail soit connu
  const pendingNotifsRef = useRef([]);

  // ── Charger l'user, puis drainer la file d'attente ─────────────────────
  useEffect(() => {
    base44.auth.me().then(me => {
      if (!me?.email) {
        console.log('[COURSE_ALERT_HIDDEN_REASON] auth.me() returned no email');
        return;
      }
      setUser(me);
      userEmailRef.current = me.email;
      console.log('[COURSE_ALERT_RECEIVED] userEmail ready:', me.email);

      // Vérifier immédiatement s'il y a une notification "nouvelle course" non lue
      base44.entities.Notification.filter({ 
        destinataire_email: me.email, 
        lue: false,
        titre: { $regex: "nouvelle course|nouveau trajet|course assignée" }
      }, "-created_date", 1)
        .then(notifs => {
          if (notifs?.[0]?.course_id) {
            console.log('[COURSE_ALERT_RECEIVED] initial fetch found notification for course:', notifs[0].course_id);
            // Charger la course depuis BDD
            base44.entities.Course.filter({ id: notifs[0].course_id }).then(courses => {
              if (courses?.[0]) {
                alertCourseRef.current = courses[0];
                setAlertCourse(courses[0]);
                console.log('[COURSE_ALERT_RENDERED] showing alert from initial notification, course:', courses[0].id);
              }
            }).catch(() => {});
          } else {
            console.log('[COURSE_ALERT_RECEIVED] initial fetch: no new course notification');
          }
        })
        .catch((e) => console.log('[COURSE_ALERT_HIDDEN_REASON] initial notification fetch error:', e?.message));

      // Drainer les notifications reçues avant que l'email soit connu
      const pending = pendingNotifsRef.current;
      pendingNotifsRef.current = [];
      pending.forEach(notif => processNotification(notif, me.email));
    }).catch((e) => console.log('[COURSE_ALERT_HIDDEN_REASON] auth.me() error:', e?.message));
  }, []);

  // ── Traitement d'une notification "nouvelle course" ─────────────────────
  const processNotification = useCallback((notif, emailOverride) => {
    const email = emailOverride || userEmailRef.current;
    if (!email) {
      pendingNotifsRef.current.push(notif);
      console.log('[COURSE_ALERT_HIDDEN_REASON] email not ready yet, queuing notification', notif.id);
      return;
    }
    if (notif.data?.destinataire_email !== email) return;
    
    // Vérifier si c'est une notification de nouvelle course
    const titre = notif.data?.titre || notif.titre;
    const isCourseNotif = titre && (
      titre.toLowerCase().includes('nouvelle course') ||
      titre.toLowerCase().includes('nouveau trajet') ||
      titre.toLowerCase().includes('course assignée')
    );
    
    if (!isCourseNotif || !notif.data?.course_id) {
      console.log('[COURSE_ALERT_HIDDEN_REASON] notification not a course alert:', titre);
      return;
    }

    console.log('[COURSE_ALERT_RECEIVED] notification course detected:', notif.data.course_id, '| titre:', titre);

    // Charger la course depuis BDD — source de vérité
    base44.entities.Course.filter({ id: notif.data.course_id }).then(courses => {
      if (!courses?.[0]) {
        console.log('[COURSE_ALERT_HIDDEN_REASON] course not found:', notif.data.course_id);
        return;
      }
      const course = courses[0];
      
      // Vérifier que la course est bien pour ce livreur
      if (course.livreur_email !== email) {
        console.log('[COURSE_ALERT_HIDDEN_REASON] course livreur_email mismatch:', course.livreur_email, '!=', email);
        return;
      }

      // Afficher l'alerte — PEU IMPORTE LE STATUT
      // La notification interne est la source de vérité
      if (alertCourseRef.current?.id !== course.id) {
        console.log('[COURSE_ALERT_RENDERED] showing alert from notification, course:', course.id, '| statut:', course.statut);
        alertCourseRef.current = course;
        setAlertCourse(course);
      } else {
        console.log('[COURSE_ALERT_HIDDEN_REASON] duplicate notification for same course:', course.id);
      }
    }).catch((e) => console.log('[COURSE_ALERT_HIDDEN_REASON] course fetch error:', e?.message));
  }, []);

  // ── Subscription Notification — SOURCE DE VÉRITÉ ────────────────────────
  useEffect(() => {
    const unsub = base44.entities.Notification.subscribe((notif) => {
      console.log('[COURSE_ALERT_NOTIFICATION_EVENT] type:', notif.type, '| id:', notif.id, '| course_id:', notif.data?.course_id, '| titre:', notif.data?.titre);
      processNotification(notif, null);
    });
    console.log('[COURSE_ALERT_NOTIFICATION_SUBSCRIBE] subscription active');
    return () => { if (unsub) unsub(); };
  }, [processNotification]);

  // ── Subscription Course — en parallèle (fallback) ───────────────────────
  useEffect(() => {
    const unsub = base44.entities.Course.subscribe((ev) => {
      // Seulement si alerte déjà affichée — pour mettre à jour les données
      if (alertCourseRef.current?.id === ev.id && ev.data) {
        console.log('[COURSE_ALERT_UPDATE] updating existing alert, course:', ev.id, '| new statut:', ev.data.statut);
        alertCourseRef.current = ev.data;
        setAlertCourse(ev.data);
      }
    });
    return () => { if (unsub) unsub(); };
  }, []);

  const clearAlert = useCallback(() => {
    console.log('[COURSE_ALERT_HIDDEN_REASON] manually cleared by user');
    alertCourseRef.current = null;
    setAlertCourse(null);
  }, []);

  return { alertCourse, clearAlert, user };
}