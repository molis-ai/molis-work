import type { ContractDescriptor } from "../platform/package.js";

export const modulesPptContract = {
  contractId: "io.molis.work.module.ppt.v1",
  kind: "module",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/SSOT-MATRIX.md",
} as const satisfies ContractDescriptor;

export const PPT_PLUGIN_ID = "io.molis.work.ppt";
export const PPT_PROJECT_PLUGIN_ID = "ppt";
export const PPT_ARTIFACT_TYPE_ID = "io.molis.work.ppt.deck";
export const PPT_ARTIFACT_SCHEMA_VERSION = 1;

export interface PptSlide {
  readonly id: string;
  readonly title: string;
  readonly bullets: readonly string[];
  readonly notes: string;
  readonly order: number;
}

export interface PptRecord {
  readonly id: string;
  readonly project_id: string;
  readonly title: string;
  readonly description: string;
  readonly color_primary: string;
  readonly color_background: string;
  readonly color_text: string;
  readonly slides: readonly PptSlide[];
  readonly created_at: string;
  readonly updated_at: string;
  readonly version: number;
  readonly artifact_id: string;
  readonly artifact_version: number;
}
