/**
 * Memory and documents through the Agent Host's runtime: part of the `services/agent-host` contract (re-exported there),
 * declared in their own file.
 */

/** One remembered item in the runtime's memory store (Prologue Memory), in one scope and owner. */
export interface AgentMemoryEntry {
  memory_id: string;
  scope: "user" | "project" | "character";
  owner: string;
  text: string;
  /** Where it came from, as recorded when it was written. */
  origin: string;
  tags: string[];
  version: number;
  /** Bounded structured facts kept on the entry (Prologue validates the shape and size). */
  meta: AgentMemoryMeta;
  /** Kept but never recalled (switched off, or what it rests on is gone). */
  paused?: { reason: string; at_ms: number };
  /** 0 for entries written before the runtime kept times. */
  created_at_ms: number;
  updated_at_ms: number;
}

/** What the platform memory keeps on an entry. Text is not repeated here. */
export interface AgentMemoryMeta {
  kind?: string;
  source?: string;
  basis?: "explicit" | "repeated" | "inferred";
  applies_when?: { plugins?: string[]; object_kinds?: string[]; goals?: string[]; task?: string; from_ms?: number; until_ms?: number };
  evidence?: Array<{ kind: string; text?: string; ref?: string; at_ms?: number }>;
  expires_at_ms?: number;
  /** Who approved it: the person, or a Host policy at a version. Candidates settle this themselves. */
  approved_by?: { by: "person" } | { by: "policy"; policy: string; version: number };
  /** A plugin's own memory. */
  namespace?: string;
}

/** A candidate waiting for the person (Prologue's persistent candidate box). */
export interface AgentMemoryCandidateEntry {
  candidate_id: string;
  scope: AgentMemoryEntry["scope"];
  owner: string;
  text: string;
  origin: string;
  tags: string[];
  meta: AgentMemoryMeta;
  state: "pending" | "accepted" | "promoted" | "discarded" | "expired";
  created_at_ms: number;
  settled_at_ms?: number;
  memory_id?: string;
}

/** A memory the Host chose for one run, by the Prologue scope and owner it lives in. */
export interface AgentPinnedMemory { scope: "user" | "project" | "character"; owner: string; memory_id: string }

/** What the Host recalled for a run: the Runtime re-reads each at start and injects it as data (specs/archive/memory-system §7.2). */
export interface AgentRecalledMemory {
  pinned: AgentPinnedMemory[];
  budget_chars: number;
  /** The Host's own receipt for this choice, so it can reconcile with what the run really took. */
  receipt_id?: string;
}

/** What a run really took from memory, from the Runtime's own event: references and versions only. */
export interface AgentMemoryRecallFact {
  method: "pinned" | "recall";
  injected: Array<{ memory_id: string; version: number }>;
  omitted: Array<{ memory_id: string; version: number }>;
  /** Named, but deleted, paused or expired by the time the run started. */
  unavailable: string[];
}

/** A document parser the App supplies to the runtime (the SDK ships none): bounded text, or a failure — never empty text. */
export interface AgentDocumentParser {
  mediaTypes: readonly string[];
  parse(input: { bytes: Uint8Array; mediaType: string; maxChars: number }): Promise<{ text: string; pages?: number }>;
}

/** Documents the person brings, read through the runtime's own resources and parsers (Prologue `parseResource`). */
export interface AgentDocumentCapability {
  parse(input: { bytes: Uint8Array; name: string }): Promise<{ text: string; truncated: boolean; pages?: number }>;
  /**
   * An image taken in by the runtime (PNG, JPEG, GIF or WebP, recognised by its bytes) so a Run can show it to the
   * model. The reference holds while this runtime process lives.
   */
  intakeImage?(input: { bytes: Uint8Array; name: string }): Promise<{ resource: { id: string; revision: number }; media_type: string; byte_length: number }>;
  /** An image taken in earlier, read back for the person to look at again; null once this runtime no longer holds it. */
  readImage?(resource: { id: string; revision: number }): Promise<Uint8Array | null>;
}

/** Trusted per-call control, retained through each SDK storage commit. Never persisted or model input. */
export interface AgentMemoryExecutionControl {
  beforeEffect(): void | Promise<void>;
  assert_current(): void;
}

/** Prologue Memory through the Host: each call names its scope and owner; the store keeps them apart. */
export interface AgentMemoryCapability {
  /** Per-invocation facade; SDK preparation waits retain the same final authority check. */
  withExecution?(control: AgentMemoryExecutionControl): AgentMemoryCapability;
  list(scope: AgentMemoryEntry["scope"], owner: string): Promise<AgentMemoryEntry[]>;
  write(input: { scope: AgentMemoryEntry["scope"]; owner: string; text: string; origin: string; tags?: string[]; meta?: AgentMemoryMeta }): Promise<AgentMemoryEntry>;
  update(input: { scope: AgentMemoryEntry["scope"]; owner: string; memory_id: string; text: string }): Promise<AgentMemoryEntry>;
  /** Replaces the structured facts; the text and its version stay. */
  setMeta?(input: { scope: AgentMemoryEntry["scope"]; owner: string; memory_id: string; meta: AgentMemoryMeta }): Promise<AgentMemoryEntry>;
  /** Kept but not recalled until resumed. */
  pause?(input: { scope: AgentMemoryEntry["scope"]; owner: string; memory_id: string; reason: string }): Promise<AgentMemoryEntry>;
  resume?(input: { scope: AgentMemoryEntry["scope"]; owner: string; memory_id: string }): Promise<AgentMemoryEntry>;
  /** Removed for good: purged from the store, never recalled again. */
  remove(input: { scope: AgentMemoryEntry["scope"]; owner: string; memory_id: string }): Promise<boolean>;
  /** `text`: the runtime splits it (Chinese two-character pieces); paused and expired entries never come back. */
  recall(input: { scope: AgentMemoryEntry["scope"]; owner: string; keywords?: string[]; text?: string; kinds?: string[]; limit?: number }): Promise<Array<{ entry: AgentMemoryEntry; score: number }>>;
  /** The runtime's persistent, scoped candidate box: accept (the person) and promote (a Host policy) write through the one entry. */
  candidates?: AgentMemoryCandidateCapability;
  /**
   * Prologue's own screening of text about to become memory: `hold` when it reads like instructions to the model
   * (`screenInbound`), and the text with credentials and absolute paths taken out (`redactText`).
   */
  screen?(text: string): Promise<{ hold: boolean; reasons: string[]; redacted: string }>;
  /** Clearing a whole scope, step one: how many, and the fingerprint the confirmation must bring back. */
  previewScope?(scope: AgentMemoryEntry["scope"], owner: string): Promise<{ count: number; fingerprint: string; memory_ids: string[] }>;
  /** Step two: refused when anything changed since the preview; otherwise every entry is purged. */
  clearScope?(input: { scope: AgentMemoryEntry["scope"]; owner: string; fingerprint: string }): Promise<string[]>;
}

export interface AgentMemoryCandidateCapability {
  propose(input: { scope: AgentMemoryEntry["scope"]; owner: string; text: string; origin: string; tags?: string[]; meta?: AgentMemoryMeta }): Promise<AgentMemoryCandidateEntry>;
  list(scope: AgentMemoryEntry["scope"], owner: string): Promise<AgentMemoryCandidateEntry[]>;
  /** The person accepts: the entry records them as its approver. `origin` / `meta`: what the App writes on the entry now. */
  accept(input: { scope: AgentMemoryEntry["scope"]; owner: string; candidate_id: string; text?: string; origin?: string; meta?: AgentMemoryMeta }): Promise<AgentMemoryEntry>;
  /** A Host policy promotes: the entry records the policy and its version as its approver. */
  promote(input: { scope: AgentMemoryEntry["scope"]; owner: string; candidate_id: string; policy: string; version: number; origin?: string; meta?: AgentMemoryMeta }): Promise<AgentMemoryEntry>;
  /** The candidate corrected an existing entry, whose text the Host already updated: settle it into that entry. */
  settleInto(input: { scope: AgentMemoryEntry["scope"]; owner: string; candidate_id: string; memory_id: string;
    by: { by: "person" } | { by: "policy"; policy: string; version: number } }): Promise<AgentMemoryEntry>;
  discard(input: { scope: AgentMemoryEntry["scope"]; owner: string; candidate_id: string }): Promise<AgentMemoryCandidateEntry>;
  expire(input: { scope: AgentMemoryEntry["scope"]; owner: string; candidate_id: string }): Promise<AgentMemoryCandidateEntry>;
  purge(input: { scope: AgentMemoryEntry["scope"]; owner: string; candidate_id: string }): Promise<void>;
}
