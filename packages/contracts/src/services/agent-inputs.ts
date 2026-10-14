import type { ContractDescriptor } from "../platform/package.js";

/**
 * What a person, or the Host on their behalf, tells a running Agent round, and what the round's runtime says became of
 * it (specs/ai-input-receipts §3, §6.2). The runtime owns the facts (received, in the context, read, not read,
 * withdrawn); this file describes them in Molis's words. Nothing here carries authority: a supplement is information to
 * the model, never an approval.
 */
export const servicesAgentInputsContract = {
  contractId: "io.molis.work.service.agent-inputs.v1",
  kind: "service",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "specs/ai-input-receipts/spec.md",
} as const satisfies ContractDescriptor;

/**
 * Who wrote a supplement. Only `person` is the person's own words. `host` is the Host relaying something on their behalf
 * (a review note, a board update): the model receives it as data, and the run shows it as a note, never as their words.
 */
export type AgentInputSource = "person" | "host";

/** A supplement to a running round: it reaches the model at its next boundary, beside what it is already doing. */
export interface AgentSteerControl {
  kind: "steer";
  text: string;
  /** `person` when absent. */
  source?: AgentInputSource;
  /** The caller's idempotency key: the same key with the same text counts once, the same key with other text is refused. */
  key?: string;
}
