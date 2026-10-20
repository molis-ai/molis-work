import type { MaterialDocumentBatch, MaterialDocumentOptions, MaterialExtraction, MaterialExtractionOptions, MaterialSource, MaterialSourceContent, MaterialUpload } from "../services/materials.js";

export type { MaterialSourceContent } from "../services/materials.js";

/** Authority comes from the running action. Only a user call can approve a model download. */
export type PluginMaterialRequest = MaterialExtractionOptions;
export type PluginMaterialSourceRequest = Pick<MaterialExtractionOptions, "signal" | "allowModelDownload" | "onProgress">;
export type PluginMaterialDocumentsRequest = MaterialDocumentOptions;

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
  /** Present for materials:fetch. Every request and redirect must resolve to public HTTP(S) addresses. */
  readSource?(url: string, request?: PluginMaterialSourceRequest): Promise<MaterialSourceContent>;
}
