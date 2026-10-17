// A suggestion to the person, as the model makes it and as a Run records it, and the one way a plugin runs it. Read
// through `services/agent-host`.
import type { ActionDefinition, ExactActionReference } from "../platform/actions.js";

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
  /**
   * The action's contract as the round froze it (sha256 of its declaration and operation): running the offer later is
   * refused once the action's current contract differs (`actions.definition_changed`).
   */
  action_digest: string;
}

/** A plugin runs a suggestion of one of its sessions' rounds, as the person clicked it, with the fields they changed. */
export interface AgentOfferRunRequest {
  runtime_id: string;
  session_id: string;
  run_id: string;
  offer_id: string;
  /** The reference the plugin's card shows: it must be the offer's own, exactly. */
  reference: ExactActionReference;
  /** The prepared input, the person's changes included; the action's own check decides it. */
  input: unknown;
}

const id = { type: "string", minLength: 1 } as const;

/**
 * Running a round's suggestion (specs/ai-interaction-experience D25, D27): the Host runs only the action that offer names,
 * under the grant the round itself had, as that grant reads now; a click is the person's confirmation. Only for plugins:
 * the plugin keeps the card and its claim, so a second click runs nothing (the Host keeps no state for it).
 */
export const agentOfferActions = {
  run: {
    capability_id: "agent.offers.run.v1", version: 1, operation: "command",
    action: { title: "执行一轮的建议", description: "人点了一张建议卡：按这一轮自己的授权，只执行那条建议点名的动作（确切的引用与版本），输入经该动作自己的检查。引用不是这条建议的、动作已关闭或合同在建议之后变了，都拒绝且什么都不执行。只给插件调用。", kind: "operation", scope: "project", effect: "write", scheduling: "concurrent",
      audiences: ["plugin"], permissions: [], subject_kinds: [],
      input_schema: { type: "object", required: ["runtime_id", "session_id", "run_id", "offer_id", "reference", "input"], additionalProperties: false, properties: {
        runtime_id: id, session_id: id, run_id: id, offer_id: id, input: {},
        reference: { type: "object", required: ["capability_id", "version", "provider_id"], additionalProperties: false, properties: { capability_id: id, version: { type: "integer", minimum: 1 }, provider_id: id } } } },
      output_schema: { type: "object", required: ["output"], additionalProperties: false, properties: { output: {} } } },
  } as ActionDefinition<AgentOfferRunRequest, { output: unknown }>,
} as const;
