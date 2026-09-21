import type { ContractDescriptor } from "../platform/package.js";

export const modulesLingguangContract = {
  contractId: "io.molis.work.module.lingguang.v1",
  kind: "module",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/SSOT-MATRIX.md",
} as const satisfies ContractDescriptor;

export const LINGGUANG_PLUGIN_ID = "io.molis.work.lingguang";
export const LINGGUANG_PROJECT_PLUGIN_ID = "lingguang";

export type LingguangSourceKind = "manual";
export type LingguangStatus = "inbox" | "discarded";
export type LingguangMessageRole = "user" | "stub";

export interface LingguangSpark {
  readonly id: string;
  readonly project_id: string;
  readonly title: string;
  readonly body: string;
  readonly source_kind: LingguangSourceKind;
  readonly status: LingguangStatus;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface LingguangConversation {
  readonly id: string;
  readonly project_id: string;
  readonly spark_ids: readonly string[];
  readonly created_at: string;
  readonly updated_at: string;
}

export interface LingguangMessage {
  readonly id: string;
  readonly conversation_id: string;
  readonly role: LingguangMessageRole;
  readonly body: string;
  readonly created_at: string;
}
