// src/lib/firebase/clientApp.ts
import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, Firestore, connectFirestoreEmulator } from "firebase/firestore";

// Validate environment variables
const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
// measurementId is optional
const measurementId = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID;


// Explicitly check for placeholder values on the client-side
let firebaseConfigValid = true; // Assume valid initially
if (typeof window !== 'undefined') {
    if (!apiKey || apiKey === "YOUR_API_KEY") {
        console.error("CRITICAL: Firebase API Key (NEXT_PUBLIC_FIREBASE_API_KEY) is missing or is still the placeholder value 'YOUR_API_KEY'. Firebase features will NOT work. Update .env.local.");
        firebaseConfigValid = false; // Mark as invalid, but continue initialization attempt
    }
    if (!authDomain || authDomain === "YOUR_AUTH_DOMAIN") {
        console.error("CRITICAL: Firebase Auth Domain (NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN) is missing or is the placeholder. Update .env.local.");
        firebaseConfigValid = false;
    }
     if (!projectId || projectId === "YOUR_PROJECT_ID") {
        console.error("CRITICAL: Firebase Project ID (NEXT_PUBLIC_FIREBASE_PROJECT_ID) is missing or is the placeholder. Update .env.local.");
        firebaseConfigValid = false;
    }
     // Add checks for other essential placeholders if needed, e.g., appId
    if (!appId || appId === "YOUR_APP_ID") {
        console.error("CRITICAL: Firebase App ID (NEXT_PUBLIC_FIREBASE_APP_ID) is missing or is the placeholder. Update .env.local.");
        firebaseConfigValid = false;
    }
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
let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

// Only attempt initialization on the client-side.
// If config is invalid, it will likely fail gracefully during service initialization (getAuth, getFirestore).
if (typeof window !== 'undefined') {
    if (!firebaseConfigValid) {
        console.warn("Attempting Firebase initialization with invalid or placeholder configuration. Firebase features will likely fail.");
    }

    if (!getApps().length) {
        try {
            // Attempt initialization even if config looks invalid, maybe user fixed it without refresh
            app = initializeApp(firebaseConfig);
             console.log("Firebase initialized attempt.");
        } catch (error) {
             console.error("Firebase initialization failed:", error);
             // If init itself fails (e.g., invalid config format), ensure app is null.
             app = null;
             firebaseConfigValid = false; // Confirm invalidity if init fails
        }

    } else {
        app = getApp();
         console.log("Firebase app already exists.");
    }

    // Initialize Auth and Firestore only if app exists
    // These might fail later if the config values (like API key) are truly invalid.
    if (app) {
        try {
            auth = getAuth(app);
            // Example for using emulators during development (optional)
            // if (process.env.NODE_ENV === 'development') {
            //   console.log("Connecting to Firebase Auth Emulator");
            //   connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
            // }
        } catch (error) {
            console.error("Failed to initialize Firebase Auth:", error);
            auth = null;
        }
        try {
            db = getFirestore(app);
             // Example for using emulators during development (optional)
            // if (process.env.NODE_ENV === 'development') {
            //   console.log("Connecting to Firebase Firestore Emulator");
            //   connectFirestoreEmulator(db, 'localhost', 8080);
            // }
        } catch (error) {
            console.error("Failed to initialize Firebase Firestore:", error);
            db = null;
        }
    } else {
         // If app initialization failed, ensure auth and db are null
         auth = null;
         db = null;
         console.error("Firebase app initialization failed, skipping Auth and Firestore setup.");
    }

} else {
    // Server-side rendering or other environments: app, auth, db remain null
     // console.log("Firebase initialization skipped (not in a client-side browser environment).");
}


// Export the instances (might be null if initialization failed or skipped)
export { app, auth, db };
