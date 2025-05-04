// src/lib/firebase/clientApp.ts
import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, Firestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, FirebaseStorage, connectStorageEmulator } from "firebase/storage"; // Import Storage

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
let storage: FirebaseStorage | null = null; // Add storage variable
let firebaseConfigValid = true; // Assume valid initially
let initError: string | null = null; // Store initialization error message

// --- Perform checks and initialization only on the client-side ---
if (typeof window !== 'undefined') {
  console.log("[Firebase Client] Running client-side initialization checks...");

  // Check for missing or placeholder values provided by the environment
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === "YOUR_API_KEY") {
    initError = "CRITICAL: Firebase API Key (NEXT_PUBLIC_FIREBASE_API_KEY) is missing or is the placeholder 'YOUR_API_KEY'. Update .env.local or check Firebase Studio environment configuration.";
    firebaseConfigValid = false;
    console.error(`[Firebase Client] ${initError}`);
  } else if (!firebaseConfig.authDomain || firebaseConfig.authDomain === "YOUR_AUTH_DOMAIN") {
    initError = "CRITICAL: Firebase Auth Domain (NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN) is missing or is the placeholder 'YOUR_AUTH_DOMAIN'. Update .env.local or check Firebase Studio environment configuration.";
    firebaseConfigValid = false;
     console.error(`[Firebase Client] ${initError}`);
  } else if (!firebaseConfig.projectId || firebaseConfig.projectId === "YOUR_PROJECT_ID") {
    initError = "CRITICAL: Firebase Project ID (NEXT_PUBLIC_FIREBASE_PROJECT_ID) is missing or is the placeholder 'YOUR_PROJECT_ID'. Update .env.local or check Firebase Studio environment configuration.";
    firebaseConfigValid = false;
     console.error(`[Firebase Client] ${initError}`);
  } else if (!firebaseConfig.storageBucket || firebaseConfig.storageBucket === "YOUR_STORAGE_BUCKET") {
    // Add check for storage bucket
    initError = "CRITICAL: Firebase Storage Bucket (NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) is missing or is the placeholder 'YOUR_STORAGE_BUCKET'. Update .env.local or check Firebase Studio environment configuration.";
    firebaseConfigValid = false;
     console.error(`[Firebase Client] ${initError}`);
  }
  else if (!firebaseConfig.appId || firebaseConfig.appId === "YOUR_APP_ID") {
    initError = "CRITICAL: Firebase App ID (NEXT_PUBLIC_FIREBASE_APP_ID) is missing or is the placeholder 'YOUR_APP_ID'. Update .env.local or check Firebase Studio environment configuration.";
    firebaseConfigValid = false;
     console.error(`[Firebase Client] ${initError}`);
  }


  // Attempt initialization only if the config appears valid *after* checks
  if (firebaseConfigValid) {
    console.log("[Firebase Client] Config appears valid. Attempting initialization...");
    if (!getApps().length) {
      try {
        // Initialize with the config read from the environment
        app = initializeApp(firebaseConfig as any); // Cast needed as TS might complain about optional fields
        console.log("[Firebase Client] Firebase App initialized successfully.");
      } catch (error) {
        initError = `Firebase App initialization failed: ${error instanceof Error ? error.message : String(error)}`;
        console.error(`[Firebase Client] ${initError}`);
        app = null; // Ensure app is null if init fails
        firebaseConfigValid = false; // Confirm invalidity
      }
    } else {
      app = getApp();
      console.log("[Firebase Client] Firebase App already exists.");
    }

    // Initialize Auth, Firestore, and Storage only if app was successfully initialized
    if (app) {
       console.log("[Firebase Client] App instance exists. Initializing services...");
      try {
        auth = getAuth(app);
        console.log("[Firebase Client] Auth service initialized.");
        db = getFirestore(app);
         console.log("[Firebase Client] Firestore service initialized.");
        storage = getStorage(app); // Initialize Storage
         console.log("[Firebase Client] Storage service initialized.");

        // --- Optional: Emulators for development ---
        // Determine if running in development and if emulators should be used
        const useEmulators = process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true';

        if (useEmulators) {
            console.log("[Firebase Client] Emulators enabled in config. Connecting...");
            // Default emulator hosts and ports
            const authHost = process.env.NEXT_PUBLIC_AUTH_EMULATOR_HOST || "localhost";
            const authPort = parseInt(process.env.NEXT_PUBLIC_AUTH_EMULATOR_PORT || "9099", 10);
            const firestoreHost = process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST || "localhost";
            const firestorePort = parseInt(process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT || "8080", 10);
            const storageHost = process.env.NEXT_PUBLIC_STORAGE_EMULATOR_HOST || "localhost"; // Default storage emulator host
            const storagePort = parseInt(process.env.NEXT_PUBLIC_STORAGE_EMULATOR_PORT || "9199", 10); // Default storage emulator port


            console.log(`[Firebase Client] Connecting to Firebase Auth Emulator at http://${authHost}:${authPort}`);
            // Check if already connected (simple check)
            if (!('_emulatorHostAndPort' in auth) || !auth._emulatorHostAndPort) {
                try {
                    connectAuthEmulator(auth, `http://${authHost}:${authPort}`, { disableWarnings: true });
                    console.log("[Firebase Client] Auth Emulator connected.");
                } catch (e) {
                    console.error("[Firebase Client] Error connecting to Auth Emulator:", e);
                }
            } else {
                console.log("[Firebase Client] Auth Emulator already connected.");
            }


            console.log(`[Firebase Client] Connecting to Firebase Firestore Emulator at ${firestoreHost}:${firestorePort}`);
            // Check Firestore connection status (heuristic)
            let firestoreEmulatorConnected = false;
            try {
                if (db && (db as any)?._settings?.host?.includes(firestoreHost) && (db as any)?._settings?.port === firestorePort) {
                     firestoreEmulatorConnected = true;
                }
            } catch (e) { /* ignore potential property access errors */ }

            if (!firestoreEmulatorConnected) {
                 try {
                     connectFirestoreEmulator(db, firestoreHost, firestorePort);
                     console.log("[Firebase Client] Firestore Emulator connected.");
                 } catch (e) {
                      console.error("[Firebase Client] Error connecting to Firestore Emulator:", e);
                 }
            } else {
                 console.log("[Firebase Client] Firestore Emulator already connected.");
            }


             console.log(`[Firebase Client] Connecting to Firebase Storage Emulator at ${storageHost}:${storagePort}`);
             // Check Storage connection status (heuristic)
             let storageEmulatorConnected = false;
             try {
                  // Internal properties might change, this is brittle
                 if (storage && (storage as any)._service?.host?.includes(storageHost) && (storage as any)._service?.port === storagePort) {
                     storageEmulatorConnected = true;
                 }
             } catch(e) { /* ignore */ }

             if (!storageEmulatorConnected) {
                 try {
                     connectStorageEmulator(storage, storageHost, storagePort);
                     console.log("[Firebase Client] Storage Emulator connected.");
                 } catch (e) {
                      console.error("[Firebase Client] Error connecting to Storage Emulator:", e);
                 }
             } else {
                 console.log("[Firebase Client] Storage Emulator already connected.");
             }

        } else {
             console.log("[Firebase Client] Emulators not configured or disabled.");
        }
        // --- End Emulator Section ---
      } catch (error) {
        initError = `Failed to initialize Firebase Auth/Firestore/Storage: ${error instanceof Error ? error.message : String(error)}`;
        console.error(`[Firebase Client] ${initError}`);
        auth = null; // Set auth to null if its initialization fails
        db = null;   // Set db to null if its initialization fails
        storage = null; // Set storage to null if its initialization fails
        firebaseConfigValid = false; // Mark config as invalid due to service init failure
      }
    } else {
      // If app initialization failed, ensure services are null
       console.error("[Firebase Client] App initialization failed. Services (Auth, Firestore, Storage) will not be initialized.");
      auth = null;
      db = null;
      storage = null;
      // initError should already be set from app init failure
      firebaseConfigValid = false;
    }
  } else {
    // Config was deemed invalid from the start, ensure services are null
    console.error(`[Firebase Client] Firebase configuration invalid from start. Services not initialized. Error: ${initError}`);
    app = null;
    auth = null;
    db = null;
    storage = null;
  }
} else {
  // Server-side rendering or other non-browser environments: app, auth, db, storage remain null
  console.log("[Firebase Client] Initialization skipped (not in a client-side browser environment).");
}

// Export the instances (which will be null if config is invalid or on server)
// Also export the validation status and any initialization error
export { app, auth, db, storage, firebaseConfigValid, initError }; // Export storage
