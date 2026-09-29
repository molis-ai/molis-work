/** Host extraction consumes already-authorized bytes, never an arbitrary filesystem path. */
export interface MaterialSource { file_name: string; bytes: Uint8Array }
export interface MaterialLine { text: string; confidence: number | null }
export interface MaterialPage { number: number; text: string; method: string; confidence: number | null; lines?: MaterialLine[] }
export interface MaterialExtraction {
  text: string;
  title?: string;
  extractor: string;
  pages: MaterialPage[];
  segments?: { start_seconds: number; end_seconds: number; text: string }[];
  frames?: { seconds: number; text: string; confidence?: number | null }[];
  duration_seconds?: number;
  coverage: {
    status: "sufficient" | "partial" | "insufficient";
    /** True when a configured page or text budget stopped extraction. */
    truncated?: boolean;
    processed_pages: number;
    total_pages: number;
    issues: string[];
  };
}
export interface MaterialLimits {
  maxBytes: number;
  maxCharacters: number;
  maxTextBytes: number;
  maxPages: number;
}
export interface MaterialExtractionOptions {
  signal?: AbortSignal;
  limits?: Partial<MaterialLimits>;
  timeoutMs?: number;
  textFormat?: "text" | "markdown";
  pdfMode?: "text" | "ocr";
  /** Recognition languages are selected by the consuming feature; omission retains the Host defaults. */
  ocrLanguages?: readonly ("zh-Hans" | "zh-Hant" | "en-US")[];
  allowModelDownload?: boolean;
  onProgress?: (progress: { stage: string; progress: number }) => void;
}
/** Source identity, saved originals, business conversions and citation rules remain with consumers. */
export type MaterialExtractor = (source: MaterialSource, options?: MaterialExtractionOptions) => Promise<MaterialExtraction>;

/** Read an explicitly authorized HTTP(S) page; the Host owns bounded transport and HTML extraction. */
export type MaterialWebsiteReader = (url: string, options?: { signal?: AbortSignal; beforeDispatch?(): void | Promise<void> }) => Promise<MaterialExtraction>;

/** Transport form; the Host validates and decodes it before parsing. */
export interface MaterialUpload { file_name: string; data_base64: string }
export interface MaterialDocument {
  name: string;
  format: "markdown" | "html" | "text" | "csv";
  content: string;
  /** Semantic content has no stable page number; do not invent one for DOCX or archive entries. */
  coverage: Pick<MaterialExtraction["coverage"], "status" | "issues" | "truncated">;
}
export interface MaterialDocumentBatch { documents: MaterialDocument[]; warnings: string[] }
export interface MaterialDocumentOptions { signal?: AbortSignal; timeoutMs?: number }
export type MaterialDocumentReader = (sources: readonly MaterialSource[], options?: MaterialDocumentOptions) => Promise<MaterialDocumentBatch>;
