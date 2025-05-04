
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
try {
    initializeAdminApp();
} catch (e) {
    console.error("[API Generate Audio] CRITICAL: Failed to initialize Firebase Admin SDK during module load.", e);
    // Initialization errors at load time are serious, requests will likely fail.
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
    const adminInitError = getAdminInitError();
    if (adminInitError) {
        console.error("[API Generate Audio] Firebase Admin SDK initialization check failed:", adminInitError);
        return NextResponse.json({ error: `Internal Server Error: Firebase Admin SDK failed to initialize. Reason: ${adminInitError}` }, { status: 500 });
    }
     // Check if the admin app instance is available
     if (!admin.apps.length || !admin.app()) {
         console.error("[API Generate Audio] Firebase Admin App instance is not available after initialization check.");
         return NextResponse.json({ error: "Internal Server Error: Firebase Admin App instance unavailable." }, { status: 500 });
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
            let status = 401;
            let message = 'Unauthorized: Invalid authentication token.';
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

        ({ text, bookId } = validationResult.data); // Assign text and bookId here
        console.log(`[API Generate Audio] Processing request for bookId: ${bookId}, userId: ${userId}, text length: ${text.length}`);

        // 3. Generate Audio using node-gtts
        let audioStream: Readable;
        try {
            console.log(`[API Generate Audio] Generating TTS stream...`);
            const tts = gTTS('en'); // Language code (e.g., 'en')
            audioStream = tts.stream(text);
             // Add error handling for the TTS stream itself (if possible)
             audioStream.on('error', (ttsError) => {
                 console.error("[API Generate Audio] Error originating from TTS stream:", ttsError);
                 // This might be hard to catch here depending on when gTTS throws
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
             if (errMsg.includes('permission') || errMsg.includes('credential')) {
                 errMsg = "Server lacks permission to access the storage bucket. Check service account roles (e.g., Storage Object Admin).";
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
                    // Make file readable only by the owner by default unless rules override
                    // Consider resumable: true for large files if needed
                 });
                 console.log("[API Generate Audio] Write stream created. Piping TTS stream to storage...");

                 audioStream.pipe(writeStream)
                    .on('error', (uploadError: Error) => {
                        // This catches errors during the piping/upload process itself
                        console.error("[API Generate Audio] Error during audio stream upload:", uploadError);
                        // Check for specific Firebase Storage errors
                         if ((uploadError as any).code === 403 || uploadError.message.includes('permission denied')) {
                             reject(new Error(`Permission denied writing to storage path: ${storagePath}. Check Storage rules or service account permissions.`));
                         } else if (uploadError.message.includes('refresh access token')) {
                             // This error indicates the Admin SDK credentials might be invalid or expired
                             reject(new Error(`Failed to authenticate with Firebase Storage (token refresh issue). Check server credentials/environment.`));
                         }
                         else {
                            reject(new Error(`Failed to upload audio stream to storage: ${uploadError.message}`));
                         }
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
        const downloadURL = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media`;
        console.log(`[API Generate Audio] Generated Download URL: ${downloadURL}`);

        // 6. Return the Download URL
        return NextResponse.json({ audioUrl: downloadURL }, { status: 200 });

    } catch (error: any) {
        // Catch broader errors, including those from the Promise rejection during upload
        console.error("[API Generate Audio] Unexpected error in POST handler:", error);
        let errorMessage = error.message || 'Unknown server error occurred.';
        let status = 500;

         // Refine error message based on known issues
         if (errorMessage.includes('Could not refresh access token') || errorMessage.includes('credential') || errorMessage.includes('authenticate with Firebase Storage')) {
             errorMessage = `Server authentication error: Could not authenticate with Firebase services. Please check server credentials (service account) and environment setup. Original error: ${errorMessage}`;
         } else if (errorMessage.includes('Permission denied writing to storage') || errorMessage.includes('Permission denied.')) {
             errorMessage = `Storage permission error: The server lacks permission to write to the specified storage location. Check service account roles (e.g., Storage Object Admin) and Firebase Storage rules. Original error: ${errorMessage}`;
              status = 403; // Forbidden
         } else if (errorMessage.includes('Failed to create storage write stream')) {
             errorMessage = `Storage setup error: ${errorMessage}`;
         } else if (errorMessage.includes('TTS stream')) {
             // Error likely from TTS generation itself
             errorMessage = `Audio generation failed: ${errorMessage}`;
         }


        // Ensure a generic message if specific checks didn't match
        if (status === 500 && !errorMessage.startsWith('Server authentication error') && !errorMessage.startsWith('Storage permission error') && !errorMessage.startsWith('Storage setup error') && !errorMessage.startsWith('Audio generation failed')) {
             errorMessage = `An unexpected internal server error occurred: ${errorMessage}`;
        }


        return NextResponse.json({ error: `Internal Server Error: ${errorMessage}` }, { status });
    }
}
