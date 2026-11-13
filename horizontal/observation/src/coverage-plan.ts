import type { ObservationCoverageState, ObservationEntry } from "@molis-ai/molis-work-contracts/services/observation";

/** One kind of fact this build records, or says it does not yet, and why (contract-design §8). Reasons are text keys, never sentences. */
export interface CoveragePlanEntry {
  readonly owner: string;
  readonly fact: string;
  readonly entries: readonly ObservationEntry[];
  readonly state: Extract<ObservationCoverageState, "complete" | "not_connected" | "unavailable" | "not_applicable" | "by_rule">;
  readonly reason?: string;
}

/**
 * What this version connects (contract-design §8, OCL-08): batch 29's coverage page shows it next to what the register measured, and a test
 * checks it against the Host's real wiring. A kind of fact not here is not recorded by this build.
 */
export const OBSERVATION_COVERAGE_PLAN: readonly CoveragePlanEntry[] = [
  { owner: "service:gateway", fact: "action.call", entries: ["workbench", "cli", "mcp", "agent", "workflow", "plugin", "schedule", "host"], state: "complete" },
  { owner: "service:gateway", fact: "action.call.page_read_result", entries: ["workbench", "cli"], state: "by_rule", reason: "page_read_result_digest_only" },
  { owner: "service:gateway", fact: "action.call.read_timing", entries: ["workbench", "cli", "mcp", "agent", "workflow", "plugin"], state: "by_rule", reason: "reads_coalesced_per_minute" },
  { owner: "observation", fact: "observation.report", entries: ["workbench", "plugin"], state: "not_applicable", reason: "report_channel_itself" },
];
