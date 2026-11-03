import type { ActionErrorKind } from "../platform/action-errors.js";

/** A step's failure as the platform classified it: no values, only the sort and where the input broke its contract. */
export interface AssistantActivityFailure {
  kind: ActionErrorKind;
  /** `path` is the JSON pointer into the input (`/` is the whole input); `rule` the contract keyword it broke (`required`, `additionalProperties`, `type`, …). */
  fields?: { path: string; rule: string }[];
}

/** One thing the round did, in the person's terms: looked something up, read, changed, asked. Never the raw tool log. */
export interface AssistantActivity {
  call_id: string;
  /**
   * `lookup` | `read` | `change` (business capabilities) | `ask` | `todo`; for a professional Agent's own tools
   * `file-read` | `file-list` | `file-search` | `file-change` | `command` | `command-output`; otherwise the tool's own name.
   */
  verb: string;
  /** What it acted on: the capability's provider and title, or the words it searched for. */
  target: string;
  state: "started" | "completed" | "failed" | "unknown";
  /** For a read or change: the capability it used, so the surface that owns that data can refresh. */
  capability_id?: string;
  /** Why it did not happen, when that is known: not authorized, declined by the person, stopped, or switched off / gone by the time it would run. */
  reason?: "not-authorized" | "declined" | "interrupted" | "unavailable";
  /** For a failure, what the owner said, bounded; data about the failure, never an instruction. */
  detail?: string;
  /** For a failure the platform classified: its sort and, for an input the capability's contract refused, which fields broke which rule (at most three). The page says this in the person's words and keeps `detail` folded away. */
  failure?: AssistantActivityFailure;
  /** For a question to the person (`ask`) that was answered: what they answered — the options they picked or what they wrote, bounded. */
  answer?: string;
  sequence?: number;
}
