declare module "pdfjs-dist/build/pdf.mjs" {
  export interface PdfTextItem {
    str: string;
    hasEOL?: boolean;
  }

  export interface PdfTextContent {
    items: (PdfTextItem | { type: string })[];
  }

  export interface PdfPageProxy {
    getTextContent(): Promise<PdfTextContent>;
    cleanup(): void;
  }

  export interface PdfDocumentProxy {
    numPages: number;
    getPage(page: number): Promise<PdfPageProxy>;
    destroy(): Promise<void>;
  }

  export const GlobalWorkerOptions: { workerSrc: string };

  export interface PdfLoadingTask {
    promise: Promise<PdfDocumentProxy>;
    destroy(): Promise<void>;
  }

  export function getDocument(src: {
    data: Uint8Array;
    isEvalSupported?: boolean;
  }): PdfLoadingTask;
}
