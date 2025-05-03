
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, TextItem } from 'pdfjs-dist/types/src/display/api';


let workerSrcIsSet = false;
let workerSetupError: Error | null = null;

// Specify the worker source explicitly.
// This path assumes the worker file is copied to `/_next/static/chunks/` by Webpack.
if (typeof window !== 'undefined') {
    // Construct the path relative to the base URL
    const workerSrc = '/_next/static/chunks/pdf.worker.min.mjs';
    console.log(`[PDF.js] Attempting to set worker source to: ${workerSrc}`);
    try {
        // Check if workerSrc is already set and different, or if it hasn't been set yet.
        if (pdfjsLib.GlobalWorkerOptions.workerSrc !== workerSrc || !workerSrcIsSet) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
            console.log('[PDF.js] Worker source updated successfully.');
            workerSrcIsSet = true; // Mark as set
            workerSetupError = null; // Clear any previous setup error
        } else {
            console.log('[PDF.js] Worker source already set to the correct path.');
            workerSrcIsSet = true; // Ensure it's marked as set
        }
         // Verify if the setting took effect (optional sanity check)
         console.log(`[PDF.js] Current workerSrc: ${pdfjsLib.GlobalWorkerOptions.workerSrc}`);
    } catch (e) {
        workerSetupError = new Error(`Error setting PDF.js worker source: ${e instanceof Error ? e.message : String(e)}`);
        console.error("[PDF.js] " + workerSetupError.message);
        workerSrcIsSet = false;
    }
}


/**
 * Converts a PDF file to a text format using pdf.js.
 * Extracts text content from all pages.
 */
export async function convertFileToText(file: File): Promise<string> {
  // Check worker status before attempting to process
  if (typeof window !== 'undefined' && (!workerSrcIsSet || workerSetupError)) {
      const errorMsg = workerSetupError?.message || "PDF worker source not configured correctly.";
      console.error(`[PDF.js] Pre-check failed: ${errorMsg}`);
      throw new Error(`PDF processing cannot start. Worker setup failed: ${errorMsg}. Check console for details.`);
  }
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc && typeof window !== 'undefined') {
      console.error("[PDF.js] Pre-check failed: workerSrc is not set.");
      throw new Error("PDF processing cannot start. Worker source is missing.");
  }


  if (file.type !== 'application/pdf') {
    // TODO: Add support for ePUB if needed
    console.warn('File type not supported for text extraction:', file.type);
     // Return a placeholder or throw error for non-PDFs for now
    return `File type (${file.type}) not currently supported for text extraction. Only PDF is implemented.`;
  }

  console.log(`[PDF.js] Starting text extraction from PDF: ${file.name}`);
  const arrayBuffer = await file.arrayBuffer();
  let fullText = '';
  let pdf: PDFDocumentProxy | null = null; // Define pdf variable here

  try {
    // Log the worker source right before loading the document
    console.log(`[PDF.js] Using workerSrc for getDocument: ${pdfjsLib.GlobalWorkerOptions.workerSrc}`);

    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    pdf = await loadingTask.promise; // Assign to pdf variable
    console.log(`[PDF.js] PDF loaded: ${pdf.numPages} pages`);

    for (let i = 1; i <= pdf.numPages; i++) {
      let page = null;
      try {
        page = await pdf.getPage(i);
        const textContent = await page.getTextContent();

        // textContent.items is an array of objects matching the TextItem type
        // We need to assert the type here if TypeScript doesn't infer it correctly
        const pageText = (textContent.items as TextItem[]).map(item => item.str).join(' ');
        fullText += pageText + '\n\n'; // Add double newline between pages
        console.log(`[PDF.js] Extracted text from page ${i}`);
      } catch (pageError) {
          console.error(`[PDF.js] Error processing page ${i}:`, pageError);
          fullText += `[Error extracting text from page ${i}]\n\n`;
      } finally {
           // Clean up page resources to free memory, even if there was an error
           if (page) {
              page.cleanup();
           }
      }
    }

    console.log(`[PDF.js] Finished extracting text. Total length: ${fullText.length}`);
    if (fullText.trim().length === 0) {
        return "No text content could be extracted from this PDF (it might be image-based or empty).";
    }
    return fullText.trim(); // Trim whitespace from start/end

  } catch (error: unknown) { // Catch unknown type
    console.error('[PDF.js] Error processing PDF:', error);
    let specificMessage = 'An unknown error occurred during PDF processing.';

     if (error instanceof Error) {
         specificMessage = error.message; // Default to the error's message
         if (error.name === 'PasswordException' || specificMessage.includes('password')) {
             specificMessage = `Could not extract text. The PDF file "${file.name}" is password protected.`;
         } else if (error.name === 'InvalidPDFException' || specificMessage.includes('Invalid PDF structure')) {
             specificMessage = `Could not extract text. The file "${file.name}" is not a valid PDF or is corrupted.`;
         } else if (specificMessage.includes('Setting up fake worker failed') || specificMessage.includes('Failed to fetch dynamically imported module')) {
             const workerPath = pdfjsLib.GlobalWorkerOptions.workerSrc || 'Not Set';
             console.error("[PDF.js] Worker setup or loading failed critically. Check the workerSrc path in logs, network tab for 404s, and Webpack config.", workerPath, error);
             specificMessage = `PDF Worker Error: Failed to load processing components from '${workerPath}'. Check network connectivity and application setup. (${error.message})`;
         } else if (specificMessage.includes('NetworkError') || specificMessage.includes('fetch')) {
            specificMessage = `Network error while processing PDF: ${error.message}. Please check your connection.`;
         }
    }
     // Always throw a new error with the refined message
    throw new Error(`Failed to extract text from PDF "${file.name}". Reason: ${specificMessage}`);
  } finally {
     // Ensure destroy is called even if errors occurred during page processing
     if (pdf) {
        try {
           await pdf.destroy();
           console.log('[PDF.js] PDF document destroyed.');
        } catch (destroyError) {
           console.error('[PDF.js] Error destroying PDF document:', destroyError);
        }
     }
  }
}

// Note: ePUB conversion would require a separate library like epub.js and a similar extraction process.
