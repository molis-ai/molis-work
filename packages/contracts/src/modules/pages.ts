import type { ContractDescriptor } from "../platform/package.js";

export const modulesPagesContract = {
  contractId: "io.molis.work.module.pages.v1",
  kind: "module",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/SSOT-MATRIX.md",
} as const satisfies ContractDescriptor;

export const PAGES_PLUGIN_ID = "io.molis.work.pages";
export const PAGES_PROJECT_PLUGIN_ID = "pages";
export const PAGES_ARTIFACT_TYPE_ID = "io.molis.work.pages.document";
export const PAGES_ARTIFACT_SCHEMA_VERSION = 1;

/** ProseMirror document JSON. The plugin store does not interpret node types. */
export interface PagesBody {
  readonly type: "doc";
  readonly content?: readonly unknown[];
}

export interface PagesFolder {
  readonly id: string;
  readonly project_id: string;
  readonly title: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface PagesRecord {
  readonly id: string;
  readonly project_id: string;
  readonly title: string;
  readonly body: PagesBody;
  readonly folder_id: string;
  readonly starred: boolean;
  readonly goal_id: string;
  readonly artifact_id: string;
  readonly artifact_version: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly version: number;
}

/** Exact material adopted for one local draft; source truth remains with its owner. */
export interface PagesInputSnapshot {
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

export interface PagesGenerationRecord {
  readonly request_id: string;
  readonly project_id: string;
  readonly request_hash: string;
  readonly status: "running" | "failed" | "completed";
  readonly document_id: string | null;
  readonly inputs: readonly PagesInputSnapshot[];
  readonly instructions: string;
  readonly title: string;
  readonly error: string | null;
  readonly updated_at: string;
}
