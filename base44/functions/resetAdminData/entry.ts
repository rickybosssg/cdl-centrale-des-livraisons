import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Vérifier si admin
    if (user?.role !== 'admin' && user?.user_type !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    console.log('[resetAdminData] Réinitialisation par:', user.email);

    // Récupérer et supprimer toutes les courses
    const courses = await base44.asServiceRole.entities.Course.list('-created_date', 1000);
    console.log(`[resetAdminData] ${courses.length} courses à supprimer`);

    let deletedCount = 0;
    for (const course of courses) {
      try {
        await base44.asServiceRole.entities.Course.delete(course.id);
        deletedCount++;
      } catch (err) {
        console.error(`[resetAdminData] Erreur suppression course ${course.id}:`, err.message);
      }
    }

    // Réinitialiser les statuts de transactions
    const transactions = await base44.asServiceRole.entities.Transaction.list('-created_date', 1000);
    console.log(`[resetAdminData] ${transactions.length} transactions trouvées`);

    // Récupérer et réinitialiser le Bedou CDL
    const bedouList = await base44.asServiceRole.entities.Bedou.filter({ user_email: 'weezyh2@gmail.com' });
    if (bedouList.length > 0) {
      const cdlBedou = bedouList[0];
      console.log(`[resetAdminData] Réinitialisation Bedou CDL - ancien solde: ${cdlBedou.solde}`);
      await base44.asServiceRole.entities.Bedou.update(cdlBedou.id, {
        solde: 0,
        solde_disponible: 0,
        solde_bloque: 0,
        gains_totaux: 0,
        depenses_totales: 0,
      });
    }

    console.log(`[resetAdminData] ✅ Réinitialisation complète: ${deletedCount} courses supprimées`);

    return Response.json({
      success: true,
      deleted_courses: deletedCount,
      message: `${deletedCount} courses supprimées, statistiques réinitialisées`,
    });
  } catch (error) {
    console.error('[resetAdminData] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});