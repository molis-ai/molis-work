import type { ContractDescriptor } from "../platform/package.js";

export const modulesDatasetContract = {
  contractId: "io.molis.work.module.dataset.v1",
  kind: "module",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/SSOT-MATRIX.md",
} as const satisfies ContractDescriptor;

export const DATASET_PLUGIN_ID = "io.molis.work.dataset";
export const DATASET_PROJECT_PLUGIN_ID = "dataset";
export const DATASET_ARTIFACT_TYPE_ID = "io.molis.work.dataset.table";
export const DATASET_ARTIFACT_SCHEMA_VERSION = 1;

export type DatasetColumnType = "text" | "number" | "date";
export type DatasetStatus = "draft" | "ready";

export interface DatasetColumn {
  readonly id: string;
  readonly name: string;
  readonly type: DatasetColumnType;
  readonly order: number;
}

export interface DatasetRow {
  readonly id: string;
  readonly cells: Readonly<Record<string, string>>;
}

export type DatasetColumnInput = Partial<DatasetColumn>;
export type DatasetRowInput = Partial<DatasetRow>;

export interface DatasetRecord {
  readonly id: string;
  readonly project_id: string;
  readonly title: string;
  readonly description: string;
  readonly status: DatasetStatus;
  readonly columns: readonly DatasetColumn[];
  readonly rows: readonly DatasetRow[];
  readonly created_at: string;
  readonly updated_at: string;
  readonly version: number;
  readonly artifact_id: string;
  readonly artifact_version: number;
  readonly publication_pending?: { readonly version: number; readonly source_version: number };
}

export interface DatasetVersionRecord {
  readonly id: string;
  readonly dataset_id: string;
  readonly note: string;
  readonly snapshot: DatasetRecord;
  readonly created_at: string;
}
