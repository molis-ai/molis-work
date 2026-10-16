// A suggestion to the person, as the model makes it and as a Run records it. Read through `services/agent-host`.
import type { ExactActionReference } from "../platform/actions.js";

/**
 * An action the model proposes for the person to run with one click: the exact capability and prepared input, what
 * it does in plain words, and which fields the person may adjust or must still supply. A proposal runs nothing.
 */
export interface AgentActionOffer {
  /** The button's words, verb first ("加入计划（3 项）"). */
  title: string;
  /** What clicking does: to which object, with which key values, in the person's words. */
  summary: string;
  reference: ExactActionReference;
  input: unknown;
  /** Top-level input fields the person may change before running it. */
  editable?: string[];
  /** Fields still needed, each with the question to ask; the card cannot run until they are given. */
  missing?: Array<{ field: string; question: string }>;
}

/** A suggestion as a Run recorded it: once, under its own id, never changed afterwards. */
export interface AgentRunOffer extends AgentActionOffer {
  offer_id: string;
  offered_at: string;
}
