/**
 * Configuration Firebase minimale — temporaire pour test
 * Utilise les variables d'environnement existantes
 */

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyA_example',
  authDomain: 'cdl-ouaga.firebaseapp.com',
  projectId: 'cdl-ouaga',
  storageBucket: 'cdl-ouaga.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '123456789',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:123456789:web:abcdef123456',
  vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY || 'BCxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
};

console.log('[firebaseConfig] Config chargée:', {
  apiKey: '***',
  projectId: firebaseConfig.projectId,
  messagingSenderId: firebaseConfig.messagingSenderId,
  appId: firebaseConfig.appId,
  vapidKey: firebaseConfig.vapidKey ? '***' : 'MANQUANT',
});