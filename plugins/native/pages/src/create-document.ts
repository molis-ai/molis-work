import { createHash } from "node:crypto";
import type { PagesRecord } from "./contract.js";
import type { PagesStore } from "./store.js";

type NewDocument = Parameters<PagesStore["create"]>[0];

/** What `pages.create` answers: the document, and the version this call made it at only when this call made it. */
export interface CreatedPagesDocument {
  readonly document: PagesRecord;
  /** Absent when the request had already made the document: this call made nothing, so it has nothing to take back. */
  readonly created_version?: number;
}

/**
 * The one way `pages.create` writes a document. With a `request_id` the same request makes one document: a retry returns it as it is
 * now, and other content under the same request is refused. That is the import ledger (`page_imports`) the import dialog already
 * keeps, so a request id here shares its namespace; nothing is added to the store, which only says the request in its own words.
 *
 * `created_version` is what the undo reads (`expected_version`): a retry returns the document as it is now, possibly edited since,
 * and an undo taken from that answer would delete the edits, so a retry carries none and offers no undo.
 */
export function createPagesDocument(store: PagesStore, fields: NewDocument, requestId: string | undefined): CreatedPagesDocument {
  if (requestId === undefined) {
    const document = store.create(fields);
    return { document, created_version: document.version };
  }
  const { project_id, folder_id, ...document } = fields;
  const request_hash = createHash("sha256").update(JSON.stringify(fields)).digest("hex");
  let replayed = false;
  const replay = { changed: "同一个请求的内容已改变，请重新发起", removed: "这个请求已完成，但其中的文档已被删除；不会重新创建", onReplay: () => { replayed = true; } };
  const [made] = store.importDocuments({ project_id, request_id: requestId, request_hash, ...(folder_id === undefined ? {} : { folder_id }), documents: [document], replay });
  return replayed ? { document: made! } : { document: made!, created_version: made!.version };
}
