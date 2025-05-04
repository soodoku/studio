
import { NextRequest, NextResponse } from 'next/server';
import * as admin from 'firebase-admin'; // Import admin namespace
import { getAuth, DecodedIdToken } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { initializeAdminApp, getAdminInitError } from '@/lib/firebase/adminApp'; // Helper to initialize admin app and get init error
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
    if (!ensureAdminInitialized() || !adminApp) { // Check if init succeeded and adminApp is not null
        const errorMsg = adminAppInitializationError || "Firebase Admin SDK is not available.";
        console.error("[API Generate Audio] Aborting request due to Admin SDK initialization failure:", errorMsg);
        // Return a more specific error if initialization failed
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
            // Ensure getAuth is called on the initialized admin app instance
            decodedToken = await getAuth(adminApp).verifyIdToken(authToken); // Use guaranteed non-null adminApp
            userId = decodedToken.uid; // Assign userId here
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
                // Rethrow or handle appropriately if needed (reject the main promise later)
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
            storage = getStorage(adminApp); // Use guaranteed non-null adminApp
            bucket = storage.bucket(); // Default bucket
            console.log(`[API Generate Audio] Accessed storage bucket: ${bucket.name}`);
        } catch (storageError: any) {
            console.error("[API Generate Audio] Failed to get storage bucket instance:", storageError);
            let errMsg = storageError.message;
            if (errMsg.includes('permission') || errMsg.includes('credential') || errMsg.includes('authenticated')) {
                errMsg = "Server lacks permission to access the storage bucket. Check service account roles (e.g., Storage Object Admin) or credentials setup.";
            } else if (errMsg.includes('Could not load the default credentials')) {
                 errMsg = "Default credentials not found. Ensure service account is configured for the server environment.";
            }
            return NextResponse.json({ error: `Internal Server Error: Could not access storage bucket. ${errMsg}` }, { status: 500 });
        }

        const audioFileName = `${bookId}_audio.mp3`;
        const storagePath = `audiobooks_generated/${userId}/${audioFileName}`;
        const fileUpload = bucket.file(storagePath);

        console.log(`[API Generate Audio] Starting upload to Storage path: ${storagePath}`);

        // Use await with a Promise to handle the stream upload
        await new Promise((resolve, reject) => {
            console.log("[API Generate Audio] Creating write stream to storage...");
            let writeStream;
            try {
                writeStream = fileUpload.createWriteStream({
                    metadata: { contentType: 'audio/mpeg' },
                    resumable: false,
                    validation: 'crc32c'
                });
                console.log("[API Generate Audio] Write stream created. Piping TTS stream to storage...");

                audioStream.pipe(writeStream)
                    .on('error', (uploadError: Error) => {
                        console.error("[API Generate Audio] Error during audio stream upload:", uploadError);
                        // Provide more specific error messages
                        let specificErrorMsg = `Failed to upload audio stream to storage: ${uploadError.message}`;
                        if ((uploadError as any).code === 403 || uploadError.message.includes('permission denied')) {
                            specificErrorMsg = `Permission denied writing to storage path: ${storagePath}. Check Storage rules AND service account permissions (e.g., Storage Object Admin role).`;
                        } else if (uploadError.message.includes('refresh access token') || uploadError.message.includes('Unable to detect a Project Id') || uploadError.message.includes('Could not load the default credentials')) {
                             specificErrorMsg = `Failed to authenticate with Firebase Storage (token refresh issue, missing project ID, or credential loading failure). Check server credentials/environment setup. Original error: ${uploadError.message}`;
                        } else if (uploadError.message.includes('bucket not found')) {
                             specificErrorMsg = `Storage bucket '${bucket.name}' not found. Check bucket name and project configuration.`;
                        }
                         // Log the stack trace for better debugging
                        console.error(uploadError.stack);
                        reject(new Error(specificErrorMsg));
                    })
                    .on('finish', () => {
                        console.log(`[API Generate Audio] Successfully uploaded ${storagePath}`);
                        resolve(true);
                    });

            } catch (streamError: any) {
                console.error("[API Generate Audio] Error creating storage write stream:", streamError);
                reject(new Error(`Failed to create storage write stream: ${streamError.message}. Check service account permissions.`));
            }
        }); // End of upload promise


        // 5. Get Download URL
        console.log(`[API Generate Audio] Constructing download URL for ${storagePath}...`);
        const downloadURL = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media`;
        console.log(`[API Generate Audio] Generated Download URL: ${downloadURL}`);

        // 6. Return the Download URL
        return NextResponse.json({ audioUrl: downloadURL }, { status: 200 });

    } catch (error: any) {
        // Catch broader errors, including those from the Promise rejection during upload
        console.error("[API Generate Audio] Unexpected error in POST handler:", error.message, error.stack); // Log full stack trace

        let errorMessage = error.message || 'Unknown server error occurred.';
        let status = 500;

        // Refine error message based on known issues
        if (errorMessage.includes('authenticate with Firebase Storage') || errorMessage.includes('Could not refresh access token') || errorMessage.includes('credential') || errorMessage.includes('Unable to detect a Project Id')) {
            errorMessage = `Server authentication error: Could not authenticate with Firebase services. Please check server credentials (service account) and environment setup. Original error: ${errorMessage}`;
        } else if (errorMessage.includes('Permission denied writing to storage') || errorMessage.includes('permission denied')) {
            errorMessage = `Storage permission error: The server lacks permission to write to the specified storage location. Check service account roles (e.g., Storage Object Admin) and Firebase Storage rules. Original error: ${errorMessage}`;
            status = 403; // Forbidden
        } else if (errorMessage.includes('Failed to create storage write stream')) {
            errorMessage = `Storage setup error: ${errorMessage}`;
        } else if (errorMessage.includes('TTS stream')) {
            errorMessage = `Audio generation failed: ${errorMessage}`;
        } else if (errorMessage.includes('bucket not found')) {
             errorMessage = `Configuration error: ${errorMessage}`;
        } else if (error instanceof z.ZodError) {
            // Handle potential Zod validation errors if they somehow slip through
            errorMessage = `Invalid input format: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`;
            status = 400;
        }

        // Ensure a generic message if specific checks didn't match
        if (status === 500 && !errorMessage.startsWith('Server authentication error') && !errorMessage.startsWith('Storage permission error') && !errorMessage.startsWith('Storage setup error') && !errorMessage.startsWith('Audio generation failed') && !errorMessage.startsWith('Configuration error')) {
            errorMessage = `An unexpected internal server error occurred: ${errorMessage}`;
        }

        // Log the final error message being sent to the client
        console.error(`[API Generate Audio] Sending error response to client (Status ${status}): ${errorMessage}`);
        return NextResponse.json({ error: `Internal Server Error: ${errorMessage}` }, { status });
    }
}

    