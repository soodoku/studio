
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, TextItem } from 'pdfjs-dist/types/src/display/api';


// Specify the worker source explicitly.
// This path assumes the worker file is copied to `/_next/static/chunks/` by Webpack.
if (typeof window !== 'undefined') {
    // Construct the path relative to the base URL
    const workerSrc = '/_next/static/chunks/pdf.worker.min.mjs';
    console.log(`[PDF.js] Attempting to set worker source to: ${workerSrc}`);
    try {
        // Check if workerSrc is already set and different
        if (pdfjsLib.GlobalWorkerOptions.workerSrc !== workerSrc) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
            console.log('[PDF.js] Worker source updated successfully.');
        } else {
            console.log('[PDF.js] Worker source already set to the correct path.');
        }
         // Verify if the setting took effect (optional sanity check)
         console.log(`[PDF.js] Current workerSrc: ${pdfjsLib.GlobalWorkerOptions.workerSrc}`);
    } catch (e) {
        console.error("[PDF.js] Error setting worker source:", e);
    }

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

  console.log(`[PDF.js] Starting text extraction from PDF: ${file.name}`);
  const arrayBuffer = await file.arrayBuffer();
  let fullText = '';

  try {
    // Log the worker source right before loading the document
    console.log(`[PDF.js] Using workerSrc: ${pdfjsLib.GlobalWorkerOptions.workerSrc}`);

    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf: PDFDocumentProxy = await loadingTask.promise;
    console.log(`[PDF.js] PDF loaded: ${pdf.numPages} pages`);

    for (let i = 1; i <= pdf.numPages; i++) {
      try {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();

        // textContent.items is an array of objects matching the TextItem type
        // We need to assert the type here if TypeScript doesn't infer it correctly
        const pageText = (textContent.items as TextItem[]).map(item => item.str).join(' ');
        fullText += pageText + '\n\n'; // Add double newline between pages
        console.log(`[PDF.js] Extracted text from page ${i}`);
        // Clean up page resources to free memory
        page.cleanup();
      } catch (pageError) {
          console.error(`[PDF.js] Error processing page ${i}:`, pageError);
          fullText += `[Error extracting text from page ${i}]\n\n`;
      }
    }

     // Destroy the PDF document object to release memory
     await pdf.destroy();
     console.log('[PDF.js] PDF document destroyed.');


    console.log(`[PDF.js] Finished extracting text. Total length: ${fullText.length}`);
    if (fullText.trim().length === 0) {
        return "No text content could be extracted from this PDF.";
    }
    return fullText.trim(); // Trim whitespace from start/end

  } catch (error) {
    console.error('[PDF.js] Error processing PDF:', error);
     if (error instanceof Error) {
         if (error.name === 'PasswordException') {
             return `Error: Could not extract text. The PDF file "${file.name}" is password protected.`;
         } else if (error.name === 'InvalidPDFException') {
             return `Error: Could not extract text. The file "${file.name}" is not a valid PDF or is corrupted.`;
         } else if (error.message.includes('Setting up fake worker failed') || error.message.includes('Failed to fetch dynamically imported module')) {
             console.error("[PDF.js] Worker setup or loading failed. Check the workerSrc path in logs, network tab for 404s, and Webpack/Turbopack config.", pdfjsLib.GlobalWorkerOptions.workerSrc);
             return `Error: Failed to initialize PDF processing components. Please ensure the PDF worker file (${pdfjsLib.GlobalWorkerOptions.workerSrc}) is accessible and try again. (${error.message})`;
         }
    }
    throw new Error(`Failed to extract text from PDF "${file.name}". Reason: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Note: ePUB conversion would require a separate library like epub.js and a similar extraction process.
