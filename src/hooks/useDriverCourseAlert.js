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
  // File d'attente : events reçus AVANT que userEmail soit connu
  const pendingEventsRef = useRef([]);

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

      // Vérifier immédiatement s'il y a une course assignée en attente (cas app déjà ouverte)
      base44.entities.Course.filter({ livreur_email: me.email, statut: "assignee_attente" }, "-created_date", 1)
        .then(data => {
          if (data?.[0]) {
            console.log('[COURSE_ALERT_RECEIVED] initial fetch found pending course:', data[0].id);
            alertCourseRef.current = data[0];
            setAlertCourse(data[0]);
          } else {
            console.log('[COURSE_ALERT_RECEIVED] initial fetch: no assignee_attente course');
          }
        })
        .catch((e) => console.log('[COURSE_ALERT_HIDDEN_REASON] initial fetch error:', e?.message));

      // Drainer les events reçus avant que l'email soit connu
      const pending = pendingEventsRef.current;
      pendingEventsRef.current = [];
      pending.forEach(ev => processEvent(ev, me.email));
    }).catch((e) => console.log('[COURSE_ALERT_HIDDEN_REASON] auth.me() error:', e?.message));
  }, []);

  // ── Traitement d'un event Course ────────────────────────────────────────
  const processEvent = useCallback((ev, emailOverride) => {
    const email = emailOverride || userEmailRef.current;
    if (!email) {
      // Email pas encore connu → mettre en file
      pendingEventsRef.current.push(ev);
      console.log('[COURSE_ALERT_HIDDEN_REASON] email not ready yet, queuing event', ev.id);
      return;
    }
    if (!ev.data) {
      // Update sans data (rare) → si c'est notre course active, fermer
      if (alertCourseRef.current?.id === ev.id) {
        console.log('[COURSE_ALERT_HIDDEN_REASON] event has no data, closing alert for', ev.id);
        alertCourseRef.current = null;
        setAlertCourse(null);
      }
      return;
    }

    const isForMe = ev.data.livreur_email === email;
    const isProposed = ev.data.statut === "assignee_attente";
    const wasOurCourse = alertCourseRef.current?.id === ev.id;

    console.log('[COURSE_ALERT_RECEIVED] event:', ev.type, 'course:', ev.id,
      '| livreur_email:', ev.data.livreur_email, '| statut:', ev.data.statut,
      '| isForMe:', isForMe, '| isProposed:', isProposed);

    if (isForMe && isProposed) {
      if (alertCourseRef.current?.id !== ev.data.id) {
        console.log('[COURSE_ALERT_RENDERED] showing alert for course:', ev.data.id);
        alertCourseRef.current = ev.data;
        setAlertCourse(ev.data);
      } else {
        console.log('[COURSE_ALERT_HIDDEN_REASON] duplicate event for same course:', ev.data.id);
      }
    } else if (wasOurCourse) {
      console.log('[COURSE_ALERT_HIDDEN_REASON] our course changed status/driver, closing. new statut:', ev.data.statut);
      alertCourseRef.current = null;
      setAlertCourse(null);
    } else {
      console.log('[COURSE_ALERT_HIDDEN_REASON] event not for me or wrong status.',
        'livreur_email:', ev.data.livreur_email, 'expected:', email,
        'statut:', ev.data.statut);
    }
  }, []);

  // ── Subscription BDD — démarre IMMÉDIATEMENT (avant que l'email soit connu) ──
  useEffect(() => {
    const unsub = base44.entities.Course.subscribe((ev) => {
      processEvent(ev, null);
    });
    return () => { if (unsub) unsub(); };
  }, [processEvent]);

  const clearAlert = useCallback(() => {
    console.log('[COURSE_ALERT_HIDDEN_REASON] manually cleared by user');
    alertCourseRef.current = null;
    setAlertCourse(null);
  }, []);

  return { alertCourse, clearAlert, user };
}