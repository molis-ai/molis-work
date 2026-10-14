/**
 * The shape of a recording. Every field is something the SDK reported while the recorder drove it through its public
 * entry; the preview reads these files and derives nothing of its own beyond wording (headline.ts, model.ts).
 */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface Ledger { readonly type: string; readonly [key: string]: Json | undefined }

/** One receipt as `projectInputReceipts` returns it (SDK S1–S3 fields). */
export interface Receipt {
  readonly steerId: string;
  readonly text: string;
  readonly source: "person" | "app" | "peer";
  readonly atMs: number;
  readonly key?: string;
  readonly about?: string;
  readonly state: "accepted" | "applied" | "read" | "withdrawn" | "unread";
  readonly applied: boolean;
  readonly readBy?: string;
  readonly endedBy?: { readonly state: string; readonly code?: string };
  readonly carried?: { readonly from?: string };
  readonly handling?: {
    readonly treatment: string;
    readonly kind?: string;
    readonly targets: readonly { readonly kind: string; readonly id: string }[];
    readonly impacts: readonly string[];
    readonly note?: string;
    readonly callId?: string;
    readonly toolCallId?: string;
  };
  readonly handlingRevisions?: number;
}

/** The SDK's answer after the first `at` events of a run, written down only where it changed. */
export interface Projection { readonly at: number; readonly receipts: readonly Receipt[] }

export interface RecordedRun {
  readonly label: string;
  readonly events: readonly Ledger[];
  readonly projections: readonly Projection[];
}

export interface QueuedItem {
  readonly inputId: string;
  readonly text: string;
  readonly source: string;
  readonly atMs: number;
  readonly from?: { readonly run: string; readonly applied: boolean; readonly endedBy: { readonly state: string; readonly code?: string } };
}
/** `session.inputQueue()` as the SDK returned it. */
export interface QueueView {
  readonly carry: string;
  readonly queued: readonly QueuedItem[];
  readonly settled: readonly { readonly inputId: string; readonly outcome: "carried" | "withdrawn"; readonly run?: string; readonly atMs: number }[];
}

/** A point a scene can rest at: the first `at` events of run `run`, plus the queue the SDK reported there. */
export interface Checkpoint {
  readonly id: string;
  readonly label: string;
  readonly run: number;
  readonly at: number;
  readonly queue?: QueueView;
  /** Ids of the pending question the SDK reported open at this point, if any. */
  readonly awaiting?: boolean;
}

export interface Scene {
  readonly id: string;
  readonly label: string;
  readonly runs: readonly RecordedRun[];
  readonly checkpoints: readonly Checkpoint[];
}

export interface Recording {
  readonly source: { readonly prologue: string; readonly dirty: boolean; readonly recordedAt: string; readonly script: string };
  readonly flavor: "coding" | "assistant";
  readonly scenes: readonly Scene[];
}
