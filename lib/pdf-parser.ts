import * as pdfjsLib from 'pdfjs-dist';

// Setup worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`;

export const getPdfPageCount = async (file: File): Promise<number> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    return pdf.numPages;
  } catch (err: any) {
    console.error("PDF page count error:", err);
    throw new Error('Failed to read PDF: ' + err.message);
  }
};

export const extractTextChunksFromPdf = async (file: File, startPage: number, endPage: number): Promise<string[]> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    
    const chunks: string[] = [];
    let currentChunk = '';
    const MAX_CHUNK_LENGTH = 5000; // character limit per chunk, reduced for better question density coverage
    
    for (let i = startPage; i <= endPage; i++) {
        if (i < 1 || i > pdf.numPages) continue;
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        
        if (currentChunk.length + pageText.length > MAX_CHUNK_LENGTH && currentChunk.length > 0) {
            chunks.push(currentChunk);
            currentChunk = '';
        }
        currentChunk += pageText + '\n\n';
    }
    
    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }
    
    return chunks;
  } catch (err: any) {
    console.error("PDF extraction error:", err);
    throw new Error('Failed to extract text from PDF: ' + err.message);
  }
};
