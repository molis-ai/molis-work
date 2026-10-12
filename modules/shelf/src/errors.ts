import { readFileSync } from "node:fs";
import { defineErrorCodes, type ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { BoundedInferenceReceipt } from "@molis-ai/molis-work-contracts/services/agent-host";

/**
 * Shelf's own error codes, every one `shelf.<reason>`. The kind is the sort of failure; the Host's edge turns it into the status (plugin SDK
 * `actionHttpStatus`), so Shelf keeps no status table of its own. Every status is the one the Shelf route answered for the code before: a
 * material that is not on the shelf 404, a shortcut or a model that is not there 409, a refusal to write over what changed 409, and every
 * other refusal of a request 400.
 *
 * Two codes say "not there". `item_not_found` is what the store and its routes raise for a material, a task or a clipboard entry that is not on the
 * shelf. `not_found` is the answer of the subject and file readers (`shelf.subject.read`, `shelf.files.content`) for a copy that was deleted:
 * the placement service reads a reader code that ends in `.not_found` as "the object was deleted" and lets the person clean the row up, so the
 * readers keep that ending.
 */
export const shelfErrors = defineErrorCodes("shelf", {
  busy: "invalid",
  cancelled: "invalid",
  configuration_changed: "invalid",
  conflict: "conflict",
  empty_file: "invalid",
  empty_selection: "invalid",
  extraction_unavailable: "invalid",
  hash_changed: "invalid",
  image_unsupported: "invalid",
  invalid: "invalid",
  invalid_file: "invalid",
  invalid_result: "invalid",
  item_not_found: "not_found",
  job_failed: "invalid",
  job_timeout: "invalid",
  missing_output: "invalid",
  no_model: "conflict",
  no_ocr: "invalid",
  no_text: "invalid",
  not_found: "not_found",
  not_result: "invalid",
  not_text: "invalid",
  origin_changed: "invalid",
  path_invalid: "invalid",
  recipe_unavailable: "conflict",
  source_conflict: "invalid",
  too_large: "invalid",
  unavailable: "invalid",
});

/** A Shelf failure may carry the receipt of the model run behind it; the job record keeps it. */
export type ShelfFailure = ActionError & { execution?: BoundedInferenceReceipt };

/** Whether a failure is Shelf's own (read by its code, not its class: another copy of the contracts makes another class). */
export function isShelfFailure(error: unknown): error is ShelfFailure {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code === "string" && code.startsWith("shelf.");
}

/**
 * The bytes of a copy on the shelf. A copy whose file is gone from the disk is a refusal with a plain sentence (the row is on the shelf, the file
 * is not), not the system's text with the path in it; any other failure to read stays what it is.
 */
export function readShelfCopy(file: string): Buffer {
  try { return readFileSync(file); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw shelfErrors.missing_output("这份副本的文件已不在架子上，请重新放入");
    throw error;
  }
}
