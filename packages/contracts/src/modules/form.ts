import type { ContractDescriptor } from "../platform/package.js";

export const modulesFormContract = {
  contractId: "io.molis.work.module.form.v1",
  kind: "module",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/SSOT-MATRIX.md",
} as const satisfies ContractDescriptor;

export const FORM_PLUGIN_ID = "io.molis.work.form";
export const FORM_PROJECT_PLUGIN_ID = "form";
export const FORM_ARTIFACT_TYPE_ID = "io.molis.work.form.questionnaire";
export const FORM_ARTIFACT_SCHEMA_VERSION = 1;

export type FormQuestionType = "text" | "singleChoice" | "multiChoice" | "dropdown" | "rating" | "date";
export type FormStatus = "draft" | "published";

export interface FormOption {
  readonly id: string;
  readonly label: string;
}

export interface FormQuestion {
  readonly id: string;
  readonly type: FormQuestionType;
  readonly title: string;
  readonly required: boolean;
  readonly order: number;
  readonly options?: readonly FormOption[];
}

export type FormQuestionInput = Partial<Omit<FormQuestion, "options">> & { readonly options?: readonly Partial<FormOption>[] };

export interface FormRecord {
  readonly id: string;
  readonly project_id: string;
  readonly title: string;
  readonly description: string;
  readonly status: FormStatus;
  readonly share_id: string | null;
  readonly questions: readonly FormQuestion[];
  readonly created_at: string;
  readonly updated_at: string;
  readonly version: number;
  readonly artifact_id: string;
  readonly artifact_version: number;
  readonly publication_pending?: { readonly version: number; readonly source_version: number };
}

export interface FormSubmissionRecord {
  readonly id: string;
  readonly form_id: string;
  readonly answers: Readonly<Record<string, string>>;
  readonly submitted_at: string;
  readonly form_version: number | null;
  readonly questions: readonly FormQuestion[] | null;
}
