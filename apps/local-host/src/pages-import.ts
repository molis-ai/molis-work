import { pagesErrors, preparePagesImport, type PagesImportFile, type PreparedPagesImport } from "@molis-ai/molis-work-plugin-pages";
import type { MaterialDocumentOptions } from "@molis-ai/molis-work-contracts/services/materials";
import { readMaterialUploads } from "./material-documents.js";
import { isMaterialFailure } from "./material-text.js";

/** Shared production composition for Pages Actions and onboarding; no persistence occurs here. */
export async function preparePagesFileImport(files: readonly PagesImportFile[], options: MaterialDocumentOptions = {}): Promise<PreparedPagesImport> {
  try {
    const materials = await readMaterialUploads(files.map(file => ({ file_name: file.name, data_base64: file.data })), options);
    options.signal?.throwIfAborted();
    return preparePagesImport(materials);
  } catch (error) {
    options.signal?.throwIfAborted();
    if (isMaterialFailure(error)) throw pagesErrors.invalid(error.message);
    throw error;
  }
}
