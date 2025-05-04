
import * as admin from 'firebase-admin';

// Ensure environment variables are set for server-side Firebase Admin SDK
// These might be automatically injected by Firebase Hosting/Functions,
// or you might need to set them manually (e.g., via .env or service account file).

// Check if the app is already initialized to prevent errors
let app: admin.app.App | null = null;
let initError: string | null = null; // Store initialization error
let isInitialized = false; // Track initialization status

export function initializeAdminApp(): admin.app.App {
    // Avoid re-initialization if already successful
    if (isInitialized && app) {
        // console.log('[Firebase Admin] Already initialized successfully.');
        return app;
    }
    // Reset status before attempting initialization
    isInitialized = false;
    initError = null;
    app = null;


    // Check if an app instance already exists (e.g., due to HMR or previous attempt)
    if (admin.apps.length > 0) {
        app = admin.app(); // Get the existing default app
        console.log('[Firebase Admin] SDK already initialized (found existing app). Setting status to initialized.');
        isInitialized = true;
        return app!; // Return existing app
    }

    console.log('[Firebase Admin] No existing app found. Attempting initialization...');
    try {
        const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID; // Re-use project ID from client config
        const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET; // Re-use storage bucket from client config

        // --- Critical Configuration Checks ---
        if (!projectId) {
            initError = 'Firebase Project ID (NEXT_PUBLIC_FIREBASE_PROJECT_ID) is not set in the environment for Admin SDK.';
            console.error(`[Firebase Admin] Initialization failed: ${initError}`);
            throw new Error(initError);
        }
        if (!storageBucket) {
            initError = 'Firebase Storage Bucket (NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) is not set in the environment for Admin SDK.';
            console.error(`[Firebase Admin] Initialization failed: ${initError}`);
            throw new Error(initError);
        }
        console.log(`[Firebase Admin] Using Project ID: ${projectId}, Storage Bucket: ${storageBucket}`);


        // --- Credential Loading Logic ---
        let credential;
        let credentialSource = 'unknown'; // Track how credentials were loaded

        if (serviceAccountPath) {
            console.log('[Firebase Admin] GOOGLE_APPLICATION_CREDENTIALS path provided:', serviceAccountPath);
            try {
                // Try loading credentials explicitly from the path first
                credential = admin.credential.cert(serviceAccountPath);
                credentialSource = 'GOOGLE_APPLICATION_CREDENTIALS path';
                console.log(`[Firebase Admin] Service Account credentials loaded successfully from ${credentialSource}.`);
            } catch (credError: any) {
                console.warn(`[Firebase Admin] Failed to load credentials from path ${serviceAccountPath}: ${credError.message}. Will attempt applicationDefault next.`);
                // Fallback to applicationDefault if explicit path fails
                try {
                    console.log('[Firebase Admin] Attempting fallback: admin.credential.applicationDefault().');
                    credential = admin.credential.applicationDefault();
                    credentialSource = 'applicationDefault (after path failure)';
                    console.log(`[Firebase Admin] Successfully loaded credentials using ${credentialSource}.`);
                } catch (appDefaultError: any) {
                    initError = `Failed to load credentials from path AND applicationDefault. Path error: ${credError.message}, AppDefault error: ${appDefaultError.message}`;
                    console.error(`[Firebase Admin] Initialization failed: ${initError}`);
                    // Log the actual underlying error for more details
                    console.error("[Firebase Admin] Path Error Details:", credError);
                    console.error("[Firebase Admin] AppDefault Error Details:", appDefaultError);
                    throw new Error(initError); // Critical failure
                }
            }
        } else {
            // Attempt automatic initialization if no explicit path (might work in GCP/Firebase environment)
            console.log('[Firebase Admin] GOOGLE_APPLICATION_CREDENTIALS not set. Attempting automatic initialization (applicationDefault).');
            try {
                credential = admin.credential.applicationDefault();
                credentialSource = 'applicationDefault (no path set)';
                console.log(`[Firebase Admin] Successfully loaded credentials using ${credentialSource}.`);
            } catch (appDefaultError: any) {
                // Provide a more detailed error message here
                initError = `Failed to load credentials using applicationDefault (GOOGLE_APPLICATION_CREDENTIALS not set). Ensure the server environment has access to credentials (e.g., through Application Default Credentials in GCP/Firebase Functions/Cloud Run, or a service account JSON). Error: ${appDefaultError.message}`;
                console.error(`[Firebase Admin] Initialization failed: ${initError}`);
                 // Log the actual underlying error for more details
                 console.error("[Firebase Admin] AppDefault Error Details:", appDefaultError);
                throw new Error(initError); // Critical failure
            }
        }

        // --- Initialize App ---
        console.log('[Firebase Admin] Calling admin.initializeApp...');
        admin.initializeApp({
            credential: credential,
            projectId: projectId, // Explicitly set project ID
            storageBucket: storageBucket // Set storage bucket
        });

        app = admin.app(); // Get the initialized app
        console.log(`[Firebase Admin] SDK initialized successfully for project ${projectId}. App Name: ${app.name}. Credentials loaded via: ${credentialSource}`);
        isInitialized = true; // Mark as initialized

    } catch (error: any) {
        // Catch errors during the initialization block
        const errorMessage = error instanceof Error ? error.message : String(error);
        // Only set initError if it wasn't already set by a specific check inside
        if (!initError) {
            initError = `Firebase Admin SDK initialization failed: ${errorMessage}`;
        }
        console.error('[Firebase Admin] CRITICAL INITIALIZATION FAILURE:', initError, error.stack); // Log full error stack
        app = null; // Ensure app is null on failure
        isInitialized = false; // Ensure marked as not initialized
        // Re-throw the error to signal failure upstream clearly
        throw new Error(initError);
    }

    // Final check just in case (should be redundant if logic above is sound)
    if (!app) {
        const finalError = initError || "Firebase Admin app instance is unexpectedly null after initialization attempt.";
        console.error("[Firebase Admin] Post-initialization check failed: App is null.", finalError);
        isInitialized = false;
        throw new Error(finalError);
    }

    return app;
}

// Export the initialization error for checks elsewhere if needed
export function getAdminInitError(): string | null {
    // This function now mainly reflects errors *during* the last init attempt.
    // If `initializeAdminApp` throws, this might not be the most accurate state.
    return initError;
}

    