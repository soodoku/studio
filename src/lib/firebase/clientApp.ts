// src/lib/firebase/clientApp.ts
import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";

// Validate environment variables
const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
// measurementId is optional
const measurementId = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID;


if (typeof window !== 'undefined' && !apiKey) {
    console.error("Firebase API Key (NEXT_PUBLIC_FIREBASE_API_KEY) is missing. Firebase will not be initialized. Please check your .env.local file.");
    // Optionally, throw an error to halt execution if Firebase is critical
    // throw new Error("Firebase API Key is missing.");
}
if (typeof window !== 'undefined' && !projectId) {
    console.error("Firebase Project ID (NEXT_PUBLIC_FIREBASE_PROJECT_ID) is missing. Firebase will not be initialized properly. Please check your .env.local file.");
}


const firebaseConfig = {
  apiKey: apiKey,
  authDomain: authDomain,
  projectId: projectId,
  storageBucket: storageBucket,
  messagingSenderId: messagingSenderId,
  appId: appId,
  measurementId: measurementId,
};

// Initialize Firebase
let app: FirebaseApp | null = null; // Initialize as null
let auth: Auth | null = null; // Initialize as null
let db: Firestore | null = null; // Initialize as null

if (typeof window !== 'undefined' && apiKey && projectId) { // Only initialize if key and projectId exist
    if (!getApps().length) {
        try {
            app = initializeApp(firebaseConfig);
             console.log("Firebase initialized successfully.");
        } catch (error) {
             console.error("Firebase initialization failed:", error);
             // Prevent further initialization if core app fails
             app = null;
        }

    } else {
        app = getApp();
         console.log("Firebase app already initialized.");
    }

    if (app) {
        try {
            auth = getAuth(app);
        } catch (error) {
            console.error("Failed to initialize Firebase Auth:", error);
            auth = null;
        }
        try {
            db = getFirestore(app);
        } catch (error) {
            console.error("Failed to initialize Firebase Firestore:", error);
            db = null;
        }
    }

} else if (typeof window !== 'undefined') {
     console.warn("Firebase not initialized due to missing configuration (API Key or Project ID).");
} else {
    // Server-side or missing config: app, auth, db remain null
}


// Export the instances for use in other client components/hooks
// These might be null, handle accordingly in usage.
export { app, auth, db };
