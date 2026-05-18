/**
 * Test de validation — Preuve "notification interne = bloc résumé"
 * 
 * USAGE :
 * 1. Ouvrir la console navigateur (F12)
 * 2. Filtrer sur "[COURSE_ALERT_" ou "[✅ BLOC_RÉSUMÉ_AFFICHÉ]"
 * 3. Déclencher une course manuellement (admin → créer course → assigner livreur)
 * 4. Vérifier dans la console :
 *    - [COURSE_ALERT_NOTIFICATION_EVENT] → notification reçue
 *    - [COURSE_ALERT_RENDERED] → bloc affiché
 *    - [✅ BLOC_RÉSUMÉ_AFFICHÉ] → preuve finale dans NewCourseAlert
 * 
 * RÉSULTAT ATTENDU :
 * "notification_interne_reçue = bloc_résumé_affiché (même course_id: XXX)"
 */

import { useEffect } from "react";
import { base44 } from "@/api/base44Client";

export default function CourseAlertProofTest() {
  useEffect(() => {
    console.log('🔍 [TEST_START] Monitoring notifications et courses...');
    
    // Monitor notifications
    const unsubNotif = base44.entities.Notification.subscribe((notif) => {
      const titre = notif.data?.titre || '';
      const isCourse = titre.toLowerCase().includes('nouvelle course') || 
                       titre.toLowerCase().includes('nouveau trajet');
      if (isCourse) {
        console.log('📬 [NOTIFICATION_REÇUE] course_id:', notif.data?.course_id, '| titre:', titre);
      }
    });
    
    // Monitor courses
    const unsubCourse = base44.entities.Course.subscribe((ev) => {
      if (ev.data?.statut === 'assignee_attente') {
        console.log('📦 [COURSE_ASSIGNÉE] course_id:', ev.id, '| livreur_email:', ev.data.livreur_email);
      }
    });
    
    return () => {
      unsubNotif?.();
      unsubCourse?.();
      console.log('🏁 [TEST_END] Monitoring stopped');
    };
  }, []);

  return (
    <div className="p-4 space-y-3 bg-blue-50 border border-blue-200 rounded-xl">
      <h2 className="font-bold text-blue-900">🧪 Test de validation — Bloc résumé</h2>
      <p className="text-xs text-blue-700">
        Ouvrez la console (F12) et cherchez :<br/>
        ✅ <code>[✅ BLOC_RÉSUMÉ_AFFICHÉ]</code><br/>
        📬 <code>[NOTIFICATION_REÇUE]</code><br/>
        📦 <code>[COURSE_ASSIGNÉE]</code>
      </p>
      <p className="text-xs text-blue-700 font-semibold">
        Preuve attendue : "notification_interne_reçue = bloc_résumé_affiché (même course_id: XXX)"
      </p>
    </div>
  );
}