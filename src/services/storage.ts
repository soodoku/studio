
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
      return reject(new Error('User not authenticated. Cannot upload file.'));
    }
    if (!storage) {
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
        console.log(`[Storage] Upload is ${progress}% done`);
        onProgress?.(progress); // Call the progress callback if provided

        switch (snapshot.state) {
          case 'paused':
            console.log('[Storage] Upload is paused');
            break;
          case 'running':
            console.log('[Storage] Upload is running');
            break;
        }
      },
      (error) => {
        // Handle unsuccessful uploads
        console.error('[Storage] Upload failed:', error);
        // A more detailed error handling could be added here based on error.code
        switch (error.code) {
          case 'storage/unauthorized':
            reject(new Error('Permission denied. Check Firebase Storage security rules.'));
            break;
          case 'storage/canceled':
            reject(new Error('Upload canceled.'));
            break;
          case 'storage/unknown':
            reject(new Error('An unknown storage error occurred.'));
            break;
          default:
            reject(new Error(`Upload failed: ${error.message}`));
        }
      },
      async () => {
        // Handle successful uploads on complete
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          console.log('[Storage] File available at', downloadURL);
          resolve(downloadURL);
        } catch (getUrlError) {
          console.error('[Storage] Failed to get download URL:', getUrlError);
          reject(new Error('Upload succeeded, but failed to get download URL.'));
        }
      }
    );
  });
};

// TODO: Add function to delete files from storage when a book is deleted.
// export const deleteFileFromStorage = async (storagePathOrUrl: string): Promise<void> => { ... }
