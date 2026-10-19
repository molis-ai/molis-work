import { createHash } from "node:crypto";
import type { PagesStore } from "./store.js";

type NewDocument = Parameters<PagesStore["create"]>[0];

/**
 * The one way `pages.create` writes a document. With a `request_id` the same request makes one document: a retry returns it as it is
 * now, and other content under the same request is refused. That is the import ledger (`page_imports`) the import dialog already
 * keeps, so a request id here shares its namespace; nothing is added to the store.
 */
export function createPagesDocument(store: PagesStore, fields: NewDocument, requestId: string | undefined): ReturnType<PagesStore["create"]> {
  if (requestId === undefined) return store.create(fields);
  const { project_id, folder_id, ...document } = fields;
  const request_hash = createHash("sha256").update(JSON.stringify(fields)).digest("hex");
  return store.importDocuments({ project_id, request_id: requestId, request_hash, ...(folder_id === undefined ? {} : { folder_id }), documents: [document] })[0]!;
}
