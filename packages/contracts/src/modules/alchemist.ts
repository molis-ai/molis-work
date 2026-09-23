import type { ContractDescriptor } from "../platform/package.js";

export const modulesAlchemistContract = {
  contractId: "io.molis.work.module.alchemist.v1",
  kind: "module",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/SSOT-MATRIX.md",
} as const satisfies ContractDescriptor;

export const ALCHEMIST_PLUGIN_ID = "io.molis.work.alchemist";
export const ALCHEMIST_PROJECT_PLUGIN_ID = "alchemist";

export type AlchemistCardOrigin = "demo";
export type AlchemistCardStatus = "candidate" | "kept" | "discarded";
export type AlchemistDecisionChoice = "build" | "hold" | "drop";

export interface AlchemistDirection {
  readonly id: string;
  readonly project_id: string;
  readonly title: string;
  readonly description: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface AlchemistDirectionSummary extends AlchemistDirection {
  readonly card_count: number;
  readonly kept_count: number;
  readonly decision_count: number;
}

export interface AlchemistCard {
  readonly id: string;
  readonly direction_id: string;
  readonly project_id: string;
  readonly origin: AlchemistCardOrigin;
  readonly status: AlchemistCardStatus;
  readonly title: string;
  readonly highlight: string;
  readonly target_user: string;
  readonly scenario: string;
  readonly core_problem: string;
  readonly core_mechanism: string;
  readonly value_proposition: string;
  readonly why_it_may_work: string;
  readonly assumptions: readonly string[];
  readonly unknowns: readonly string[];
  readonly mvp_in: readonly string[];
  readonly mvp_out: readonly string[];
  readonly created_at: string;
  readonly updated_at: string;
}

export interface AlchemistDecision {
  readonly id: string;
  readonly card_id: string;
  readonly project_id: string;
  readonly choice: AlchemistDecisionChoice;
  readonly reason: string;
  readonly created_at: string;
  readonly updated_at: string;
}
