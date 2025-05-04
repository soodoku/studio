import { NextRequest, NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { getAuth, DecodedIdToken } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { initializeAdminApp, getAdminInitError } from '@/lib/firebase/adminApp';
import gTTS from 'node-gtts';
import { Readable } from 'stream';
import z from 'zod';

// --- Firebase Admin SDK Initialization (Attempt on Module Load) ---
// Use a flag and error variable scoped to the module to manage initialization state.
let adminApp: admin.app.App | null = null;
let adminAppInitializationError: string | null = null;
let adminAppInitialized = false; // Track if initialization has been attempted

function ensureAdminInitialized(): boolean {
    if (adminAppInitialized && adminApp) {
        // Already successfully initialized in this instance
        return true;
    }
    if (adminAppInitialized && adminAppInitializationError) {
        // Already attempted and failed
        console.error("[API Generate Audio - Check] Previously failed Admin SDK initialization:", adminAppInitializationError);
        return false;
    }

    // Attempt initialization now
    adminAppInitialized = true; // Mark as attempted
    console.log("[API Generate Audio - Check] Attempting Firebase Admin SDK initialization...");
    try {
        adminApp = initializeAdminApp(); // Attempt to initialize
        adminAppInitializationError = getAdminInitError(); // Check if helper caught an error during init
        if (adminAppInitializationError) {
            console.error("[API Generate Audio - Check] Firebase Admin SDK initialization failed:", adminAppInitializationError);
            adminApp = null; // Ensure app is null on failure
            return false;
        }
        if (!adminApp) {
             // This case should theoretically be caught by initializeAdminApp throwing, but double-check
             adminAppInitializationError = "initializeAdminApp completed without error but returned null.";
             console.error("[API Generate Audio - Check] Firebase Admin SDK initialization failed:", adminAppInitializationError);
             return false;
        }
        console.log("[API Generate Audio - Check] Firebase Admin SDK initialized successfully.");
        return true; // Success
    } catch (e: any) {
        console.error("[API Generate Audio - Check] CRITICAL: Exception during Firebase Admin SDK initialization.", e.message, e.stack);
        // Store the error message if not already set by initializeAdminApp
        if (!adminAppInitializationError) {
            adminAppInitializationError = e.message || "Unknown error during Admin SDK initialization.";
        }
        adminApp = null;
        return false; // Failure
    }
}
// --- End Firebase Admin SDK Initialization ---

const InputSchema = z.object({
    text: z.string().min(10, { message: "Text must be at least 10 characters long." }),
    bookId: z.string().min(1, { message: "Book ID is required." }),
});

// Ensure we use Node.js runtime as node-gtts requires it.
export const runtime = 'nodejs'; // Explicitly set Node.js runtime

export async function POST(request: NextRequest) {
    console.log("[API Generate Audio] Received POST request.");

    // --- Initialization Check ---
    if (!ensureAdminInitialized() || !adminApp) {
        const errorMsg = adminAppInitializationError || "Firebase Admin SDK is not available.";
        console.error("[API Generate Audio] Aborting request due to Admin SDK initialization failure:", errorMsg);
        return NextResponse.json({ error: `Internal Server Error: Firebase Admin SDK failed to initialize. Reason: ${errorMsg}` }, { status: 500 });
    }
    console.log("[API Generate Audio] Firebase Admin SDK seems initialized correctly.");
    // --- End Initialization Check ---

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
            decodedToken = await getAuth(adminApp).verifyIdToken(authToken);
            userId = decodedToken.uid;
            console.log(`[API Generate Audio] Auth token verified successfully for user: ${userId}`);
        } catch (error: any) {
            console.error("[API Generate Audio] Auth token verification failed:", error.code, error.message);
            let status = 401;
            let message = `Unauthorized: Invalid authentication token. Code: ${error.code || 'UNKNOWN'}`;
            if (error.code === 'auth/id-token-expired') {
                message = 'Unauthorized: Authentication token has expired.';
            } else if (error.code === 'auth/argument-error') {
                message = 'Unauthorized: Invalid authentication token format.';
            } else if (error.code?.includes('token-revoked')) {
                message = 'Unauthorized: Authentication token has been revoked.';
            }
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

        ({ text, bookId } = validationResult.data);
        console.log(`[API Generate Audio] Processing request for bookId: ${bookId}, userId: ${userId}, text length: ${text.length}`);

        // 3. Generate Audio using node-gtts
        let audioStream: Readable;
        try {
            console.log(`[API Generate Audio] Generating TTS stream...`);
            const tts = gTTS('en');
            audioStream = tts.stream(text);
            audioStream.on('error', (ttsError) => {
                // This handler catches errors *originating* from the TTS stream itself,
                // *not* errors during the upload piping.
                console.error("[API Generate Audio] Error event from TTS stream:", ttsError);
                // It's difficult to propagate this specific error back cleanly
                // since the upload might already be in progress or finished.
                // Log it for debugging. The upload 'error' handler is more critical.
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
            storage = getStorage(adminApp);
            bucket = storage.bucket();
            console.log(`[API Generate Audio] Accessed storage bucket: ${bucket.name}`);
        } catch (storageError: any) {
            console.error("[API Generate Audio] Failed to get storage bucket instance:", storageError);
            let errMsg = storageError.message || "Unknown storage access error.";
            if (errMsg.includes('does not have storage.buckets.get access') || errMsg.includes('permission denied')) {
                 errMsg = "Permission denied accessing storage bucket. Check service account permissions (e.g., 'Storage Object Admin' role) in Google Cloud IAM.";
            }
            return NextResponse.json({ error: `Internal Server Error: Could not access storage bucket. ${errMsg}` }, { status: 500 });
        }

        const audioFileName = `${bookId}_audio.mp3`;
        const storagePath = `audiobooks_generated/${userId}/${audioFileName}`;
        const fileUpload = bucket.file(storagePath);

        console.log(`[API Generate Audio] Starting upload to Storage path: ${storagePath}`);

        // Upload the file stream using a Promise
        await new Promise<void>((resolve, reject) => {
            console.log("[API Generate Audio] Creating write stream to storage...");
            let writeStream;
            try {
                writeStream = fileUpload.createWriteStream({
                    metadata: { contentType: 'audio/mpeg' },
                    // Make file public on upload (adjust if rules handle this differently)
                    // If using signed URLs, this might not be needed or desirable.
                    // Consider if publicRead is appropriate for your security model.
                    // It's often better to keep files private and generate signed URLs on demand.
                    // predefinedAcl: 'publicRead' // Temporarily comment out if using signed URLs or stricter rules
                });
                console.log("[API Generate Audio] Write stream created. Piping TTS stream to storage...");

                // --- Event Handlers for the Upload Stream ---
                writeStream.on('error', (uploadError: Error) => {
                    console.error("[API Generate Audio] Error during audio stream upload (writeStream 'error' event):", uploadError.message, uploadError.stack);
                    let detailedErrorMsg = `Failed to upload audio stream to storage: ${uploadError.message}`;

                    // Check for common authentication/permission errors during upload
                    if (uploadError.message.includes('Could not refresh access token') ||
                        uploadError.message.includes('TOKEN_EXPIRED') ||
                        uploadError.message.includes('PERMISSION_DENIED') ||
                        uploadError.message.includes('401') || // Unauthorized
                        uploadError.message.includes('403')) { // Forbidden
                        detailedErrorMsg = "Server authentication error while uploading to Storage. Check service account credentials, permissions (e.g., 'Storage Object Creator/Admin'), and token validity.";
                        console.error("[API Generate Audio] Potential cause: Service account key expired, incorrect permissions, or clock skew.");
                    } else if (uploadError.message.includes('getaddrinfo ENOTFOUND') || uploadError.message.includes('ECONNREFUSED')) {
                        detailedErrorMsg = "Network error: Could not connect to Firebase Storage endpoint.";
                    }

                    reject(new Error(detailedErrorMsg)); // Reject the promise with the detailed error
                });

                writeStream.on('finish', () => {
                    console.log(`[API Generate Audio] Successfully uploaded ${storagePath} (writeStream 'finish' event).`);
                    resolve(); // Resolve the promise on successful finish
                });

                // Pipe the TTS audio stream into the Firebase Storage write stream
                audioStream.pipe(writeStream);

                // Also handle errors on the source (TTS) stream during piping
                audioStream.on('error', (ttsPipeError) => {
                    console.error("[API Generate Audio] Error from TTS stream during piping:", ttsPipeError);
                    // Abort the upload and reject the promise
                    writeStream.end(); // Attempt to close the stream cleanly
                    reject(new Error(`TTS stream error during upload: ${ttsPipeError.message}`));
                });


            } catch (streamError: any) {
                console.error("[API Generate Audio] Error creating storage write stream:", streamError);
                reject(new Error(`Failed to create storage write stream: ${streamError.message}`));
            }
        }); // End of Promise for upload

        // 5. Generate a signed URL for the uploaded file (more secure than public URL)
        console.log(`[API Generate Audio] Generating signed download URL for ${storagePath}...`);
        try {
            // Generate a signed URL that expires in 1 hour (adjust as needed)
            const [signedUrl] = await fileUpload.getSignedUrl({
                action: 'read',
                expires: Date.now() + 60 * 60 * 1000, // 1 hour
                // Consider version 'v4' for newer features if supported
            });

            console.log(`[API Generate Audio] Generated signed URL (valid for 1 hour): ${signedUrl}`);

            // Return the signed URL
            return NextResponse.json({ audioUrl: signedUrl }, { status: 200 });
        } catch (urlError: any) {
            console.error("[API Generate Audio] Failed to generate signed URL:", urlError.message, urlError.stack);
            // Provide more context if possible
            let urlErrMsg = `Failed to generate download URL: ${urlError.message}`;
            if (urlError.message.includes('permission') || urlError.message.includes('IAM')) {
                urlErrMsg = "Permission error generating signed URL. Ensure the service account has 'Service Account Token Creator' role.";
            }
            return NextResponse.json(
                { error: urlErrMsg },
                { status: 500 }
            );
        }

    } catch (error: any) {
        // Catch broader errors, including those from the Promise rejection during upload
        console.error("[API Generate Audio] Unexpected error in POST handler:", error.message, error.stack);

        let errorMessage = error.message || 'Unknown server error occurred.';
        let status = 500;

        // Refine message for known error types caught here
         if (errorMessage.includes("Server authentication error")) {
             errorMessage = `Internal Server Error: Server authentication failed. Check service account credentials and permissions. Details: ${error.message}`;
         } else if (errorMessage.includes("Network error:")) {
              errorMessage = `Internal Server Error: Network issue connecting to external services. Details: ${error.message}`;
         } else if (errorMessage.includes("TTS stream error")) {
              errorMessage = `Internal Server Error: Problem during audio generation. Details: ${error.message}`;
         }
         // ... add more specific checks if needed ...


        // Log the final error message being sent to the client
        console.error(`[API Generate Audio] Sending error response to client (Status ${status}): ${errorMessage}`);
        // Avoid sending detailed internal messages like stack traces to the client
        const clientSafeMessage = errorMessage.startsWith("Internal Server Error:") ? errorMessage : `Internal Server Error: ${errorMessage}`;
        return NextResponse.json({ error: clientSafeMessage }, { status });
    }
}
