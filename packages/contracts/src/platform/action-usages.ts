import type { ActionDefinition, ActionReference } from "./actions.js";
import { ACTION_REFERENCE_SCHEMA } from "./action-offers.js";

/**
 * Where an action is actually used. Each owner of saved references (workflow steps, Character scopes,
 * client grants…) answers for its own records; the Host finds these reporters by type, never by a list.
 */
export const ACTION_USAGES_INPUT_TYPE = "molis.action-usages.input.v1";
export const ACTION_USAGES_OUTPUT_TYPE = "molis.action-usages.output.v1";
export interface ActionUsagesInput { action: ActionReference }
export interface ActionUsage {
  /** Stable within the reporter, e.g. a workflow and step. */
  usage_id: string;
  /** What uses it, in the owner's words: 流程「周报」第 2 步. */
  title: string;
  /** How it is used there, e.g. which fields are filled from what. */
  detail?: string;
  /** Whether that place would call it now (a disabled Character or revoked grant is still listed). */
  enabled: boolean;
  /** Same-origin path to the place, when it has one. */
  href?: string;
}
const text = { type: "string", minLength: 1, maxLength: 400 };
export const ACTION_USAGE_SCHEMA = { type: "object", properties: { usage_id: text, title: text, detail: { type: "string", maxLength: 1000 }, enabled: { type: "boolean" },
  href: { type: "string", pattern: "^/(?!/)", maxLength: 1000 } }, required: ["usage_id", "title", "enabled"], additionalProperties: false };
export const ACTION_USAGES_INPUT_SCHEMA = { type: "object", properties: { action: ACTION_REFERENCE_SCHEMA }, required: ["action"], additionalProperties: false };
export const ACTION_USAGES_OUTPUT_SCHEMA = { type: "object", properties: { usages: { type: "array", maxItems: 500, items: ACTION_USAGE_SCHEMA } }, required: ["usages"], additionalProperties: false };

export function defineActionUsagesAction(capabilityId: string, title: string, permissions: string[], scope: "project" | "home" = "project"): ActionDefinition<ActionUsagesInput, { usages: ActionUsage[] }> {
  return { capability_id: capabilityId, version: 1, operation: "query", action: { title, description: "列出本插件保存的、引用这个能力的位置；只读，不调用该能力。", kind: "query", scope, scheduling: "concurrent",
    permissions, audiences: ["user", "agent", "mcp", "plugin"], subject_kinds: [],
    input_type: ACTION_USAGES_INPUT_TYPE, output_type: ACTION_USAGES_OUTPUT_TYPE, input_schema: ACTION_USAGES_INPUT_SCHEMA, output_schema: ACTION_USAGES_OUTPUT_SCHEMA } };
}

/** A saved reference names this action when capability and version match, and the provider too when both sides name one. */
export function referencesAction(saved: Pick<ActionReference, "capability_id" | "version" | "provider_id">, action: ActionReference): boolean {
  return saved.capability_id === action.capability_id && saved.version === action.version
    && (!saved.provider_id || !action.provider_id || saved.provider_id === action.provider_id);
}
