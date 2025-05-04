
'use client';

import { storage, auth } from '@/lib/firebase/clientApp';
import { ref, uploadBytesResumable, getDownloadURL, UploadTaskSnapshot } from 'firebase/storage';

/**
 * Uploads a file to Firebase Storage under a user-specific path.
 *
 * @param file The file to upload.
 * @param pathPrefix Optional prefix for the storage path (e.g., 'audiobooks/').
 * @param onProgress Optional callback to track upload progress.
 * @returns A promise that resolves with the download URL of the uploaded file.
 * @throws If the user is not authenticated or if the upload fails.
 */
export const uploadFileToStorage = (
  file: File,
  pathPrefix: string = 'uploads/',
  onProgress?: (progress: number) => void
): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!auth?.currentUser) {
      console.error('[Storage] User not authenticated. Cannot upload file.');
      return reject(new Error('User not authenticated. Cannot upload file.'));
    }
    if (!storage) {
        console.error('[Storage] Firebase Storage is not initialized.');
        return reject(new Error('Firebase Storage is not initialized.'));
    }

    const userId = auth.currentUser.uid;
    // Ensure pathPrefix ends with a slash
    const prefix = pathPrefix.endsWith('/') ? pathPrefix : `${pathPrefix}/`;
    // Sanitize filename (replace spaces, special chars, etc.) - Basic example
    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${prefix}${userId}/${Date.now()}_${sanitizedFilename}`;
    const storageRef = ref(storage, storagePath);

    console.log(`[Storage] Starting upload to: ${storagePath}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      'state_changed',
      (snapshot: UploadTaskSnapshot) => {
        // Observe state change events such as progress, pause, and resume
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        // console.log(`[Storage] Upload is ${progress}% done`); // Less verbose logging
        if (progress === 100) console.log('[Storage] Upload 100% done, waiting for completion event...');
        onProgress?.(progress); // Call the progress callback if provided

        switch (snapshot.state) {
          case 'paused':
            console.log('[Storage] Upload is paused');
            break;
          case 'running':
            // console.log('[Storage] Upload is running'); // Too noisy
            break;
        }
      },
      (error) => {
        // Handle unsuccessful uploads
        console.error('[Storage] Upload task failed:', error);
        let errorMessage = `Upload failed: ${error.message}`;
        // A more detailed error handling could be added here based on error.code
        switch (error.code) {
          case 'storage/unauthorized':
            errorMessage = 'Permission denied. Check Firebase Storage security rules.';
            break;
          case 'storage/canceled':
            errorMessage = 'Upload canceled.';
            break;
          case 'storage/retry-limit-exceeded': // Added specific handling
              errorMessage = 'Upload timed out due to network issues. Please check your connection and try again.';
              break;
          case 'storage/unknown':
            errorMessage = 'An unknown storage error occurred.';
            break;
        }
        console.log('[Storage] Rejecting upload promise due to upload error.'); // <-- Add log
        reject(new Error(errorMessage));
      },
      async () => {
        // Handle successful uploads on complete
        console.log('[Storage] Upload task completed successfully. Getting download URL...');
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          console.log('[Storage] File available at', downloadURL);
          console.log('[Storage] Resolving upload promise.'); // <-- Add log
          resolve(downloadURL);
        } catch (getUrlError) {
          console.error('[Storage] Failed to get download URL after upload:', getUrlError);
          console.log('[Storage] Rejecting upload promise due to getDownloadURL error.'); // <-- Add log
          reject(new Error('Upload succeeded, but failed to get download URL.'));
        }
      }
    );
  });
};

// TODO: Add function to delete files from storage when a book is deleted.
// export const deleteFileFromStorage = async (storagePathOrUrl: string): Promise<void> => { ... }


