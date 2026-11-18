import { inputSchemaFor } from "./action-input.js";
import { ACTION_REFERENCE_SCHEMA } from "./action-offers.js";
import { ACTION_SUBJECT_SCHEMA, type ActionSubject } from "./action-subjects.js";
import type { ActionDefinition, ExactActionReference } from "./actions.js";

/**
 * A kind of object that can become a work item (specs/work-mainline/contract-design.md §4): the owner says so in its presentation
 * declaration (`PresentationObject.item`), naming up to three of its own actions with these shapes. The mainline service calls them as
 * the caller; it keeps only the reference, never the object's title, state or body. The SDK checks a declaration names actions of this
 * Manifest with exactly these schemas (`validatePresentationDeclaration`), so a plugin cannot offer another owner's kind.
 */

/** 「建成 xx」「变成 xx」: make one object named so; the same `request_id` gives the same object, so a retried call makes one. */
export interface WorkItemCreateInput { name: string; request_id: string }
export interface WorkItemCreateResult { subject: ActionSubject }
/** The owner's own relation: what in this plugin belongs with this object (a Goal's documents). At most 200. */
export interface WorkItemRelatedInput { subject: ActionSubject }
export interface WorkItemRelatedResult { subjects: ActionSubject[] }
/**
 * The next step for each object, asked once for many. `text` starts with a verb; `waiting_on` says what is missing or whom it waits on;
 * `start` is one of the owner's own actions with its input, and the mainline service refuses one naming another provider.
 */
export interface WorkItemNextStep { text: string; waiting_on?: string; start?: { action: ExactActionReference; input: Record<string, unknown> } }
export interface WorkItemNextInput { subjects: ActionSubject[] }
export interface WorkItemNextResult { items: Array<{ subject: ActionSubject; next: WorkItemNextStep | null }> }

export const WORK_ITEM_LIMITS = { name: 120, related: 200, next_subjects: 200, text: 200, waiting_on: 200 } as const;

const text = (max: number) => ({ type: "string", minLength: 1, maxLength: max }) as const;
export const WORK_ITEM_CREATE_INPUT_SCHEMA = { type: "object", properties: { name: text(WORK_ITEM_LIMITS.name), request_id: text(200) }, required: ["name", "request_id"], additionalProperties: false } as const;
export const WORK_ITEM_CREATE_OUTPUT_SCHEMA = { type: "object", properties: { subject: ACTION_SUBJECT_SCHEMA }, required: ["subject"], additionalProperties: false } as const;
export const WORK_ITEM_RELATED_INPUT_SCHEMA = { type: "object", properties: { subject: ACTION_SUBJECT_SCHEMA }, required: ["subject"], additionalProperties: false } as const;
export const WORK_ITEM_RELATED_OUTPUT_SCHEMA = { type: "object", properties: { subjects: { type: "array", maxItems: WORK_ITEM_LIMITS.related, items: ACTION_SUBJECT_SCHEMA } },
  required: ["subjects"], additionalProperties: false } as const;
export const WORK_ITEM_NEXT_INPUT_SCHEMA = { type: "object", properties: { subjects: { type: "array", minItems: 1, maxItems: WORK_ITEM_LIMITS.next_subjects, items: ACTION_SUBJECT_SCHEMA } },
  required: ["subjects"], additionalProperties: false } as const;
const NEXT_STEP_SCHEMA = { type: "object", properties: { text: text(WORK_ITEM_LIMITS.text), waiting_on: text(WORK_ITEM_LIMITS.waiting_on),
  start: { type: "object", properties: { action: { ...ACTION_REFERENCE_SCHEMA, required: ["capability_id", "version", "provider_id"] }, input: { type: "object" } },
    required: ["action", "input"], additionalProperties: false } }, required: ["text"], additionalProperties: false } as const;
export const WORK_ITEM_NEXT_OUTPUT_SCHEMA = { type: "object", properties: { items: { type: "array", maxItems: WORK_ITEM_LIMITS.next_subjects, items: { type: "object",
  properties: { subject: ACTION_SUBJECT_SCHEMA, next: { anyOf: [{ type: "null" }, NEXT_STEP_SCHEMA] } }, required: ["subject", "next"], additionalProperties: false } } },
  required: ["items"], additionalProperties: false } as const;

/** The three parts a declaration may name, with the schemas each has to carry exactly. */
export const WORK_ITEM_PARTS = {
  create: { operation: "command", input_schema: WORK_ITEM_CREATE_INPUT_SCHEMA, output_schema: WORK_ITEM_CREATE_OUTPUT_SCHEMA },
  related: { operation: "query", input_schema: WORK_ITEM_RELATED_INPUT_SCHEMA, output_schema: WORK_ITEM_RELATED_OUTPUT_SCHEMA },
  next: { operation: "query", input_schema: WORK_ITEM_NEXT_INPUT_SCHEMA, output_schema: WORK_ITEM_NEXT_OUTPUT_SCHEMA },
} as const;
export type WorkItemPart = keyof typeof WORK_ITEM_PARTS;

type Audience = "user" | "agent" | "workflow" | "mcp" | "plugin";
interface WorkItemActionOptions { kind: string; title: string; description: string; permissions: string[]; audiences?: Audience[] }

/** 「建成 xx」: the owner makes one object of `kind`; called as the person (or an Agent the person runs), never as a workflow. */
export function defineItemCreateAction(capabilityId: string, version: number, options: WorkItemActionOptions): ActionDefinition<WorkItemCreateInput, WorkItemCreateResult> {
  return { capability_id: capabilityId, version, operation: "command", action: { title: options.title, description: options.description, kind: "operation", scope: "project",
    scheduling: "concurrent", effect: "write", audiences: options.audiences ?? ["user", "agent", "mcp"], permissions: options.permissions, subject_kinds: [options.kind],
    input_schema: inputSchemaFor<WorkItemCreateInput>()(WORK_ITEM_CREATE_INPUT_SCHEMA), output_schema: WORK_ITEM_CREATE_OUTPUT_SCHEMA } };
}

/** The owner's own relation, read-only. */
export function defineItemRelatedAction(capabilityId: string, version: number, options: WorkItemActionOptions): ActionDefinition<WorkItemRelatedInput, WorkItemRelatedResult> {
  return { capability_id: capabilityId, version, operation: "query", action: { title: options.title, description: options.description, kind: "query", scope: "project",
    scheduling: "concurrent", effect: "read", audiences: options.audiences ?? ["user", "agent", "workflow", "mcp"], permissions: options.permissions, subject_kinds: [options.kind],
    input_schema: inputSchemaFor<WorkItemRelatedInput>()(WORK_ITEM_RELATED_INPUT_SCHEMA), output_schema: WORK_ITEM_RELATED_OUTPUT_SCHEMA } };
}

/** The next step of many objects in one call, read-only. */
export function defineItemNextAction(capabilityId: string, version: number, options: WorkItemActionOptions): ActionDefinition<WorkItemNextInput, WorkItemNextResult> {
  return { capability_id: capabilityId, version, operation: "query", action: { title: options.title, description: options.description, kind: "query", scope: "project",
    scheduling: "concurrent", effect: "read", audiences: options.audiences ?? ["user", "agent", "workflow", "mcp"], permissions: options.permissions, subject_kinds: [options.kind],
    input_schema: inputSchemaFor<WorkItemNextInput>()(WORK_ITEM_NEXT_INPUT_SCHEMA), output_schema: WORK_ITEM_NEXT_OUTPUT_SCHEMA } };
}

/** `capability_id@version` as a declaration writes it, or null when it is not one. */
export function parseItemPartReference(value: unknown): { capability_id: string; version: number } | null {
  const match = typeof value === "string" ? /^([^@\s]+)@([1-9]\d*)$/u.exec(value) : null;
  return match ? { capability_id: match[1]!, version: Number(match[2]) } : null;
}

const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])])) : value;
const same = (left: unknown, right: unknown) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));

/**
 * An action is a part of an item source when its operation and schemas are exactly the platform's for that part, for this kind: the
 * one check the SDK runs on a Manifest and the mainline service runs on the directory, so every source is called alike.
 */
export function isItemPartAction(action: { readonly operation?: unknown; readonly action?: { readonly subject_kinds?: readonly string[]; readonly input_schema?: unknown; readonly output_schema?: unknown } },
  part: WorkItemPart, kind: string): boolean {
  const shape = WORK_ITEM_PARTS[part], metadata = action.action;
  return action.operation === shape.operation && !!metadata && Array.isArray(metadata.subject_kinds) && metadata.subject_kinds.includes(kind)
    && same(metadata.input_schema, shape.input_schema) && same(metadata.output_schema, shape.output_schema);
}
