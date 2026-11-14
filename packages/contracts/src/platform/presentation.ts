import type { ActionAudience, ActionCallContext, ActionDefinition, ActionHandlerBinding } from "./actions.js";
import { bindActionHandler, inputSchemaFor } from "./action-input.js";
import { ACTION_SUBJECT_SCHEMA, type ActionSubject } from "./action-subjects.js";
import { TEXT_REF_SCHEMA, type TextRef } from "./ui-text.js";

export * from "./presentation-declaration.js";

/** Upper bounds a declaration and the two actions are held to. A field key is also checked in code for its form (`[a-z][a-z0-9_]*`). */
export const PRESENTATION_LIMITS = {
  objects: 32, fields: 32, field_key: 64, status_values: 32, actions: 8, text_lines: 8,
  /** Objects one values call reads. */
  values_subjects: 50,
  revision: 200, capability_id: 200,
  /** `capability_id@version`. */
  action_ref: 212,
  overview_subjects: 5, overview_start: 3, start_view_id: 200, start_panel: 100,
} as const;

/** A `judgment` value: the owner's call on the thing. `reason` may be a `literal`: a sentence the owner writes (a-section §2.4). */
export interface PresentationJudgment {
  readonly label: TextRef;
  readonly reason?: TextRef;
}
/** A `held_in` value: whether the thing is the project's or the person's own, given by the owner from its real relation. Not `scope`. */
export type PresentationHeldIn = "project" | "personal";

// ---- values: what the owner gives, each time it is asked ------------------------------------------------------------------------

export const PRESENTATION_VALUES_INPUT_TYPE = /* @version type.molis.presentation.values.request "molis.presentation.values.request.v{version}" */ "molis.presentation.values.request.v1";
export const PRESENTATION_VALUES_OUTPUT_TYPE = /* @version type.molis.presentation.values "molis.presentation.values.v{version}" */ "molis.presentation.values.v1";

/**
 * `forbidden`: the caller may not read it now; `deleted`: it is gone; `stale`: the owner cannot read it this moment and gives the last
 * values it read, with `read_at`, so the page writes 「x 分钟前的值」 and never shows them as current (IUI-10).
 */
export const PRESENTATION_VALUE_STATES = ["ok", "forbidden", "deleted", "stale"] as const;
export type PresentationValueState = (typeof PRESENTATION_VALUE_STATES)[number];

export interface PresentationValuesInput { subjects: ActionSubject[]; fields: string[] }
export interface PresentationValueItem {
  subject: ActionSubject;
  revision: string;
  state: PresentationValueState;
  /** Field key → value, only the fields asked for; none for `forbidden` and `deleted`. */
  values?: Record<string, unknown>;
  /** When these values were read. A `stale` item always has it. */
  read_at?: string;
}
export interface PresentationValues { items: PresentationValueItem[] }

const SUBJECTS = { type: "array", items: ACTION_SUBJECT_SCHEMA, minItems: 1, maxItems: PRESENTATION_LIMITS.values_subjects } as const;
const FIELD_KEYS = { type: "array", items: { type: "string", minLength: 1, maxLength: PRESENTATION_LIMITS.field_key }, maxItems: PRESENTATION_LIMITS.fields } as const;
export const PRESENTATION_VALUES_INPUT_SCHEMA = { type: "object", properties: { subjects: SUBJECTS, fields: FIELD_KEYS }, required: ["subjects", "fields"], additionalProperties: false } as const;
const VALUE_ITEM = { type: "object", additionalProperties: false, required: ["subject", "revision", "state"], properties: {
  subject: ACTION_SUBJECT_SCHEMA, revision: { type: "string", minLength: 1, maxLength: PRESENTATION_LIMITS.revision }, state: { type: "string", enum: PRESENTATION_VALUE_STATES },
  values: { type: "object" }, read_at: { type: "string", format: "date-time" } } } as const;
export const PRESENTATION_VALUES_OUTPUT_SCHEMA = { type: "object", additionalProperties: false, required: ["items"],
  properties: { items: { type: "array", maxItems: PRESENTATION_LIMITS.values_subjects, items: VALUE_ITEM } } } as const;

/** Who may read the values unless the owner narrows it: the composition service and a page ask as the caller, an external Agent reads the text form. */
export const PRESENTATION_VALUES_AUDIENCES: readonly ActionAudience[] = ["user", "plugin", "agent", "mcp"];

/** The owner's values for its objects of these kinds, read with the caller's authority each time, so a revoked, deleted or unreadable object shows as such (IUI-09). */
export function definePresentationValuesAction(capabilityId: string, version: number, kinds: readonly string[], title: string, permissions: readonly string[],
  scope: "project" | "home" = "project", audiences: readonly ActionAudience[] = PRESENTATION_VALUES_AUDIENCES): ActionDefinition<PresentationValuesInput, PresentationValues> {
  return { capability_id: capabilityId, version, operation: "query", action: { title, kind: "query", scope, effect: "read", scheduling: "concurrent", audiences: [...audiences],
    description: "按调用方此刻的授权读取这些对象要显示的字段；读不了、已删除、此刻读不到的如实给出状态；不修改数据。",
    permissions: [...permissions], subject_kinds: [...kinds], input_type: PRESENTATION_VALUES_INPUT_TYPE, output_type: PRESENTATION_VALUES_OUTPUT_TYPE,
    execution: { cost: "none" }, input_schema: inputSchemaFor<PresentationValuesInput>()(PRESENTATION_VALUES_INPUT_SCHEMA), output_schema: PRESENTATION_VALUES_OUTPUT_SCHEMA } };
}

export function isPresentationValuesAction(action: { input_type?: string; output_type?: string; execution?: { cost?: string } }): boolean {
  return action.input_type === PRESENTATION_VALUES_INPUT_TYPE && action.output_type === PRESENTATION_VALUES_OUTPUT_TYPE && action.execution?.cost === "none";
}

/** What the owner answers, kept to what was asked: only the asked fields, and nothing but the state for an object the caller may not read or that is gone. */
function answered(input: PresentationValuesInput, output: PresentationValues): PresentationValues {
  const asked = new Set(input.fields);
  return { items: output.items.map(({ values, read_at, ...item }) => item.state === "forbidden" || item.state === "deleted" ? item
    : { ...item, ...(values ? { values: Object.fromEntries(Object.entries(values).filter(([key]) => asked.has(key))) } : {}), ...(read_at ? { read_at } : {}) }) };
}

/** Bind the owner's reader: it answers for the subjects asked, and the helper drops whatever it gives beyond the fields asked or for an object the caller cannot see. */
export function bindPresentationValuesHandler(definition: ActionDefinition<PresentationValuesInput, PresentationValues>,
  read: (input: PresentationValuesInput, caller: ActionCallContext) => PresentationValues | Promise<PresentationValues>,
  availability?: ActionHandlerBinding["availability"]): ActionHandlerBinding {
  return bindActionHandler(definition, async (input, caller) => answered(input, await read(input, caller)), availability ? { availability } : undefined);
}

// ---- overview: the plugin as a whole --------------------------------------------------------------------------------------------

export const PRESENTATION_OVERVIEW_OUTPUT_TYPE = /* @version type.molis.presentation.overview "molis.presentation.overview.v{version}" */ "molis.presentation.overview.v1";

/** `summary` has no owner: the service binds the action's provider from the directory. `start` picks among the declaration's `start`. */
export interface PresentationOverview {
  summary: TextRef;
  subjects: ActionSubject[];
  start: Array<{ capability_id: string; version: number }>;
}

const ACTION_TARGET = { type: "object", additionalProperties: false, required: ["capability_id", "version"], properties: {
  capability_id: { type: "string", minLength: 1, maxLength: PRESENTATION_LIMITS.capability_id }, version: { type: "integer", minimum: 1 } } } as const;
/** Fixed by the platform: the action a declaration's `overview` names carries exactly these two schemas (SSC-18). */
export const PRESENTATION_OVERVIEW_INPUT_SCHEMA = { type: "object", properties: {}, additionalProperties: false } as const;
export const PRESENTATION_OVERVIEW_OUTPUT_SCHEMA = { type: "object", additionalProperties: false, required: ["summary", "subjects", "start"], properties: {
  summary: TEXT_REF_SCHEMA,
  subjects: { type: "array", maxItems: PRESENTATION_LIMITS.overview_subjects, items: ACTION_SUBJECT_SCHEMA },
  start: { type: "array", maxItems: PRESENTATION_LIMITS.overview_start, items: ACTION_TARGET } } } as const;

/**
 * The plugin's overview: a read that calls no model and costs nothing, like `home_aggregate`. A Home-level plugin's (`scope: "home"`) is
 * given the projects the person may reach through it (`project_reach`, so its Manifest declares `projects:reach`); the input names no project.
 */
export function definePresentationOverviewAction(capabilityId: string, version: number, title: string, permissions: readonly string[],
  scope: "project" | "home" = "project"): ActionDefinition<Record<string, never>, PresentationOverview> {
  return { capability_id: capabilityId, version, operation: "query", action: { title, kind: "query", scope, effect: "read", audiences: ["user"],
    description: "这个插件现在怎么样：一句概况、前几个对象和开始的入口；只读，不调用模型。", permissions: [...permissions], subject_kinds: [],
    ...(scope === "home" ? { project_reach: "person" as const } : {}), execution: { cost: "none" }, output_type: PRESENTATION_OVERVIEW_OUTPUT_TYPE,
    input_schema: PRESENTATION_OVERVIEW_INPUT_SCHEMA, output_schema: PRESENTATION_OVERVIEW_OUTPUT_SCHEMA } };
}
