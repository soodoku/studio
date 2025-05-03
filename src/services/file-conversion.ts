
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, TextItem } from 'pdfjs-dist/types/src/display/api';


// Specify the worker source explicitly.
// This path assumes the worker file is copied to `public/_next/static/chunks/` by Webpack.
if (typeof window !== 'undefined') {
    // Construct the path relative to the base URL
    const workerSrc = '/_next/static/chunks/pdf.worker.min.mjs';
    console.log(`Setting PDF.js worker source to: ${workerSrc}`);
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
}


/**
 * Converts a PDF file to a text format using pdf.js.
 * Extracts text content from all pages.
 */
export async function convertFileToText(file: File): Promise<string> {
  if (file.type !== 'application/pdf') {
    // TODO: Add support for ePUB if needed
    console.warn('File type not supported for text extraction:', file.type);
     // Return a placeholder or throw error for non-PDFs for now
    return `File type (${file.type}) not currently supported for text extraction. Only PDF is implemented.`;
  }

  console.log(`Extracting text from PDF: ${file.name}`);
  const arrayBuffer = await file.arrayBuffer();
  let fullText = '';

  try {
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf: PDFDocumentProxy = await loadingTask.promise;
    console.log(`PDF loaded: ${pdf.numPages} pages`);

    for (let i = 1; i <= pdf.numPages; i++) {
      try {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();

        // textContent.items is an array of objects matching the TextItem type
        // We need to assert the type here if TypeScript doesn't infer it correctly
        const pageText = (textContent.items as TextItem[]).map(item => item.str).join(' ');
        fullText += pageText + '\n\n'; // Add double newline between pages
        console.log(`Extracted text from page ${i}`);
        // Clean up page resources to free memory
        page.cleanup();
      } catch (pageError) {
          console.error(`Error processing page ${i}:`, pageError);
          fullText += `[Error extracting text from page ${i}]\n\n`;
      }
    }

     // Destroy the PDF document object to release memory
     await pdf.destroy();
     console.log('PDF document destroyed.');


    console.log(`Finished extracting text. Total length: ${fullText.length}`);
    if (fullText.trim().length === 0) {
        return "No text content could be extracted from this PDF.";
    }
    return fullText.trim(); // Trim whitespace from start/end

  } catch (error) {
    console.error('Error processing PDF:', error);
     if (error instanceof Error) {
         if (error.name === 'PasswordException') {
             return `Error: Could not extract text. The PDF file "${file.name}" is password protected.`;
         } else if (error.name === 'InvalidPDFException') {
             return `Error: Could not extract text. The file "${file.name}" is not a valid PDF or is corrupted.`;
         } else if (error.message.includes('Setting up fake worker failed')) {
             console.error("PDF Worker setup failed. Check the workerSrc path and network connectivity.");
             return `Error: Failed to initialize PDF processing components. Please ensure you are online and try again. Worker path: ${pdfjsLib.GlobalWorkerOptions.workerSrc}`;
         }
    }
    throw new Error(`Failed to extract text from PDF "${file.name}". Reason: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Note: ePUB conversion would require a separate library like epub.js and a similar extraction process.
