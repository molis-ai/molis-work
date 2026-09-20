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
export const FUNCTIONS_MAX_SAMPLES = 8;

export type FunctionsPrimitive = "noul" | "choice" | "score";
export type FunctionStatus = "draft" | "published";
export type FunctionsCredentialSource = "ui" | "env" | "none";
export type FunctionsOutcome = "ok" | "needs_review";

export interface ChoiceCriterion {
  readonly key: string;
  readonly description: string;
}

export interface NoulCriteria {
  readonly true_description: string;
  readonly false_description: string;
}

export type ScoreCriteria = readonly string[];

export type FunctionCriteria = readonly ChoiceCriterion[] | NoulCriteria | ScoreCriteria;

export interface FunctionSample {
  readonly id: string;
  readonly label: string;
  readonly input: string;
}

export interface FunctionsPreviewRecord {
  readonly input: string;
  readonly outcome: FunctionsOutcome;
  readonly primitive: FunctionsPrimitive;
  readonly choice: string | null;
  readonly noul: number | null;
  readonly score: number | null;
  readonly legend: readonly string[] | null;
  readonly probabilities: Readonly<Record<string, number>>;
  readonly confidence: number | null;
  readonly model: string;
  readonly config_hash: string;
  readonly at: string;
}

interface FunctionRecordBase {
  readonly id: string;
  readonly name: string;
  readonly function_key: string;
  readonly status: FunctionStatus;
  readonly version: number | null;
  readonly model: string;
  readonly instructions: string;
  readonly config_hash: string;
  readonly last_preview: FunctionsPreviewRecord | null;
  readonly samples: readonly FunctionSample[];
  readonly published_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export type FunctionRecord =
  | (FunctionRecordBase & { readonly primitive: "choice"; readonly criteria: readonly ChoiceCriterion[] })
  | (FunctionRecordBase & { readonly primitive: "noul"; readonly criteria: NoulCriteria })
  | (FunctionRecordBase & { readonly primitive: "score"; readonly criteria: ScoreCriteria });

export interface FunctionDraftPatch {
  readonly name?: string;
  readonly function_key?: string;
  readonly instructions?: string;
  readonly criteria?: FunctionCriteria;
}

export interface FunctionSummary {
  readonly function_key: string;
  readonly name: string;
  readonly primitive: FunctionsPrimitive;
  readonly version: number;
  readonly model: string;
}

export interface FunctionDescribe extends FunctionSummary {
  readonly instructions: string;
  readonly input: { readonly content: "string" };
  readonly criteria: FunctionCriteria;
}

export interface FunctionInvokeResult {
  readonly status: FunctionsOutcome;
  readonly function_key: string;
  readonly version: number;
  readonly model: string;
  readonly config_hash: string;
  readonly primitive: FunctionsPrimitive;
  readonly data: {
    readonly choice?: string | null;
    readonly noul?: number;
    readonly score?: number;
    readonly legend?: readonly string[];
  };
  readonly probabilities: Readonly<Record<string, number>>;
  readonly confidence: number | null;
}

export interface FunctionsSettingsStatus {
  readonly has_credential: boolean;
  readonly source: FunctionsCredentialSource;
}
