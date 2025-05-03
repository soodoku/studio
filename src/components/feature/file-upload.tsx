'use client';

import React, { useRef, useState, type ChangeEvent } from 'react';
import { Upload } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { convertFileToText } from '@/services/file-conversion'; // Assuming this service exists

interface FileUploadProps {
  buttonVariant?: ButtonProps['variant'];
  buttonSize?: ButtonProps['size'];
}

export function FileUpload({ buttonVariant = 'outline', buttonSize = 'default' }: FileUploadProps) {
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
      title: "Uploading File",
      description: `Processing ${file.name}...`,
    });

    try {
      // Placeholder for actual file processing/upload logic
      console.log('Selected file:', file);
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Call the conversion function (currently a placeholder)
      // const textContent = await convertFileToText(file);
      // console.log('Converted text:', textContent);
      // TODO: Handle the converted text (e.g., store it, pass it to TTS)

      toast({
        title: "Upload Successful",
        description: `${file.name} has been uploaded and is ready.`, // Update message based on actual processing
      });
    } catch (error) {
      console.error("Error uploading file:", error);
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: "There was an error processing your file. Please try again.",
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
        {isUploading ? 'Uploading...' : 'Upload File'}
      </Button>
    </>
  );
}
