
import * as admin from 'firebase-admin';

// Ensure environment variables are set for server-side Firebase Admin SDK
// These might be automatically injected by Firebase Hosting/Functions,
// or you might need to set them manually (e.g., via .env or service account file).

// Check if the app is already initialized to prevent errors
let app: admin.app.App | null = null;
let initError: string | null = null; // Store initialization error

export function initializeAdminApp(): admin.app.App {
    if (admin.apps.length === 0) {
        console.log('[Firebase Admin] No existing app found. Attempting initialization...');
        try {
            const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
            const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID; // Re-use project ID from client config
            const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET; // Re-use storage bucket from client config

            if (!projectId) {
                initError = 'Firebase Project ID (NEXT_PUBLIC_FIREBASE_PROJECT_ID) is not set in the environment for Admin SDK.';
                console.error(`[Firebase Admin] ${initError}`);
                throw new Error(initError);
            }
             if (!storageBucket) {
                 initError = 'Firebase Storage Bucket (NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) is not set in the environment for Admin SDK.';
                 console.error(`[Firebase Admin] ${initError}`);
                 throw new Error(initError);
             }

             let credential;
             if (serviceAccountPath) {
                 console.log('[Firebase Admin] Initializing with Service Account Path:', serviceAccountPath);
                 try {
                    // Try loading credentials explicitly from the path first
                    credential = admin.credential.cert(serviceAccountPath);
                    console.log('[Firebase Admin] Service Account credentials loaded successfully from path.');
                 } catch (credError) {
                     console.error(`[Firebase Admin] Failed to load credentials from path ${serviceAccountPath}:`, credError);
                     console.log('[Firebase Admin] Falling back to applicationDefault credential strategy.');
                     // Fallback to applicationDefault if explicit path fails (e.g., path wrong but ADC available)
                     credential = admin.credential.applicationDefault();
                 }
             } else {
                // Attempt automatic initialization if no explicit path (might work in GCP)
                 console.log('[Firebase Admin] GOOGLE_APPLICATION_CREDENTIALS not set. Attempting automatic initialization (applicationDefault).');
                 credential = admin.credential.applicationDefault();
             }

            admin.initializeApp({
                credential: credential,
                projectId: projectId, // Explicitly set project ID
                storageBucket: storageBucket // Set storage bucket
            });

            app = admin.app(); // Get the initialized app
            console.log(`[Firebase Admin] SDK initialized successfully for project ${projectId}.`);
            initError = null; // Clear error on success
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            // Only set initError if it wasn't already set by a specific check
            if (!initError) {
                initError = `Firebase Admin SDK initialization failed: ${errorMessage}`;
            }
            console.error('[Firebase Admin] Initialization failed:', initError, error); // Log full error object too
            app = null; // Ensure app is null on failure
             // Re-throw the error to signal failure upstream
            throw new Error(initError);
        }
    } else {
        app = admin.app(); // Get the existing default app
        // console.log('[Firebase Admin] SDK already initialized.');
    }
    return app!; // Should not be null if initialization succeeded or already existed
}

// Optional: Export the initialization error for checks elsewhere if needed
export function getAdminInitError(): string | null {
    return initError;
}
```