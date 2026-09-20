import type { ContractDescriptor } from "../platform/package.js";

export const modulesFunctionsContract = {
  contractId: "io.molis.work.module.functions.v1",
  kind: "module",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/SSOT-MATRIX.md",
} as const satisfies ContractDescriptor;

export const FUNCTIONS_PLUGIN_ID = "io.molis.work.functions";
export const FUNCTIONS_PROJECT_PLUGIN_ID = "functions";
export const FUNCTIONS_CREDENTIAL_REF = "plugin:io.molis.work.functions:typesafe";
export const FUNCTIONS_DEFAULT_MODEL = "jev-latest";

export type FunctionsPrimitive = "choice";
export type FunctionStatus = "draft" | "published";
export type FunctionsCredentialSource = "ui" | "env" | "none";
export type FunctionsPreviewOutcome = "selected" | "needs_review";

export interface ChoiceCriterion {
  readonly key: string;
  readonly description: string;
}

export interface FunctionsPreviewRecord {
  readonly input: string;
  readonly outcome: FunctionsPreviewOutcome;
  readonly choice: string | null;
  readonly probabilities: Readonly<Record<string, number>>;
  readonly confidence: number | null;
  readonly model: string;
  readonly config_hash: string;
  readonly at: string;
}

export interface FunctionRecord {
  readonly id: string;
  readonly name: string;
  readonly function_key: string;
  readonly primitive: FunctionsPrimitive;
  readonly status: FunctionStatus;
  readonly version: number | null;
  readonly model: string;
  readonly instructions: string;
  readonly criteria: readonly ChoiceCriterion[];
  readonly config_hash: string;
  readonly last_preview: FunctionsPreviewRecord | null;
  readonly published_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface FunctionDraftPatch {
  readonly name?: string;
  readonly function_key?: string;
  readonly instructions?: string;
  readonly criteria?: readonly ChoiceCriterion[];
}

export interface FunctionsSettingsStatus {
  readonly has_credential: boolean;
  readonly source: FunctionsCredentialSource;
}
