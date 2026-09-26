import { ACTION_SUBJECT_SCHEMA, type ActionSubject } from "./action-subjects.js";
import type { ActionDefinition, ActionReference } from "./actions.js";
export const SUBJECT_OFFERS_INPUT_TYPE = "molis.subject-offers.input.v1";
export const SUBJECT_OFFERS_OUTPUT_TYPE = "molis.subject-offers.output.v1";
export interface SubjectOffersInput { subject: ActionSubject; request_id: string }
export interface SubjectActionOffer { offer_id: string; title: string; action: ActionReference; input: unknown }
/** A rule may select this declared offer; only the original query prepares its current business input. */
export interface SubjectOfferChoice {
  readonly offer_id: string;
  readonly title: string;
  readonly action: Pick<ActionReference, "capability_id" | "version">;
  /** Omit to use the query's kinds; otherwise a nonempty subset of them. */
  readonly subject_kinds?: readonly string[];
}
const id = { type: "string", minLength: 1 };
export const ACTION_REFERENCE_SCHEMA = { type: "object", properties: { capability_id: id, version: { type: "integer", minimum: 1 }, provider_id: id }, required: ["capability_id", "version"], additionalProperties: false };
export const SUBJECT_OFFERS_INPUT_SCHEMA = { type: "object", properties: { subject: ACTION_SUBJECT_SCHEMA, request_id: { ...id, maxLength: 200 } }, required: ["subject", "request_id"], additionalProperties: false };
export const SUBJECT_OFFER_SCHEMA = { type: "object", properties: { offer_id: id, title: { ...id, maxLength: 120 }, action: ACTION_REFERENCE_SCHEMA, input: {} }, required: ["offer_id", "title", "action", "input"], additionalProperties: false };
export const SUBJECT_OFFERS_OUTPUT_SCHEMA = { type: "object", properties: { offers: { type: "array", items: SUBJECT_OFFER_SCHEMA } }, required: ["offers"], additionalProperties: false };
export function defineSubjectOffersAction(capabilityId: string, kinds: string[], title: string, permissions: string[], choices?: readonly SubjectOfferChoice[]): ActionDefinition<SubjectOffersInput, { offers: SubjectActionOffer[] }> {
  return { capability_id: capabilityId, version: 1, operation: "query", action: { title, description: "按当前事项准备本插件真实动作的完整参数；不会执行这些动作。", kind: "query", scope: "project", scheduling: "concurrent",
    permissions, audiences: ["user", "agent", "workflow", "mcp", "plugin"], subject_kinds: kinds,
    ...(choices ? { subject_offer_choices: choices } : {}),
    input_type: SUBJECT_OFFERS_INPUT_TYPE, output_type: SUBJECT_OFFERS_OUTPUT_TYPE, input_schema: SUBJECT_OFFERS_INPUT_SCHEMA, output_schema: SUBJECT_OFFERS_OUTPUT_SCHEMA } };
}
