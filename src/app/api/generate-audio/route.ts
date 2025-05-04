
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth'; // Use firebase-admin for server-side auth verification
import { getStorage } from 'firebase-admin/storage';
import { initializeAdminApp } from '@/lib/firebase/adminApp'; // Helper to initialize admin app
import gTTS from 'node-gtts';
import { Readable } from 'stream';
import z from 'zod';

// Initialize Firebase Admin SDK (ensure this runs only once)
initializeAdminApp();

const InputSchema = z.object({
    text: z.string().min(10, { message: "Text must be at least 10 characters long." }),
    bookId: z.string().min(1, { message: "Book ID is required." }),
});

// Ensure we use Edge runtime for potentially longer operations if deploying to Vercel Edge
// export const runtime = 'edge'; // Comment out if node-gtts requires Node.js APIs not available in Edge

export async function POST(request: NextRequest) {
    try {
        // 1. Verify Authentication using Firebase Admin SDK
        const authToken = request.headers.get('Authorization')?.split('Bearer ')[1];
        if (!authToken) {
            return NextResponse.json({ error: 'Unauthorized: Missing authentication token.' }, { status: 401 });
        }

        let decodedToken;
        try {
            decodedToken = await getAuth().verifyIdToken(authToken);
        } catch (error) {
            console.error("Auth token verification failed:", error);
            return NextResponse.json({ error: 'Unauthorized: Invalid authentication token.' }, { status: 401 });
        }
        const userId = decodedToken.uid;
        console.log(`[API Generate Audio] Authenticated user: ${userId}`);


        // 2. Parse and Validate Input
        const body = await request.json();
        const validationResult = InputSchema.safeParse(body);

        if (!validationResult.success) {
            const issues = validationResult.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ');
            console.error("[API Generate Audio] Invalid input:", issues);
            return NextResponse.json({ error: `Invalid input: ${issues}` }, { status: 400 });
        }

        const { text, bookId } = validationResult.data;
        console.log(`[API Generate Audio] Received request for bookId: ${bookId}, text length: ${text.length}`);

        // 3. Generate Audio using node-gtts
        const tts = gTTS('en'); // Language code (e.g., 'en')
        const audioStream: Readable = tts.stream(text);
        console.log(`[API Generate Audio] TTS stream created.`);

        // 4. Upload Audio Stream to Firebase Storage
        const storage = getStorage().bucket(); // Default bucket
        const audioFileName = `${bookId}_audio.mp3`;
        // IMPORTANT: Ensure storage rules allow writing to this path for the authenticated user
        const storagePath = `audiobooks_generated/${userId}/${audioFileName}`;
        const fileUpload = storage.file(storagePath);

        console.log(`[API Generate Audio] Starting upload to Storage: ${storagePath}`);

        await new Promise((resolve, reject) => {
            const writeStream = fileUpload.createWriteStream({
                metadata: {
                    contentType: 'audio/mpeg', // Set the correct MIME type
                    metadata: {
                         firebaseStorageDownloadTokens: userId // Example, could be a UUID too
                    }
                },
                // public: true, // Optional: Make the file publicly readable if needed
            });

            audioStream.pipe(writeStream)
                .on('error', (error) => {
                    console.error("[API Generate Audio] Error uploading audio stream:", error);
                    reject(new Error(`Failed to upload audio to storage: ${error.message}`));
                })
                .on('finish', () => {
                    console.log(`[API Generate Audio] Successfully uploaded ${storagePath}`);
                    resolve(true);
                });
        });

        // 5. Get Download URL (using public URL format for simplicity, adjust if needed)
        // Note: This assumes default bucket naming and public access or signed URLs later
         const downloadURL = `https://firebasestorage.googleapis.com/v0/b/${storage.name}/o/${encodeURIComponent(storagePath)}?alt=media`; // Construct URL manually or use getSignedUrl
        console.log(`[API Generate Audio] Generated Download URL: ${downloadURL}`);

        // 6. Return the Download URL
        return NextResponse.json({ audioUrl: downloadURL }, { status: 200 });

    } catch (error: any) {
        console.error("[API Generate Audio] Unexpected error:", error);
        return NextResponse.json({ error: `Internal Server Error: ${error.message || 'Unknown error'}` }, { status: 500 });
    }
}
