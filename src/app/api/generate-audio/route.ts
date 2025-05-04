
import { NextRequest, NextResponse } from 'next/server';
import { getAuth, DecodedIdToken } from 'firebase-admin/auth'; // Use firebase-admin for server-side auth verification
import { getStorage } from 'firebase-admin/storage';
import { initializeAdminApp, getAdminInitError } from '@/lib/firebase/adminApp'; // Helper to initialize admin app and get init error
import gTTS from 'node-gtts';
import { Readable } from 'stream';
import z from 'zod';

// Initialize Firebase Admin SDK (ensure this runs only once per server instance)
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

// Ensure we use Edge runtime for potentially longer operations if deploying to Vercel Edge
// export const runtime = 'edge'; // Comment out if node-gtts requires Node.js APIs not available in Edge

export async function POST(request: NextRequest) {
    console.log("[API Generate Audio] Received POST request.");

    // Check Admin SDK initialization status on each request
    const adminInitError = getAdminInitError();
    if (adminInitError) {
        console.error("[API Generate Audio] Firebase Admin SDK not initialized properly:", adminInitError);
        return NextResponse.json({ error: `Internal Server Error: Firebase Admin SDK failed to initialize. Reason: ${adminInitError}` }, { status: 500 });
    }
     if (!admin.apps.length || !admin.app()) {
         console.error("[API Generate Audio] Firebase Admin App instance is not available.");
         return NextResponse.json({ error: "Internal Server Error: Firebase Admin App instance unavailable." }, { status: 500 });
     }

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
            decodedToken = await getAuth().verifyIdToken(authToken);
            console.log(`[API Generate Audio] Auth token verified successfully for user: ${decodedToken.uid}`);
        } catch (error: any) {
            console.error("[API Generate Audio] Auth token verification failed:", error.code, error.message);
            // Provide more specific feedback based on common error codes
            if (error.code === 'auth/id-token-expired') {
                 return NextResponse.json({ error: 'Unauthorized: Authentication token has expired.' }, { status: 401 });
            } else if (error.code === 'auth/argument-error') {
                 return NextResponse.json({ error: 'Unauthorized: Invalid authentication token format.' }, { status: 401 });
            }
            return NextResponse.json({ error: 'Unauthorized: Invalid authentication token.' }, { status: 401 });
        }
        const userId = decodedToken.uid;


        // 2. Parse and Validate Input
        const body = await request.json();
        const validationResult = InputSchema.safeParse(body);

        if (!validationResult.success) {
            const issues = validationResult.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ');
            console.error("[API Generate Audio] Invalid input:", issues);
            return NextResponse.json({ error: `Invalid input: ${issues}` }, { status: 400 });
        }

        const { text, bookId } = validationResult.data;
        console.log(`[API Generate Audio] Processing request for bookId: ${bookId}, userId: ${userId}, text length: ${text.length}`);

        // 3. Generate Audio using node-gtts
        console.log(`[API Generate Audio] Generating TTS stream...`);
        const tts = gTTS('en'); // Language code (e.g., 'en')
        const audioStream: Readable = tts.stream(text);
        console.log(`[API Generate Audio] TTS stream created.`);

        // 4. Upload Audio Stream to Firebase Storage
        let storage;
        try {
            storage = getStorage().bucket(); // Default bucket
             console.log(`[API Generate Audio] Accessed storage bucket: ${storage.name}`);
        } catch (storageError: any) {
            console.error("[API Generate Audio] Failed to get storage bucket instance:", storageError);
            return NextResponse.json({ error: `Internal Server Error: Could not access storage bucket. ${storageError.message}` }, { status: 500 });
        }

        const audioFileName = `${bookId}_audio.mp3`;
        // IMPORTANT: Ensure storage rules allow writing to this path for the authenticated user
        const storagePath = `audiobooks_generated/${userId}/${audioFileName}`;
        const fileUpload = storage.file(storagePath);

        console.log(`[API Generate Audio] Starting upload to Storage path: ${storagePath}`);

        await new Promise((resolve, reject) => {
             console.log("[API Generate Audio] Creating write stream to storage...");
             let writeStream;
             try {
                 writeStream = fileUpload.createWriteStream({
                    metadata: {
                        contentType: 'audio/mpeg', // Set the correct MIME type
                        metadata: {
                             // You can add custom metadata if needed
                             // firebaseStorageDownloadTokens: userId // Example, usually generated automatically
                        }
                    },
                    // public: true, // Optional: Make the file publicly readable if needed by rules/config
                 });
                 console.log("[API Generate Audio] Write stream created. Piping TTS stream to storage...");
             } catch (streamError: any) {
                  console.error("[API Generate Audio] Error creating storage write stream:", streamError);
                  // This is a likely place for credential/permission errors before piping starts
                  return reject(new Error(`Failed to create storage write stream: ${streamError.message}`));
             }

            audioStream.pipe(writeStream)
                .on('error', (error: Error) => {
                    // This catches errors during the piping/upload process itself
                    console.error("[API Generate Audio] Error during audio stream upload:", error);
                    reject(new Error(`Failed to upload audio stream to storage: ${error.message}`));
                })
                .on('finish', () => {
                    console.log(`[API Generate Audio] Successfully uploaded ${storagePath}`);
                    resolve(true);
                });
        });

        // 5. Get Download URL
        console.log(`[API Generate Audio] Attempting to get download URL for ${storagePath}...`);
        // Option 1: Manually construct public URL (requires file to be public or rules allowing unauthenticated reads)
         // const downloadURL = `https://firebasestorage.googleapis.com/v0/b/${storage.name}/o/${encodeURIComponent(storagePath)}?alt=media`;

        // Option 2: Get a signed URL (recommended for private files, requires more setup/permissions)
        // const [signedUrl] = await fileUpload.getSignedUrl({ action: 'read', expires: '03-09-2500' }); // Long expiry for example
        // const downloadURL = signedUrl;

        // Using manual construction for now, assuming files might be public or rules allow user access via token
         const downloadURL = `https://firebasestorage.googleapis.com/v0/b/${storage.name}/o/${encodeURIComponent(storagePath)}?alt=media`;


        console.log(`[API Generate Audio] Generated Download URL: ${downloadURL}`);

        // 6. Return the Download URL
        return NextResponse.json({ audioUrl: downloadURL }, { status: 200 });

    } catch (error: any) {
        // Catch broader errors, including those from the Promise rejection
        console.error("[API Generate Audio] Unexpected error in POST handler:", error);
         let errorMessage = error.message || 'Unknown server error';
         // Check for specific credential-related errors if possible (might be nested)
         if (errorMessage.includes('Could not refresh access token') || errorMessage.includes('credential') || errorMessage.includes('permission')) {
             errorMessage = `An authentication or permission error occurred on the server while accessing Firebase services. Please check server logs and Firebase Admin SDK configuration/credentials. Original error: ${errorMessage}`;
         }
        return NextResponse.json({ error: `Internal Server Error: ${errorMessage}` }, { status: 500 });
    }
}
```