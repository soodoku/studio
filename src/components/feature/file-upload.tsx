
'use client';

import React, { useRef, useState, type ChangeEvent } from 'react';
import { Upload, Loader2 } from 'lucide-react'; // Added Loader2
import { Button, type ButtonProps } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { uploadFileToStorage } from '@/services/storage'; // Import the storage service
import { Progress } from '@/components/ui/progress'; // Import Progress component
// Removed import for convertFileToText


// Define the structure for the metadata passed to onUploadSuccess
// Removed textContent as it's no longer extracted during upload
export interface FileUploadMetadata {
    fileName: string;
    contentType: string;
    size: number;
    storageUrl: string;
}


interface FileUploadProps {
  buttonVariant?: ButtonProps['variant'];
  buttonSize?: ButtonProps['size'];
  // Updated callback to receive metadata object
  onUploadSuccess?: (metadata: FileUploadMetadata) => void | Promise<void>; // Allow async callback
}

export function FileUpload({
  buttonVariant = 'outline',
  buttonSize = 'default',
  onUploadSuccess,
}: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null); // Track upload progress
  const { toast } = useToast();

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Basic validation (allow only PDF for now, ePUB needs storage setup too)
    const allowedTypes = ['application/pdf']; // Limit to PDF for now
    if (!allowedTypes.includes(file.type)) {
      toast({
        variant: "destructive",
        title: "Invalid File Type",
        description: "Please upload a PDF file.", // Updated message
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setIsUploading(true);
    setUploadProgress(0); // Reset progress
    toast({
      title: "Starting Upload",
      description: `Uploading ${file.name}...`,
    });

    try {
        // 1. Upload file to Firebase Storage
        console.log("[FileUpload] Calling uploadFileToStorage...");
        const downloadURL = await uploadFileToStorage(
            file,
            'audiobooks/', // Store in 'audiobooks/' folder
            (progress) => {
                setUploadProgress(progress); // Update progress state
            }
        );
        console.log("[FileUpload] uploadFileToStorage finished successfully. URL:", downloadURL); // <-- Add log

        // 2. Prepare metadata for Firestore (without text content)
        const metadata: FileUploadMetadata = {
            fileName: file.name,
            contentType: file.type,
            size: file.size,
            storageUrl: downloadURL,
        };

        console.log("[FileUpload] Metadata prepared:", metadata);

        toast({
            title: "Upload Successful",
            description: `${file.name} uploaded and saved.`,
        });

      // 3. Call the success callback with the metadata
      if (onUploadSuccess) {
        console.log("[FileUpload] Calling onUploadSuccess..."); // <-- Add log
        await onUploadSuccess(metadata); // Await if it's async
        console.log("[FileUpload] onUploadSuccess finished."); // <-- Add log
      } else {
        console.log("[FileUpload] No onUploadSuccess callback provided.");
      }

    } catch (error: unknown) {
      console.error("Error during file upload process (FileUpload component):", error); // Log context
      let errorMessage = "Could not upload the file.";
      if (error instanceof Error) {
        errorMessage = error.message; // Use the specific error from the storage service or addBook
      }
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: errorMessage,
      });
    } finally {
      // Ensure loading state and progress are reset in all cases
      console.log("[FileUpload] Upload process finished (success or failure). Resetting state.");
      setIsUploading(false);
      setUploadProgress(null); // Clear progress
      if (fileInputRef.current) fileInputRef.current.value = ""; // Clear input
    }
  };

  return (
    <>
      <Input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept=".pdf" // Specify accepted file types
        disabled={isUploading}
      />
      <Button
        onClick={handleButtonClick}
        variant={buttonVariant}
        size={buttonSize}
        disabled={isUploading}
        className="w-full"
      >
        {isUploading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Uploading...
          </>
        ) : (
          <>
            <Upload className="mr-2 h-4 w-4" />
            Upload File
          </>
        )}
      </Button>
      {/* Display Progress Bar during upload */}
      {isUploading && uploadProgress !== null && (
         <Progress value={uploadProgress} className="w-full h-2 mt-2" />
      )}
    </>
  );
}

