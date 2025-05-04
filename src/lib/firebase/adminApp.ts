
import * as admin from 'firebase-admin';

// Ensure environment variables are set for server-side Firebase Admin SDK
// These might be automatically injected by Firebase Hosting/Functions,
// or you might need to set them manually (e.g., via .env or service account file).

// Check if the app is already initialized to prevent errors
let app: admin.app.App | null = null;

export function initializeAdminApp(): admin.app.App {
    if (admin.apps.length === 0) {
        try {
            // Option 1: Automatic initialization (works in Google Cloud environments like Cloud Functions/Run)
            // admin.initializeApp();

            // Option 2: Initialize with Service Account (more explicit, works locally too)
            // Requires GOOGLE_APPLICATION_CREDENTIALS env var pointing to your service account key file
            // OR manually providing credentials object
            const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
             const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID; // Re-use project ID
             const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

            if (!projectId) {
                throw new Error('Firebase Project ID (NEXT_PUBLIC_FIREBASE_PROJECT_ID) is not set in the environment.');
            }
             if (!storageBucket) {
                 throw new Error('Firebase Storage Bucket (NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) is not set in the environment.');
             }

             if (serviceAccountPath) {
                 console.log('[Firebase Admin] Initializing with Service Account Path:', serviceAccountPath);
                 admin.initializeApp({
                     credential: admin.credential.applicationDefault(),
                     projectId: projectId, // Explicitly set project ID
                     storageBucket: storageBucket // Set storage bucket
                 });
             } else {
                // Attempt automatic initialization if no explicit path (might work in GCP)
                 console.log('[Firebase Admin] Attempting automatic initialization (GOOGLE_APPLICATION_CREDENTIALS not set).');
                 admin.initializeApp({
                      projectId: projectId, // Explicitly set project ID
                      storageBucket: storageBucket // Set storage bucket
                 });
             }

            app = admin.app(); // Get the initialized app
            console.log('[Firebase Admin] SDK initialized successfully.');
        } catch (error) {
            console.error('[Firebase Admin] Initialization failed:', error);
            // Decide how to handle initialization failure - maybe throw or log and return null
            throw new Error(`Firebase Admin SDK initialization failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    } else {
        app = admin.app(); // Get the existing default app
        // console.log('[Firebase Admin] SDK already initialized.');
    }
    return app!; // Should not be null if initialization succeeded or already existed
}
