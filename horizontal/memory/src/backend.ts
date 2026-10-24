import type {
  AgentMemoryEntry, AgentMemoryCandidateEntry, AgentMemoryCapability, AgentMemoryCandidateCapability,
  AgentMemoryMutation, AgentMemoryChange, AgentMemoryMeta, AgentMemoryPageQuery, AgentMemoryPage,
  AgentMemoryPurgeQuery, AgentMemoryPurgePage,
  AgentMemoryDecisionReceipt, AgentMemoryScopePreview, AgentMemoryClearResult, AgentMemoryFormationInput, AgentMemoryFormationResult,
} from "@molis-ai/molis-work-contracts/services/agent-host";
import type { MemoryApproval, MemoryScope } from "@molis-ai/molis-work-contracts/services/memory";
import type { MemoryCaller } from "./service.js";

/** The SDK owns current contents and versions; Molis only translates its personal scope name. */
export type MemoryBackendEntry = Omit<AgentMemoryEntry, "scope" | "owner">;
export type MemoryBackendCandidate = Omit<AgentMemoryCandidateEntry, "scope" | "owner">;
type Scoped<T> = Omit<T, "scope"> & { scope: MemoryScope };
type Formal = { scope: MemoryScope; owner: string; memory_id: string } & AgentMemoryMutation;
type Candidate = { scope: MemoryScope; owner: string; candidate_id: string } & AgentMemoryMutation;
export type MemoryFormationInput = Omit<AgentMemoryFormationInput, "slots" | "context"> & {
  slots?: readonly Scoped<NonNullable<AgentMemoryFormationInput["slots"]>[number]>[];
  context?: { work_title?: string; replaying?: boolean;
    existing: readonly Scoped<NonNullable<AgentMemoryFormationInput["context"]>["existing"][number]>[];
    pending: readonly Scoped<NonNullable<AgentMemoryFormationInput["context"]>["pending"][number]>[] };
};
export interface MemoryBackendPort {
  withCaller(caller: MemoryCaller): MemoryBackendPort;
  list(scope: MemoryScope, owner: string): Promise<MemoryBackendEntry[]>;
  page(input: Scoped<AgentMemoryPageQuery>): Promise<Omit<AgentMemoryPage, "items"> & { items: MemoryBackendEntry[] }>;
  /** Returned identities retain the Runtime's user scope spelling. */
  previewPurge(input: Scoped<AgentMemoryPurgeQuery>): Promise<AgentMemoryPurgePage>;
  write(input: Scoped<Parameters<AgentMemoryCapability["write"]>[0]>): Promise<MemoryBackendEntry>;
  update(input: Formal & { change: AgentMemoryChange }): Promise<MemoryBackendEntry>;
  setMeta(input: Formal & { meta: AgentMemoryMeta }): Promise<MemoryBackendEntry>;
  pause(input: Formal & { reason: string }): Promise<MemoryBackendEntry>;
  disable(input: Formal & { reason: string }): Promise<MemoryBackendEntry>;
  resume(input: Formal): Promise<MemoryBackendEntry>;
  renew(input: Formal & { expires_at_ms: number }): Promise<MemoryBackendEntry>;
  previewMutation(input: Scoped<Parameters<AgentMemoryCapability["previewMutation"]>[0]>): Promise<void>;
  tombstone(input: Formal): Promise<MemoryBackendEntry>;
  remove(input: Formal): Promise<void>;
  candidates: MemoryCandidatePort;
  screen?(text: string): Promise<{ hold: boolean; reasons: string[]; redacted: string }>;
  previewScope(scope: MemoryScope, owner: string): Promise<AgentMemoryScopePreview>;
  clearScope(input: Scoped<Parameters<AgentMemoryCapability["clearScope"]>[0]>): Promise<AgentMemoryClearResult>;
}
export interface MemoryCandidatePort {
  form(input: MemoryFormationInput): Promise<AgentMemoryFormationResult>;
  propose(input: Scoped<Parameters<AgentMemoryCandidateCapability["propose"]>[0]>): Promise<MemoryBackendCandidate>;
  list(scope: MemoryScope, owner: string): Promise<MemoryBackendCandidate[]>;
  get(input: Scoped<Parameters<AgentMemoryCandidateCapability["get"]>[0]>): Promise<MemoryBackendCandidate | undefined>;
  accept(input: Candidate & { text?: string; origin?: string; meta?: AgentMemoryMeta }): Promise<MemoryBackendEntry>;
  promote(input: Candidate & { policy: string; version: number; origin?: string; meta?: AgentMemoryMeta }): Promise<MemoryBackendEntry>;
  settleInto(input: { scope: MemoryScope; owner: string; candidate_id: string; candidate_expected_version: number;
    operation_id: string; signal?: AbortSignal; target: { memory_id: string; expected_version: number; change: AgentMemoryChange }; by: MemoryApproval }): Promise<MemoryBackendEntry>;
  discard(input: Candidate): Promise<MemoryBackendCandidate>;
  expire(input: Candidate): Promise<MemoryBackendCandidate>;
  reconcileDecision(input: Candidate): Promise<AgentMemoryDecisionReceipt>;
  purge(input: Candidate): Promise<void>;
}
