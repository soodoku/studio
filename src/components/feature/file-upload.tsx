
'use client';

import React, { useRef, useState, type ChangeEvent } from 'react';
import { Upload } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { convertFileToText } from '@/services/file-conversion'; // Assuming this service exists and is updated

interface FileUploadProps {
  buttonVariant?: ButtonProps['variant'];
  buttonSize?: ButtonProps['size'];
  // Updated callback to receive filename and content
  onUploadSuccess?: (fileName: string, textContent: string) => void;
}

export function FileUpload({
  buttonVariant = 'outline',
  buttonSize = 'default',
  onUploadSuccess, // Destructure the updated callback prop
}: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Basic validation (example: allow only PDF and ePUB)
    const allowedTypes = ['application/pdf', 'application/epub+zip'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        variant: "destructive",
        title: "Invalid File Type",
        description: "Please upload a PDF or ePUB file.",
      });
      // Clear the input field
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    setIsUploading(true);
    toast({
      title: "Processing File",
      description: `Extracting text from ${file.name}...`,
    });

    try {
      // Call the conversion function to get text content
      const textContent = await convertFileToText(file);
      console.log('Extracted text length:', textContent.length);

      toast({
        title: "Processing Successful",
        description: `Text extracted from ${file.name}.`,
      });

      // Call the success callback with the file name and text content
      if (onUploadSuccess) {
        onUploadSuccess(file.name, textContent);
      }

    } catch (error) {
      console.error("Error processing file:", error);
      toast({
        variant: "destructive",
        title: "Processing Failed",
        description: "There was an error extracting text from your file. Please try again.",
      });
    } finally {
      setIsUploading(false);
       // Clear the input field after processing
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <>
      <Input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept=".pdf,.epub" // Specify accepted file types
        disabled={isUploading}
      />
      <Button
        onClick={handleButtonClick}
        variant={buttonVariant}
        size={buttonSize}
        disabled={isUploading}
        className="w-full" // Make button full width in sidebar footer
      >
        <Upload className="mr-2 h-4 w-4" />
        {isUploading ? 'Processing...' : 'Upload File'}
      </Button>
    </>
  );
}
