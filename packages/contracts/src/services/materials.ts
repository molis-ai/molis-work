/** Host extraction consumes already-authorized bytes, never an arbitrary filesystem path. */
export interface MaterialSource { file_name: string; bytes: Uint8Array }
export interface MaterialPage { number: number; text: string; method: string; confidence: number | null }
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
  allowModelDownload?: boolean;
  onProgress?: (progress: { stage: string; progress: number }) => void;
}
/** Source identity, saved originals, business conversions and citation rules remain with consumers. */
export type MaterialExtractor = (source: MaterialSource, options?: MaterialExtractionOptions) => Promise<MaterialExtraction>;
