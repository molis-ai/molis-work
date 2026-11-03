import type { MaterialDocumentBatch, MaterialDocumentOptions, MaterialExtraction, MaterialExtractionOptions, MaterialSource, MaterialSourceContent, MaterialUpload } from "../services/materials.js";

export type { MaterialSourceContent } from "../services/materials.js";

/** Authority comes from the running action. Only a user call can approve a model download. */
export type PluginMaterialRequest = MaterialExtractionOptions;
export type PluginMaterialSourceRequest = Pick<MaterialExtractionOptions, "signal" | "allowModelDownload" | "onProgress"> & {
  /**
   * Exact lowercase host names the read may contact, from the first request through every redirect and every page, API or media file the
   * source's reader follows to; a request to any other host is refused (`material.source.domain_not_allowed`) before it is looked up or sent.
   * Without it, every public host may be read. At most 20 names.
   */
  readonly allowedDomains?: readonly string[];
};
export type PluginMaterialDocumentsRequest = MaterialDocumentOptions;
/** A local page is read as text only: cancellation is the one thing a caller adds. */
export type PluginLocalPageRequest = Pick<MaterialExtractionOptions, "signal">;
/** `maxBytes` can only lower the Host's own cap (32 MiB); it never raises it. */
export interface PluginOriginalRequest {
  readonly signal?: AbortSignal;
  readonly maxBytes?: number;
}
/** The bytes of one original file exactly as they are on disk now. The path is the Host's and is never shown to the plugin. */
export interface PluginOriginalContent {
  readonly bytes: Uint8Array;
}
/**
 * One part of an original file: `length` bytes from `offset`. A later part passes the `revision` an earlier part answered, so that a file
 * changed in between is refused instead of read as a mixture of two files.
 */
export interface PluginOriginalRangeRequest {
  readonly offset: number;
  readonly length: number;
  readonly revision?: string;
  readonly signal?: AbortSignal;
}
/** A part of an original file with the file's whole size and an opaque revision of it (a digest of what identifies the file and its last change; never a path). */
export interface PluginOriginalRangeContent {
  readonly bytes: Uint8Array;
  readonly size: number;
  readonly revision: string;
}

/**
 * The Host's existing material readers. Available only to Host-executed plugins, inside their own concurrent actions.
 * Each method appears only for its declared permission and rechecks the running action and grant before effects and return.
 * The plugin must still call beforeEffect before saving a result against the version it read.
 */
export interface PluginMaterialsClient {
  /** Present for materials:read. Reads already-authorized bytes, never an arbitrary filesystem path. */
  extract?(source: MaterialSource, request?: PluginMaterialRequest): Promise<MaterialExtraction>;
  /**
   * Present for materials:read. Reads a batch of documents (Markdown, HTML, text, CSV, DOCX, or a ZIP of those) in their transport form;
   * the Host validates and decodes the base64 before it allocates, and owns ZIP and DOCX parsing and its limits.
   */
  readDocuments?(files: readonly MaterialUpload[], request?: PluginMaterialDocumentsRequest): Promise<MaterialDocumentBatch>;
  /**
   * Present for materials:read. Whether `extract` can read the text of an image on this machine now (a view or a route may ask it
   * before it offers image import). It reads nothing and runs no action: the answer is a fact about the machine, not about a material.
   */
  imageTextAvailable?(): boolean;
  /** Present for materials:fetch. Every request and redirect must resolve to public HTTP(S) addresses. */
  readSource?(url: string, request?: PluginMaterialSourceRequest): Promise<MaterialSourceContent>;
  /**
   * Present for materials:fetch_local. Reads one page on this machine as text: plain HTTP to 127.0.0.1, [::1] or `localhost` only, never
   * the Host's own listening ports, every redirect held to the same rule. A public address is `readSource`'s, not this one's.
   */
  readLocalPage?(url: string, request?: PluginLocalPageRequest): Promise<MaterialExtraction>;
  /**
   * Present for materials:original. Keeps the path the person handed the Host in this request (an import through the Host's own entry)
   * under the plugin's own `record_key`, for this installation. The plugin never names the path; with no offered file, the call is refused.
   */
  claimOriginal?(record_key: string): Promise<void>;
  /**
   * Present for materials:original. Reads that file again, read-only: the path must still resolve to what was registered, be a regular
   * file and fit the cap. It lists no directory and writes nothing.
   */
  readOriginal?(record_key: string, request?: PluginOriginalRequest): Promise<PluginOriginalContent>;
  /**
   * Present for materials:original. Reads one part of that file, with every check `readOriginal` makes, for a caller that cannot take the
   * whole file at once (a sandboxed plugin reads it in parts over its channel). Each part is a read of its own: it rechecks the running
   * action and the grant, and the file's identity before and after.
   */
  readOriginalRange?(record_key: string, request: PluginOriginalRangeRequest): Promise<PluginOriginalRangeContent>;
  /** Present for materials:original. Forgets one registration (the plugin's record was deleted). */
  releaseOriginal?(record_key: string): Promise<void>;
}
