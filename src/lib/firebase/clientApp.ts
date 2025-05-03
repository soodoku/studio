
// src/lib/firebase/clientApp.ts
import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, Firestore, connectFirestoreEmulator } from "firebase/firestore";

// Define Firebase config type
interface FirebaseConfig {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  measurementId?: string;
}

// Read environment variables - These are expected to be injected by Firebase Studio
const firebaseConfig: FirebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID, // Optional
};

// Initialize Firebase variables as null
let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let firebaseConfigValid = true; // Assume valid initially
let initError: string | null = null; // Store initialization error message

// --- Perform checks and initialization only on the client-side ---
if (typeof window !== 'undefined') {
  // Check for missing or placeholder values provided by the environment
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === "YOUR_API_KEY") {
    initError = "CRITICAL: Firebase API Key (NEXT_PUBLIC_FIREBASE_API_KEY) is missing or is the placeholder 'YOUR_API_KEY'. Update .env.local or check Firebase Studio environment configuration.";
    firebaseConfigValid = false;
  } else if (!firebaseConfig.authDomain || firebaseConfig.authDomain === "YOUR_AUTH_DOMAIN") {
    initError = "CRITICAL: Firebase Auth Domain (NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN) is missing or is the placeholder 'YOUR_AUTH_DOMAIN'. Update .env.local or check Firebase Studio environment configuration.";
    firebaseConfigValid = false;
  } else if (!firebaseConfig.projectId || firebaseConfig.projectId === "YOUR_PROJECT_ID") {
    initError = "CRITICAL: Firebase Project ID (NEXT_PUBLIC_FIREBASE_PROJECT_ID) is missing or is the placeholder 'YOUR_PROJECT_ID'. Update .env.local or check Firebase Studio environment configuration.";
    firebaseConfigValid = false;
  } else if (!firebaseConfig.appId || firebaseConfig.appId === "YOUR_APP_ID") {
    initError = "CRITICAL: Firebase App ID (NEXT_PUBLIC_FIREBASE_APP_ID) is missing or is the placeholder 'YOUR_APP_ID'. Update .env.local or check Firebase Studio environment configuration.";
    firebaseConfigValid = false;
  }
  // Add more checks if other variables are essential (e.g., storageBucket)

  // Attempt initialization only if the config appears valid *after* checks
  if (firebaseConfigValid) {
    if (!getApps().length) {
      try {
        // Initialize with the config read from the environment
        app = initializeApp(firebaseConfig as any); // Cast needed as TS might complain about optional fields
        console.log("Firebase initialized successfully.");
      } catch (error) {
        initError = `Firebase initialization failed: ${error instanceof Error ? error.message : String(error)}`;
        console.error(initError);
        app = null; // Ensure app is null if init fails
        firebaseConfigValid = false; // Confirm invalidity
      }
    } else {
      app = getApp();
      console.log("Firebase app already exists.");
    }

    // Initialize Auth and Firestore only if app was successfully initialized
    if (app) {
      try {
        auth = getAuth(app);
        // --- Optional: Emulators for development ---
        // Determine if running in development and if emulators should be used
        // Firebase Studio typically doesn't use local emulators by default, but check env var if needed.
        const useEmulators = process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true';

        if (useEmulators) {
            // Default emulator hosts and ports
            const authHost = process.env.NEXT_PUBLIC_AUTH_EMULATOR_HOST || "localhost";
            const authPort = parseInt(process.env.NEXT_PUBLIC_AUTH_EMULATOR_PORT || "9099", 10);
            const firestoreHost = process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST || "localhost";
            const firestorePort = parseInt(process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT || "8080", 10);

            console.log(`Connecting to Firebase Auth Emulator at http://${authHost}:${authPort}`);
            if (!('_emulatorHostAndPort' in auth) || !auth._emulatorHostAndPort) {
                connectAuthEmulator(auth, `http://${authHost}:${authPort}`, { disableWarnings: true });
            } else {
                console.log("Auth Emulator already connected.");
            }

            db = getFirestore(app);
            console.log(`Connecting to Firebase Firestore Emulator at ${firestoreHost}:${firestorePort}`);
            if (!db.toJSON().settings.host?.includes(firestoreHost)) { // Check if already connected
                connectFirestoreEmulator(db, firestoreHost, firestorePort);
            } else {
                 console.log("Firestore Emulator already connected.");
            }
        } else {
            // Initialize Firestore for production/non-emulator environment
            db = getFirestore(app);
        }
        // --- End Emulator Section ---
      } catch (error) {
        initError = `Failed to initialize Firebase Auth/Firestore: ${error instanceof Error ? error.message : String(error)}`;
        console.error(initError);
        auth = null; // Set auth to null if its initialization fails
        db = null;   // Set db to null if its initialization fails
        firebaseConfigValid = false;
      }
    } else {
      // If app initialization failed, ensure auth and db are null
      auth = null;
      db = null;
      initError = initError || "Firebase app initialization did not complete, skipping Auth and Firestore setup."; // Keep previous error if exists
      console.error(initError);
      firebaseConfigValid = false;
    }
  } else {
    // Config was deemed invalid from the start, ensure services are null
    app = null;
    auth = null;
    db = null;
    // Log the specific initError found during checks
    console.error(`Firebase configuration is invalid. ${initError || 'Missing or placeholder values.'} Firebase services (Auth, Firestore) will not be available.`);
  }
} else {
  // Server-side rendering or other non-browser environments: app, auth, db remain null
  // console.log("Firebase initialization skipped (not in a client-side browser environment).");
}

// Export the instances (which will be null if config is invalid or on server)
// Also export the validation status and any initialization error
export { app, auth, db, firebaseConfigValid, initError };
