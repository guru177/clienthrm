import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getMessaging, type Messaging } from 'firebase/messaging';

const firebaseConfig = {
    apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId:             import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Only initialize Firebase if projectId is configured (not available in builds without env vars)
let app: FirebaseApp | null = null;
let messaging: Messaging | null = null;

if (firebaseConfig.projectId) {
    try {
        app = initializeApp(firebaseConfig);

        // Messaging only works in browsers (not SSR)
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
            messaging = getMessaging(app);
        }
    } catch (e) {
        console.warn('Firebase initialization skipped:', e);
    }
}

export { messaging };
export const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string;
