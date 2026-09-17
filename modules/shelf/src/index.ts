export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-module-shelf",
  packagePath: "modules/shelf",
  kind: "module",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/modules/shelf",
  migrationGoals: ["goal-reorg-f2"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["shelf.store.v1", "shelf.jobs.v1"],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export { ShelfError, isShelfError } from "./errors.js";
export { extractLocalText, markdownFromExtract, resultNameForExtract } from "./extract.js";
export { SAMPLE_PDF_TEXT, createExtractablePdf, extractPdfSelectableText } from "./pdf.js";
export {
  CLIPBOARD_LIMIT,
  ShelfStore,
  clipFingerprint,
  clipTitleFor,
  hashBytes,
  isConcealedClipboard,
  isHttpUrl,
  isEditableShelfItem,
  openShelfStore,
} from "./store.js";
