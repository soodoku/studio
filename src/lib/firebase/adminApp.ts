
import * as admin from 'firebase-admin';

// Ensure environment variables are set for server-side Firebase Admin SDK
// These might be automatically injected by Firebase Hosting/Functions,
// or you might need to set them manually (e.g., via .env or service account file).

// Check if the app is already initialized to prevent errors
let app: admin.app.App | null = null;
let initError: string | null = null; // Store initialization error
let isInitialized = false; // Track initialization status

export function initializeAdminApp(): admin.app.App {
    if (isInitialized && app) {
        // console.log('[Firebase Admin] Already initialized successfully.');
        return app;
    }
    if (admin.apps.length > 0) {
        app = admin.app(); // Get the existing default app
        console.log('[Firebase Admin] SDK already initialized (found existing app).');
        isInitialized = true;
        initError = null; // Clear any previous error if an app exists now
        return app!;
    }

    console.log('[Firebase Admin] No existing app found. Attempting initialization...');
    try {
        const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID; // Re-use project ID from client config
        const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET; // Re-use storage bucket from client config

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


         let credential;
         if (serviceAccountPath) {
             console.log('[Firebase Admin] GOOGLE_APPLICATION_CREDENTIALS path provided:', serviceAccountPath);
             try {
                // Try loading credentials explicitly from the path first
                credential = admin.credential.cert(serviceAccountPath);
                console.log('[Firebase Admin] Service Account credentials loaded successfully from path.');
             } catch (credError: any) {
                 console.warn(`[Firebase Admin] Failed to load credentials from path ${serviceAccountPath}: ${credError.message}. Will attempt applicationDefault next.`);
                 // Fallback to applicationDefault if explicit path fails
                 try {
                     credential = admin.credential.applicationDefault();
                     console.log('[Firebase Admin] Successfully loaded credentials using applicationDefault after path failure.');
                 } catch (appDefaultError: any) {
                      initError = `Failed to load credentials from path AND applicationDefault. Path error: ${credError.message}, AppDefault error: ${appDefaultError.message}`;
                      console.error(`[Firebase Admin] Initialization failed: ${initError}`);
                      throw new Error(initError);
                 }
             }
         } else {
            // Attempt automatic initialization if no explicit path (might work in GCP/Firebase environment)
             console.log('[Firebase Admin] GOOGLE_APPLICATION_CREDENTIALS not set. Attempting automatic initialization (applicationDefault).');
             try {
                credential = admin.credential.applicationDefault();
                 console.log('[Firebase Admin] Successfully loaded credentials using applicationDefault.');
             } catch (appDefaultError: any) {
                 initError = `Failed to load credentials using applicationDefault (GOOGLE_APPLICATION_CREDENTIALS not set). Error: ${appDefaultError.message}. Ensure service account is configured in the environment.`;
                 console.error(`[Firebase Admin] Initialization failed: ${initError}`);
                 throw new Error(initError);
             }
         }

        // Log right before initializeApp
        console.log('[Firebase Admin] Calling admin.initializeApp...');
        admin.initializeApp({
            credential: credential,
            projectId: projectId, // Explicitly set project ID
            storageBucket: storageBucket // Set storage bucket
        });

        app = admin.app(); // Get the initialized app
        console.log(`[Firebase Admin] SDK initialized successfully for project ${projectId}. App Name: ${app.name}`);
        initError = null; // Clear error on success
        isInitialized = true; // Mark as initialized

    } catch (error: any) {
        // Catch errors during the initialization block
        const errorMessage = error instanceof Error ? error.message : String(error);
        // Only set initError if it wasn't already set by a specific check inside
        if (!initError) {
            initError = `Firebase Admin SDK initialization failed: ${errorMessage}`;
        }
        console.error('[Firebase Admin] CRITICAL INITIALIZATION FAILURE:', initError, error); // Log full error object too
        app = null; // Ensure app is null on failure
        isInitialized = false; // Ensure marked as not initialized
         // Re-throw the error to signal failure upstream clearly
        throw new Error(initError);
    }

    // Final check just in case
    if (!app) {
        const finalError = initError || "Firebase Admin app instance is unexpectedly null after initialization attempt.";
        console.error("[Firebase Admin] Post-initialization check failed: App is null.", finalError);
        isInitialized = false;
        throw new Error(finalError);
    }

    return app;
}

// Optional: Export the initialization error for checks elsewhere if needed
export function getAdminInitError(): string | null {
    // Return the current status of initError
    return initError;
}

    