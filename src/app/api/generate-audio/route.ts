
import { NextRequest, NextResponse } from 'next/server';
import * as admin from 'firebase-admin'; // Import admin namespace
import { getAuth, DecodedIdToken } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { initializeAdminApp, getAdminInitError } from '@/lib/firebase/adminApp'; // Helper to initialize admin app and get init error
import gTTS from 'node-gtts';
import { Readable } from 'stream';
import z from 'zod';

// Initialize Firebase Admin SDK (ensure this runs only once per server instance)
// This needs to happen reliably during server startup or lazy-initialized safely.
// Use a flag to ensure initialization is attempted only once per instance lifecycle
let adminAppInitialized = false;
let adminAppInitializationError: string | null = null;

if (!adminAppInitialized) {
    try {
        console.log("[API Generate Audio] Attempting Firebase Admin SDK initialization...");
        initializeAdminApp(); // Attempt to initialize
        adminAppInitialized = true; // Mark as attempted
        adminAppInitializationError = getAdminInitError(); // Check if initialization failed
        if (adminAppInitializationError) {
            console.error("[API Generate Audio] Firebase Admin SDK initialization failed during initial load:", adminAppInitializationError);
        } else {
             console.log("[API Generate Audio] Firebase Admin SDK initialized successfully during initial load.");
        }
    } catch (e: any) {
        console.error("[API Generate Audio] CRITICAL: Exception during Firebase Admin SDK initialization.", e.message, e.stack);
        adminAppInitializationError = e.message || "Unknown error during Admin SDK initialization.";
        adminAppInitialized = true; // Mark as attempted even on failure
    }
}


const InputSchema = z.object({
    text: z.string().min(10, { message: "Text must be at least 10 characters long." }),
    bookId: z.string().min(1, { message: "Book ID is required." }),
});

// Ensure we use Node.js runtime as node-gtts requires it.
export const runtime = 'nodejs'; // Explicitly set Node.js runtime

export async function POST(request: NextRequest) {
    console.log("[API Generate Audio] Received POST request.");

    // --- Initialization Checks ---
    // Re-check the initialization status on each request, using the stored error
    if (adminAppInitializationError) {
        console.error("[API Generate Audio] Firebase Admin SDK initialization check failed (from initial load):", adminAppInitializationError);
        return NextResponse.json({ error: `Internal Server Error: Firebase Admin SDK failed to initialize. Reason: ${adminAppInitializationError}` }, { status: 500 });
    }
    // Double-check if the admin app instance is truly available ( belt-and-suspenders)
    if (!admin.apps.length || !admin.app()) {
        console.error("[API Generate Audio] Firebase Admin App instance is not available despite no initial error. Re-initializing might be needed or environment issue.");
        // Attempt re-init maybe? Or just fail. Failing is safer for now.
        return NextResponse.json({ error: "Internal Server Error: Firebase Admin App instance unavailable. Initialization might have failed silently or environment issue." }, { status: 500 });
    }
    console.log("[API Generate Audio] Firebase Admin SDK seems initialized correctly.");
    // --- End Initialization Checks ---

    let userId: string;
    let text: string;
    let bookId: string;

    try {
        // 1. Verify Authentication using Firebase Admin SDK
        const authToken = request.headers.get('Authorization')?.split('Bearer ')[1];
        if (!authToken) {
            console.warn("[API Generate Audio] Unauthorized: Missing authentication token.");
            return NextResponse.json({ error: 'Unauthorized: Missing authentication token.' }, { status: 401 });
        }

        let decodedToken: DecodedIdToken;
        try {
            console.log("[API Generate Audio] Verifying auth token...");
            // Ensure getAuth is called on the initialized admin app instance
            decodedToken = await getAuth(admin.app()).verifyIdToken(authToken);
            userId = decodedToken.uid; // Assign userId here
            console.log(`[API Generate Audio] Auth token verified successfully for user: ${userId}`);
        } catch (error: any) {
            console.error("[API Generate Audio] Auth token verification failed:", error.code, error.message);
            // Log the specific error code from Firebase Admin Auth
            let status = 401;
            let message = `Unauthorized: Invalid authentication token. Code: ${error.code || 'UNKNOWN'}`;
            if (error.code === 'auth/id-token-expired') {
                message = 'Unauthorized: Authentication token has expired.';
            } else if (error.code === 'auth/argument-error') {
                message = 'Unauthorized: Invalid authentication token format.';
            } else if (error.code?.includes('token-revoked')) {
                message = 'Unauthorized: Authentication token has been revoked.';
            } else if (error.message?.includes('Firebase ID token has incorrect algorithm')) {
                 message = 'Unauthorized: Incorrect token algorithm. Ensure token is generated correctly.';
            } else if (error.message?.includes('Decoding Firebase ID token failed')) {
                 message = `Unauthorized: Failed to decode token. It might be malformed. Details: ${error.message}`;
            }
            // Add check for project ID mismatch if possible (often manifests as other errors though)
            return NextResponse.json({ error: message }, { status });
        }

        // 2. Parse and Validate Input
        let body;
        try {
            body = await request.json();
        } catch (parseError) {
            console.error("[API Generate Audio] Failed to parse request body:", parseError);
            return NextResponse.json({ error: 'Invalid request body: Must be valid JSON.' }, { status: 400 });
        }

        const validationResult = InputSchema.safeParse(body);
        if (!validationResult.success) {
            const issues = validationResult.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ');
            console.error("[API Generate Audio] Invalid input:", issues);
            return NextResponse.json({ error: `Invalid input: ${issues}` }, { status: 400 });
        }

        ({ text, bookId } = validationResult.data); // Assign text and bookId here
        console.log(`[API Generate Audio] Processing request for bookId: ${bookId}, userId: ${userId}, text length: ${text.length}`);

        // 3. Generate Audio using node-gtts
        let audioStream: Readable;
        try {
            console.log(`[API Generate Audio] Generating TTS stream...`);
            const tts = gTTS('en'); // Language code (e.g., 'en')
            audioStream = tts.stream(text);
            // Add error handling for the TTS stream itself
            audioStream.on('error', (ttsError) => {
                console.error("[API Generate Audio] Error originating from TTS stream:", ttsError);
                // This error handler might be too late if the stream fails immediately.
                // We wrap the stream creation in try-catch for immediate errors.
                // Re-throw or handle appropriately if needed, maybe reject the main promise?
            });
            console.log(`[API Generate Audio] TTS stream created.`);
        } catch (ttsError: any) {
            console.error("[API Generate Audio] Failed to create TTS stream:", ttsError);
            return NextResponse.json({ error: `Internal Server Error: Failed to generate audio stream. ${ttsError.message}` }, { status: 500 });
        }


        // 4. Upload Audio Stream to Firebase Storage
        let storage;
        let bucket;
        try {
            // Ensure getStorage is called on the initialized admin app instance
            storage = getStorage(admin.app());
            bucket = storage.bucket(); // Default bucket
            console.log(`[API Generate Audio] Accessed storage bucket: ${bucket.name}`);
        } catch (storageError: any) {
            console.error("[API Generate Audio] Failed to get storage bucket instance:", storageError);
            // This could indicate issues with the service account's Storage permissions
            let errMsg = storageError.message;
            if (errMsg.includes('permission') || errMsg.includes('credential') || errMsg.includes('authenticated')) {
                errMsg = "Server lacks permission to access the storage bucket. Check service account roles (e.g., Storage Object Admin) or credentials setup.";
            }
            return NextResponse.json({ error: `Internal Server Error: Could not access storage bucket. ${errMsg}` }, { status: 500 });
        }

        const audioFileName = `${bookId}_audio.mp3`;
        // IMPORTANT: Ensure storage rules allow writing to this path for the authenticated user
        const storagePath = `audiobooks_generated/${userId}/${audioFileName}`;
        const fileUpload = bucket.file(storagePath);

        console.log(`[API Generate Audio] Starting upload to Storage path: ${storagePath}`);

        // Use await with a Promise to handle the stream upload
        await new Promise((resolve, reject) => {
            console.log("[API Generate Audio] Creating write stream to storage...");
            let writeStream;
            try {
                writeStream = fileUpload.createWriteStream({
                    metadata: {
                        contentType: 'audio/mpeg', // Set the correct MIME type
                    },
                    resumable: false, // Keep simple for now, consider true for large files
                    validation: 'crc32c' // Enable checksum validation
                });
                console.log("[API Generate Audio] Write stream created. Piping TTS stream to storage...");

                audioStream.pipe(writeStream)
                    .on('error', (uploadError: Error) => {
                        // This catches errors during the piping/upload process itself
                        console.error("[API Generate Audio] Error during audio stream upload:", uploadError);
                        // Check for specific Firebase Storage errors
                        let specificErrorMsg = `Failed to upload audio stream to storage: ${uploadError.message}`;
                        if ((uploadError as any).code === 403 || uploadError.message.includes('permission denied')) {
                            specificErrorMsg = `Permission denied writing to storage path: ${storagePath}. Check Storage rules or service account permissions.`;
                        } else if (uploadError.message.includes('refresh access token') || uploadError.message.includes('Unable to detect a Project Id')) {
                            // This error indicates the Admin SDK credentials might be invalid, expired, or missing project context
                            specificErrorMsg = `Failed to authenticate with Firebase Storage (token refresh issue or missing project ID). Check server credentials/environment setup. Original error: ${uploadError.message}`;
                        } else if (uploadError.message.includes('bucket not found')) {
                             specificErrorMsg = `Storage bucket '${bucket.name}' not found. Check bucket name and project configuration.`;
                        }
                        reject(new Error(specificErrorMsg));
                    })
                    .on('finish', () => {
                        console.log(`[API Generate Audio] Successfully uploaded ${storagePath}`);
                        resolve(true);
                    });

            } catch (streamError: any) {
                console.error("[API Generate Audio] Error creating storage write stream:", streamError);
                // This is a likely place for credential/permission errors before piping starts
                reject(new Error(`Failed to create storage write stream: ${streamError.message}. Check service account permissions.`));
            }
        }); // End of upload promise


        // 5. Get Download URL (Publicly Accessible - requires rules or public setting)
        // Note: If files should be private, use getSignedUrl instead, which requires more permissions.
        console.log(`[API Generate Audio] Constructing download URL for ${storagePath}...`);
        // Use the standard Firebase Storage URL format
        const downloadURL = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media`;
        console.log(`[API Generate Audio] Generated Download URL: ${downloadURL}`);

        // 6. Return the Download URL
        return NextResponse.json({ audioUrl: downloadURL }, { status: 200 });

    } catch (error: any) {
        // Catch broader errors, including those from the Promise rejection during upload
        console.error("[API Generate Audio] Unexpected error in POST handler:", error.message, error.stack); // Log stack trace
        let errorMessage = error.message || 'Unknown server error occurred.';
        let status = 500;

        // Refine error message based on known issues from upload promise rejection or other steps
        if (errorMessage.includes('authenticate with Firebase Storage') || errorMessage.includes('Could not refresh access token') || errorMessage.includes('credential') || errorMessage.includes('Unable to detect a Project Id')) {
            errorMessage = `Server authentication error: Could not authenticate with Firebase services. Please check server credentials (service account) and environment setup. Original error: ${errorMessage}`;
        } else if (errorMessage.includes('Permission denied writing to storage') || errorMessage.includes('permission denied')) { // More generic check
            errorMessage = `Storage permission error: The server lacks permission to write to the specified storage location. Check service account roles (e.g., Storage Object Admin) and Firebase Storage rules. Original error: ${errorMessage}`;
            status = 403; // Forbidden
        } else if (errorMessage.includes('Failed to create storage write stream')) {
            errorMessage = `Storage setup error: ${errorMessage}`;
        } else if (errorMessage.includes('TTS stream')) {
            // Error likely from TTS generation itself
            errorMessage = `Audio generation failed: ${errorMessage}`;
        } else if (errorMessage.includes('bucket not found')) {
             errorMessage = `Configuration error: ${errorMessage}`;
        }


        // Ensure a generic message if specific checks didn't match
        if (status === 500 && !errorMessage.startsWith('Server authentication error') && !errorMessage.startsWith('Storage permission error') && !errorMessage.startsWith('Storage setup error') && !errorMessage.startsWith('Audio generation failed') && !errorMessage.startsWith('Configuration error')) {
            errorMessage = `An unexpected internal server error occurred: ${errorMessage}`;
        }


        return NextResponse.json({ error: `Internal Server Error: ${errorMessage}` }, { status });
    }
}
```