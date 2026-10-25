import type { PagePorts } from "./types.js";

/** The other end of a delegation or message: a session. */
export interface Side { readonly session_id: string; readonly title?: string; readonly state?: string }

export interface Delivery {
  readonly delivery_id: string;
  readonly state: string;
  readonly kind: string;
  readonly run_id: string;
  readonly title: string;
  readonly note?: string;
  readonly reason?: string;
  readonly sent_at: number;
  readonly decided_at?: number;
  readonly artifact?: { readonly artifact_id: string };
}

export interface Receipt { readonly event: string; readonly at: number; readonly note?: string; readonly recorded_only?: boolean }

/** Work one session handed to another, as `GET /sessions/<id>/delegations` lists it. */
export interface Delegation {
  readonly delegation_id: string;
  readonly revision: number;
  readonly title: string;
  readonly state: string;
  readonly state_label: string;
  readonly task: string;
  readonly from?: Side;
  readonly to?: Side;
  readonly to_session?: string;
  readonly deliveries: readonly Delivery[];
  readonly receipts: readonly Receipt[];
}

export interface Delegations {
  readonly outgoing: readonly Delegation[];
  readonly incoming: Delegation | null;
  readonly related: readonly (Side & { readonly relation: readonly string[] })[];
}

/** A message between sessions. */
export interface Mail {
  readonly message_id: string;
  readonly kind: string;
  readonly state: string;
  readonly outgoing: boolean;
  readonly await_reply?: boolean;
  readonly peer?: Side | null;
  readonly to_title?: string;
  readonly from_title?: string;
  readonly sent_at_ms: number;
  readonly body: string;
  readonly history?: readonly { readonly event: string }[];
}

/** A command a round left running in the background. */
export interface BackgroundTask {
  readonly task_id: string;
  readonly state: string;
  readonly summary: string;
  readonly exit_code?: number;
  readonly started_at_ms: number;
  readonly ended_at_ms?: number;
}

export interface RoundLine { readonly run_id: string; readonly number: number; readonly phase: string }

export interface CooperationPorts extends Pick<PagePorts, "lifetime" | "translate" | "q" | "api" | "current" | "status"> {
  readonly openSession: (id: string, title: string) => unknown;
  readonly refreshSessions: () => Promise<unknown>;
  readonly rounds: () => readonly RoundLine[];
  /** Puts the task in the composer. */
  readonly prefill: (text: string) => void;
  /** A taken delivery was attached to the session's materials: the page's selection follows. */
  readonly materialsChanged: () => Promise<void>;
  readonly openArtifact?: (reference: { readonly artifact_id: string }, title: string) => void;
}

export interface CooperationClient {
  refresh(force?: boolean): Promise<void>;
  openDialog(): Promise<void>;
  /** Clears everything it drew (another session is on show). */
  reset(): void;
}

/** What the cooperation panels share: the places they draw into, what was read, and how to read again. */
export interface Coop {
  readonly ports: CooperationPorts;
  readonly banner: HTMLElement;
  readonly section: HTMLElement;
  readonly backgroundSection: HTMLElement;
  mail: readonly Mail[];
  commands: readonly BackgroundTask[];
  backgroundUnknown: boolean;
  /** Reads everything again and draws it. */
  readonly again: () => Promise<void>;
}
