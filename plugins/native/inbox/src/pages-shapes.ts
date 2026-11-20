// What Inbox declares of a document-generation provider discovered by role (`DOCUMENT_GENERATION_ROLES`, Audit #10).
// Inbox does not pin a provider ID or import Pages' contract or package (PG-111).

/** Exact material adopted for one draft; its source stays with its owner. */
export interface InboxPagesInputSnapshot {
  readonly entry_id: string;
  readonly item_id: string;
  readonly revision: number;
  readonly title: string;
  readonly body: string;
  readonly url: string | null;
  readonly source_label: string;
  readonly captured_at: string;
  readonly provenance: readonly Record<string, unknown>[];
}

export interface InboxPagesGeneration {
  readonly request_id: string;
  readonly project_id: string;
  readonly request_hash: string;
  readonly status: "running" | "failed" | "completed";
  readonly document_id: string | null;
  readonly inputs: readonly InboxPagesInputSnapshot[];
  readonly instructions: string;
  readonly title: string;
  readonly error: string | null;
  readonly updated_at: string;
}

/** A Pages document as `pages.get` returns it; the body is ProseMirror JSON that Inbox passes on without reading into it. */
export interface InboxPagesDocument {
  readonly id: string;
  readonly project_id: string;
  readonly title: string;
  readonly body: { readonly type: "doc"; readonly content?: readonly unknown[] };
  readonly folder_id: string;
  readonly starred: boolean;
  readonly goal_id: string;
  readonly artifact_id: string;
  readonly artifact_version: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly version: number;
}
