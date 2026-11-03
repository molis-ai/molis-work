import type { AgentMemoryCaller, AgentMemoryEntry, AgentMemoryMeta, AgentMemorySourceRef, AgentMemorySourceSnapshot } from "./agent-host-memory.js";

/** A finite App-owned destination. The model selects its ID, never its identity or replacement version. */
export interface AgentMemoryFormationSlot {
  id: string;
  scope: AgentMemoryEntry["scope"];
  owner: string;
  origin: string;
  meta: Pick<AgentMemoryMeta, "kind" | "classification" | "namespace" | "session_ref" | "expires_at_ms" | "applies_when" | "source">;
  replacement?: { memory_id: string; expected_version: number };
}
/** One currently authorized learning snapshot, carried only in this call; it is not a source or an authorization grant. */
export interface AgentMemoryFormationContext {
  /** Existing operation identity; only used by deterministic filtering, never sent to the model. */
  replaying?: boolean;
  work_title?: string;
  existing: readonly { memory_id: string; version: number; scope: AgentMemoryEntry["scope"]; kind: string; text: string }[];
  pending: readonly { candidate_id: string; version: number; scope: AgentMemoryEntry["scope"]; kind: string; text: string; work_title?: string | null;
    /** Current explicit extraction evidence only; these fields are not model context. */
    sources?: readonly AgentMemorySourceRef[]; applies?: AgentMemoryMeta["applies_when"] }[];
}
export interface AgentMemoryFormationInput {
  operation_id: string;
  trigger: "none" | "explicit" | "run-end" | "session-end" | "app-scheduled";
  sources?: readonly AgentMemorySourceRef[];
  slots?: readonly AgentMemoryFormationSlot[];
  context?: AgentMemoryFormationContext;
  /** Revalidate this call's fixed authorized context immediately before dispatch. In-process only: never persist or send to the model. `none` never calls it. */
  validate_context?(): Promise<void>;
  signal?: AbortSignal;
}
/** Missing directions are unknown, not zero. Calls count SDK extractor invocations, not Provider attempts. */
export interface AgentMemoryExtractionUsage { input_tokens?: number; output_tokens?: number; cached_input_tokens?: number }
export interface AgentMemoryFormationResult {
  operation_id: string;
  outcome: "skipped" | "completed" | "partial" | "failed" | "cancelled" | "timeout" | "unavailable";
  items: readonly { slot_id: string; outcome: "created" | "replayed" | "rejected" | "unknown";
    candidate?: { candidate_id: string; version: number }; code?: string }[];
  extraction: { calls: number; usage?: AgentMemoryExtractionUsage };
  code?: string;
}
/** Proposed text only. Suggested basis is never approved formal metadata. */
export interface AgentMemoryExtractionDraft {
  slot_id: string;
  text: string;
  applies_when?: { task: string };
  suggested_basis?: "explicit" | "inferred";
  evidence: readonly { source: AgentMemorySourceRef; quote: string }[];
}
export interface AgentMemoryExtractionRequest {
  operation_id: string;
  trigger: Exclude<AgentMemoryFormationInput["trigger"], "none">;
  sources: readonly AgentMemorySourceSnapshot[];
  slots: readonly AgentMemoryFormationSlot[];
  context?: AgentMemoryFormationContext;
  limits: { max_sources: number; max_slots: number; max_drafts: number; max_source_chars: number; max_draft_chars: number; timeout_ms: number };
  signal: AbortSignal;
  /** Recheck the original invocation immediately before the actual model dispatch. */
  before_dispatch(): Promise<void>;
}
export interface AgentMemoryExtractor {
  extract(caller: AgentMemoryCaller, input: AgentMemoryExtractionRequest): Promise<{
    drafts: readonly AgentMemoryExtractionDraft[]; usage?: AgentMemoryExtractionUsage;
  }>;
}
