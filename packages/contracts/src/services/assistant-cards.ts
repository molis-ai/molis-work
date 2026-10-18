import type { ActionResultPresentation } from "../platform/action-result.js";

/** An action a page prepared from what the person selected, for a card (see `AssistantPluginMessage.card`). */
export interface AssistantPreparedCard {
  title: string;
  summary: string;
  reference: { capability_id: string; version: number; provider_id: string };
  input: unknown;
  editable?: string[];
  missing?: Array<{ field: string; question: string }>;
  /** Where the selection came from (e.g. the Pages document and its version): the work's origin, apart from the object the action targets. */
  source_object?: { kind: string; id: string; version?: number | string | null; title?: string };
  /** The selected text, kept as the work's material for later rounds (at most 4, each at most 20000 characters). */
  materials?: Array<{ title: string; text: string }>;
}

/**
 * A suggestion the person can run with one click. It carries the exact capability and prepared input; the click is
 * their choice of exactly what the card shows, and it runs at most once.
 */
export interface AssistantCard {
  card_id: string;
  revision: number;
  /** Which round proposed it. */
  run_id: string | null;
  title: string;
  summary: string;
  provider: string;
  capability_title: string;
  /** So the surface that owns the data can refresh once it has run. */
  capability_id: string;
  effect: "read" | "write" | "irreversible";
  /** The prepared input, field by field as the person reads it; `editable` ones can be changed before running. */
  /** `options`: the choices of a field that has them (the value sent is `raw`; `value` is its label). */
  /** `input`: a day or a moment, picked rather than typed (`raw` is the stored value; a moment is sent as an exact instant). */
  fields: Array<{ key: string; label: string; value: string; editable: boolean; raw?: string; options?: Array<{ value: string; label: string }>; input?: "date" | "datetime" }>;
  missing: Array<{ field: string; question: string }>;
  status: "ready" | "needs-input" | "running" | "done" | "failed" | "unknown" | "stale" | "dismissed";
  /** What happened, or why not, in the owner's words. */
  outcome?: string;
  /** The original successful action's bounded result view, kept with this card. */
  presentation?: ActionResultPresentation;
  /** A card a page prepared (not the Assistant's own suggestion): which page, and what the selection came from. */
  from?: { surface: string; title?: string };
  source_object?: { kind: string; id: string; version?: number | string | null; title?: string };
  created_at: string;
  updated_at: string;
}
