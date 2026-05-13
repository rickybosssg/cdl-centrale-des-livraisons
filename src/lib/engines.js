/**
 * engines.js — Point d'entrée unique pour tous les moteurs centraux CDL
 *
 * USAGE :
 *   import { AuthEngine, BedouEngine, NotificationEngine } from '@/lib/engines';
 *
 * MIGRATION PROGRESSIVE :
 *   1. Importer depuis ici au lieu des modules individuels
 *   2. Chaque moteur est compatible avec l'existant (pas de breaking change)
 *   3. Logs [ENGINE_INIT] / [ENGINE_READY] au chargement
 */

// ── Moteurs prioritaires (chargés en premier) ─────────────────────────────────
export { default as AuthEngine }        from './AuthEngine';
export { default as PermissionEngine }  from './PermissionEngine';
export { default as NetworkEngine }     from './NetworkEngine';
export { default as AuditEngine }       from './AuditEngine';

// ── Moteurs métier ─────────────────────────────────────────────────────────────
export { default as BedouEngine }        from './BedouEngine';
export { default as NotificationEngine } from './NotificationEngine';
export { default as DispatchEngine }     from './DispatchEngine';
export { default as ProfileEngine }      from './ProfileEngine';
export { default as CourseStatusEngine } from './CourseStatusEngine';
export { default as FcmTokenEngine }     from './FcmTokenEngine';

// ── Moteurs utilitaires ────────────────────────────────────────────────────────
export { default as LocationEngine }    from './LocationEngine';
export { default as UploadEngine }      from './UploadEngine';
export { default as CacheEngine }       from './CacheEngine';
export { default as UIStateEngine }     from './UIStateEngine';
export { default as RealtimeSyncEngine } from './RealtimeSyncEngine';

console.log('[ENGINE_READY] All CDL engines loaded');