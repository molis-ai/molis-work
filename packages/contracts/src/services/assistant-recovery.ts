// One of the Assistant's types, kept in its own file so `services/assistant.ts` stays under the size limit. Read through
// `services/assistant`, which re-exports it; this file is not a subpath of its own.

/** An interrupted round, as the runtime's own receipts show it: what happened, what did not, what is unknown. */
export interface AssistantRecovery {
  blockers: string[];
  rounds: Array<{
    run_id: string;
    version: number;
    can_close: boolean;
    blockers: string[];
    operations: Array<{ summary: string; outcome: "completed" | "failed" | "not-dispatched" | "unknown" }>;
  }>;
}
