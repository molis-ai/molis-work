import type { MemoryScope } from "./memory.js";

/** The fixed, authorized selection. It carries no source or memory body and no SDK receipt. */
export interface MemoryForgettingSelection {
  readonly selection_mode: "related" | "exact-identities";
  readonly operation_id: string;
  readonly actor_id: string;
  readonly scope: MemoryScope;
  readonly owner: string;
  readonly memories: readonly { readonly memory_id: string; readonly version: number }[];
  readonly candidates: readonly { readonly candidate_id: string; readonly version: number }[];
  readonly source_event_ids: readonly string[];
}

/** Acceptance is irreversible; the original SDK/ledger owners still confirm physical cleanup separately. */
export interface MemoryForgettingDecision extends MemoryForgettingSelection {
  readonly accepted_at: string;
}

export interface MemoryForgettingFacts {
  readonly format_version: /* @version format.memory.forgetting */ 1;
  readonly decisions: readonly MemoryForgettingDecision[];
}

/** Storage owns acceptance; callers must already have authorized and frozen the whole selection. */
export interface MemoryForgettingPort {
  read(): MemoryForgettingFacts;
  accept(selection: MemoryForgettingSelection): MemoryForgettingDecision;
}
