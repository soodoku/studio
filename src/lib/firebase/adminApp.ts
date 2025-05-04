
import * as admin from 'firebase-admin';

// Ensure environment variables are set for server-side Firebase Admin SDK
// These might be automatically injected by Firebase Hosting/Functions,
// or you might need to set them manually (e.g., via .env or service account file).

// Check if the app is already initialized to prevent errors
let app: admin.app.App | null = null;
let initError: string | null = null; // Store initialization error
let isInitialized = false; // Track initialization status

/**
 * Initializes the Firebase Admin SDK, prioritizing Application Default Credentials (ADC).
 * Ensures initialization happens only once. Returns the initialized app instance or throws if initialization fails.
 * @returns {admin.app.App} The initialized Firebase Admin App instance.
 * @throws {Error} If initialization fails due to missing configuration or credential issues.
 */
export function initializeAdminApp(): admin.app.App {
    // Avoid re-initialization if already successful
    if (isInitialized && app) {
        // console.log('[Firebase Admin] Already initialized successfully.');
        return app;
    }
    // If initialization previously failed, re-throw the stored error immediately
    if (isInitialized && initError) {
        console.error(`[Firebase Admin] Attempting to re-initialize after previous failure: ${initError}`);
        throw new Error(`Firebase Admin SDK previously failed to initialize: ${initError}`);
    }

    // Mark as attempted (even if it fails)
    isInitialized = true;
    initError = null; // Reset error before attempting
    app = null; // Reset app before attempting

    console.log('[Firebase Admin] Attempting Firebase Admin SDK initialization...');
    try {
        const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
        const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
        const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

        // --- Critical Configuration Checks ---
        if (!projectId) {
            initError = 'CRITICAL: Firebase Project ID (NEXT_PUBLIC_FIREBASE_PROJECT_ID) is not set in the server environment for Admin SDK.';
            console.error(`[Firebase Admin] Initialization failed: ${initError}`);
            throw new Error(initError);
        }
        if (!storageBucket) {
            initError = 'CRITICAL: Firebase Storage Bucket (NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) is not set in the server environment for Admin SDK.';
            console.error(`[Firebase Admin] Initialization failed: ${initError}`);
            throw new Error(initError);
        }
        console.log(`[Firebase Admin] Using Project ID: ${projectId}, Storage Bucket: ${storageBucket}`);

        // --- Credential Loading Logic ---
        let credential;
        let credentialSource = 'unknown';

        try {
            // Priority 1: Application Default Credentials (expected in Firebase/GCP environments like Studio, Cloud Run, Functions)
            console.log('[Firebase Admin] Attempting to load credentials using admin.credential.applicationDefault().');
            credential = admin.credential.applicationDefault();
            credentialSource = 'Application Default Credentials (ADC)';
            console.log(`[Firebase Admin] Successfully loaded credentials using ${credentialSource}.`);
        } catch (adcError: any) {
            console.warn(`[Firebase Admin] Failed to load ADC: ${adcError.message}. Check if ADC are configured or if GOOGLE_APPLICATION_CREDENTIALS is set.`);
            // Priority 2: Service Account Path (if GOOGLE_APPLICATION_CREDENTIALS is set)
            if (serviceAccountPath) {
                console.log(`[Firebase Admin] ADC failed. Attempting to load credentials from GOOGLE_APPLICATION_CREDENTIALS path: ${serviceAccountPath}`);
                try {
                    // Ensure the path exists (basic check)
                    const fs = require('fs'); // Use require for conditional import in Node.js environment
                    if (!fs.existsSync(serviceAccountPath)) {
                         throw new Error(`Service account file not found at path: ${serviceAccountPath}`);
                    }
                    credential = admin.credential.cert(serviceAccountPath);
                    credentialSource = 'GOOGLE_APPLICATION_CREDENTIALS path';
                    console.log(`[Firebase Admin] Successfully loaded credentials from ${credentialSource}.`);
                } catch (certError: any) {
                    initError = `Failed to load credentials using ADC AND from path ${serviceAccountPath}. ADC Error: ${adcError.message}. Cert Error: ${certError.message}`;
                    console.error(`[Firebase Admin] Initialization failed: ${initError}`);
                    throw new Error(initError); // Critical failure - couldn't load credentials either way
                }
            } else {
                // ADC failed and no path was provided
                initError = `Failed to load credentials using ADC, and GOOGLE_APPLICATION_CREDENTIALS path was not set. Ensure the server environment has ADC configured (common in Firebase/GCP) or provide a service account key file path via the environment variable. ADC Error: ${adcError.message}`;
                console.error(`[Firebase Admin] Initialization failed: ${initError}`);
                throw new Error(initError); // Critical failure - no valid credential source found
            }
        }

        // --- Initialize App ---
        // Ensure an app isn't already initialized (e.g., by HMR or conflicting setups)
        if (admin.apps.length === 0) {
            console.log('[Firebase Admin] Calling admin.initializeApp...');
            admin.initializeApp({
                credential: credential,
                projectId: projectId, // Explicitly set project ID
                storageBucket: storageBucket // Set storage bucket
            });
            app = admin.app(); // Get the newly initialized app
            console.log(`[Firebase Admin] SDK initialized successfully for project ${projectId}. App Name: ${app.name}. Credentials loaded via: ${credentialSource}`);
        } else {
            console.warn('[Firebase Admin] admin.apps array was not empty before initializeApp. Getting existing default app.');
            app = admin.app(); // Get the existing default app
             // Verify existing app matches config (optional but good sanity check)
            if (app.options.projectId !== projectId || app.options.storageBucket !== storageBucket) {
                 console.error(`[Firebase Admin] Mismatch! Existing app projectId (${app.options.projectId}) or storageBucket (${app.options.storageBucket}) does not match environment config (${projectId}, ${storageBucket}). This might cause issues.`);
                 // Decide how to handle mismatch: throw error, log warning, etc.
                 // For now, we'll log and proceed with the existing app.
            } else {
                 console.log(`[Firebase Admin] Existing app configuration matches environment. Using existing app: ${app.name}`);
            }
        }

    } catch (error: any) {
        // Catch errors during the initialization block
        const errorMessage = error instanceof Error ? error.message : String(error);
        // Only set initError if it wasn't already set by a specific check inside
        if (!initError) {
            initError = `Firebase Admin SDK initialization process failed: ${errorMessage}`;
        }
        console.error('[Firebase Admin] CRITICAL INITIALIZATION FAILURE:', initError, error.stack);
        app = null; // Ensure app is null on failure
        // Re-throw the error to signal failure upstream clearly
        throw new Error(initError);
    }

    // Final check: if after all this, app is still null, something is very wrong.
    if (!app) {
        initError = initError || "Firebase Admin app instance is unexpectedly null after initialization attempt.";
        console.error("[Firebase Admin] Post-initialization check failed: App is null.", initError);
        throw new Error(initError);
    }

    // If we reached here, initialization was successful (or an existing valid app was found).
    // isInitialized was already set to true at the start of the attempt.
    initError = null; // Clear error on success
    return app;
}

/**
 * Gets the stored initialization error message, if any.
 * @returns {string | null} The error message string or null if initialization was successful or not yet attempted.
 */
export function getAdminInitError(): string | null {
    return initError;
}
