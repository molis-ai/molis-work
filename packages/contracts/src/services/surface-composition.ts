import type { ActionDefinition } from "../platform/actions.js";
import { inputSchemaFor } from "../platform/action-input.js";
import { ACTION_SUBJECT_SCHEMA, type ActionSubject } from "../platform/action-subjects.js";
import { PRESENTATION_FIELD_ROLES, PRESENTATION_FORM_KINDS, PRESENTATION_LIMITS, PRESENTATION_VALUE_STATES, SURFACE_SLOT_KINDS, type FieldRole, type FormKind,
  type PresentationStartForm, type PresentationValueState, type SurfaceSlotKind } from "../platform/presentation.js";
import { OWNED_TEXT_REF_SCHEMA, type OwnedTextRef } from "../platform/ui-text.js";
import { CONTEXT_RELATION_TYPES, type ContextRelationType } from "../modules/context-ledger.js";

// The composition service's public contract (specs/shared-sources-and-surfaces §6; the service is batch 15's, specs/surface-composition).
// Given who is looking, where and at what, it lays out what to show, in which form, with which fields and actions, from the plugins'
// presentation declarations and fixed rules. The page reads object values from their owners. Home cards can carry the current
// overview's text reference and its arguments. Both actions are declared here and
// registered by the service under `SURFACES_PROVIDER_ID`.

export const SURFACES_PROVIDER_ID = "system.surfaces";
export const SURFACE_HOME_ORDER_LIMIT = 200;

/** What the person is doing (IUI §5, basis 4). The first slice's rules do not read it; it is there for the assistant's composition. */
export const SURFACE_TASKS = ["writing", "reviewing", "finding", "handing-off", "discussing"] as const;
export type SurfaceTask = (typeof SURFACE_TASKS)[number];

/**
 * A place. A `plugin-slot` names the plugin and one of its contributions' slots (`UiSlotDescriptor.slot_id`, a slot with `accepts_forms`);
 * no other kind takes either. `plugin_id` names where, never who asks.
 */
export interface SurfaceSlot { kind: SurfaceSlotKind; plugin_id?: string; slot_id?: string }
export interface SurfaceRequest {
  slot: SurfaceSlot;
  subjects?: ActionSubject[];
  /** Conversation only. A unique subset of `subjects`, where the response delivered the object rather than mentioning it. */
  delivery_subjects?: ActionSubject[];
  /** Conversation or discussion only. Open the folded subjects in this same place. */
  expanded?: true;
  /** Home only. The person's pinned order of canonical plugin ids, applied to visible cards only. */
  home_order?: string[];
  task?: SurfaceTask;
}

/**
 * The operations the platform gives without a declaration; each is still carried out by its owner (「放进」 by the plugin it puts into).
 * An item's action `ref` is one of these or `capability_id@version` of an action in the directory.
 */
export const SURFACE_GENERIC_OPERATIONS = ["open", "peek", "place", "hand_off"] as const;
export type SurfaceGenericOperation = (typeof SURFACE_GENERIC_OPERATIONS)[number];

/** Written beside the button, from the action's metadata, never from a declaration (IUI-08). */
export const SURFACE_CONSEQUENCES = ["external", "cost", "irreversible"] as const;
export type SurfaceConsequence = (typeof SURFACE_CONSEQUENCES)[number];

export interface SurfaceItemAction {
  ref: string;
  /** Required for directory actions. Generic operations do not name a provider. */
  provider_id?: string;
  primary: boolean;
  /** Input key → field key, as the declaration's `input_from`; never a value. The value is read with the authority of the click. */
  prepared_input?: Record<string, string>;
  consequence?: SurfaceConsequence[];
}

export interface SurfaceItemNotice { reason: OwnedTextRef; next?: SurfaceItemAction }

export interface SurfaceItem {
  subject: ActionSubject;
  /** From the plugin directory, for plan B's colour block and band; never what a plugin says. */
  owner_plugin_id: string;
  form: FormKind;
  state: PresentationValueState;
  /** The time of the old values as returned by the authorised reader, when known. */
  read_at?: string;
  /** Which fields to show. Their values are not here: the page reads them with the owner's values action. */
  fields: Array<{ key: string; role: FieldRole }>;
  actions: SurfaceItemAction[];
  notices?: SurfaceItemNotice[];
  /** Objects shown as this one, joined by a relation of `CONTEXT_RELATION_TYPES`. One the caller cannot read is left out. */
  merged?: Array<{ subject: ActionSubject; owner_plugin_id: string; relation: ContextRelationType }>;
}

/**
 * What was left out of a group. Only `disabled`: a `forbidden` count would itself tell what the caller cannot see. `count` and
 * `owner_plugin_id` go to the `user` audience only; to a plugin a group says no more than that something was left out.
 */
export interface SurfaceExclusion { reason: "disabled"; count?: number; owner_plugin_id?: string }

/** The release the person saw. Navigation and commands must recheck this installation at the time of the click. */
export interface SurfaceInstallationRef {
  scope: "project" | "home";
  install_id: string;
  installation_generation: string;
  version: string;
  manifest_digest: string;
}

/** A concrete directory action. A card never carries a generic operation or prepared inputs. */
export type SurfaceCardAction = Pick<SurfaceItemAction, "ref" | "primary" | "consequence"> & { provider_id: string };

export type SurfaceHomeStart = { installation: SurfaceInstallationRef; action: SurfaceCardAction } &
  ({ kind: "invoke" } | ({ kind: "form" } & PresentationStartForm));
export type SurfaceHomeEnable =
  | { kind: "project_membership"; installation: SurfaceInstallationRef & { scope: "project" }; action: SurfaceCardAction; expected_revision: string }
  | { kind: "project_installation"; installation: SurfaceInstallationRef & { scope: "project" }; action: SurfaceCardAction }
  | { kind: "home_plugin_settings"; installation: SurfaceInstallationRef & { scope: "home" } };

export interface SurfacePluginCard {
  summary?: OwnedTextRef;
  note?: OwnedTextRef;
  start?: SurfaceHomeStart[];
  open?: { kind: "stage"; installation: SurfaceInstallationRef; view_id: string };
  enable?: SurfaceHomeEnable;
}

/** Every word here is an `OwnedTextRef`: the service binds its owner from the plugin directory, so a page finds the words without asking. */
export interface SurfaceGroup {
  kind: "attention" | "continue" | "plugin" | "slot";
  /** Only in a `plugin` group. */
  owner_plugin_id?: string;
  /** `disabled` and `undeclared` only in a `plugin` group. */
  state: "ok" | "unreadable" | "stale" | "disabled" | "undeclared";
  /** With `stale`. */
  read_at?: string;
  excluded?: SurfaceExclusion[];
  /** 「另有 N 件」: counts only what the caller can read; `label` takes `count`. */
  hidden_above?: { count: number; label: OwnedTextRef };
  /** Readable items folded in this group until the person expands the same place. */
  overflow?: { count: number; label?: OwnedTextRef };
  /** Home's trusted card facts, only in a plugin group. */
  plugin_card?: SurfacePluginCard;
  title?: OwnedTextRef;
  items: SurfaceItem[];
}

export interface SurfaceDescription {
  composed_by: "rules" | "assistant";
  /** The same request, declarations, values, authority and corrections give the same revision (IUI-04); a change of authority alone changes it. */
  revision: string;
  /** The revision of the caller's corrections at this place, which `surfaces.correct@1` takes as `expected_revision`. */
  corrections_revision: string;
  groups: SurfaceGroup[];
  /** Why it is laid out like this (IUI-06). */
  reason?: OwnedTextRef;
}

/**
 * The person's correction at a place: a form for an object (or for the whole place when `subject` is left out), taking an object away,
 * pinning it at a position counted from 0, or resetting the object or the place. Kept per caller and place (IUI-06).
 */
export interface SurfaceCorrectionInput {
  slot: SurfaceSlot;
  subject?: ActionSubject;
  correction: "form" | "remove" | "pin" | "reset";
  form?: FormKind;
  position?: number;
  expected_revision: string;
}
export interface SurfaceCorrectionResult { corrections_revision: string }

const text = (maxLength: number) => ({ type: "string", minLength: 1, maxLength } as const);
const SLOT_SCHEMA = { type: "object", additionalProperties: false, required: ["kind"],
  properties: { kind: { enum: SURFACE_SLOT_KINDS }, plugin_id: text(200), slot_id: text(200) },
  if: { properties: { kind: { const: "plugin-slot" } } }, then: { required: ["plugin_id", "slot_id"] },
  else: { not: { anyOf: [{ required: ["plugin_id"] }, { required: ["slot_id"] }] } } } as const;
const SUBJECTS_SCHEMA = { type: "array", items: ACTION_SUBJECT_SCHEMA, maxItems: PRESENTATION_LIMITS.values_subjects } as const;
const REQUEST_SCHEMA = { type: "object", additionalProperties: false, required: ["slot"], properties: { slot: SLOT_SCHEMA,
  subjects: SUBJECTS_SCHEMA, delivery_subjects: { ...SUBJECTS_SCHEMA, uniqueItems: true }, expanded: { const: true }, task: { enum: SURFACE_TASKS },
  home_order: { type: "array", items: text(200), maxItems: SURFACE_HOME_ORDER_LIMIT, uniqueItems: true } },
  allOf: [
    { if: { required: ["delivery_subjects"] }, then: { required: ["subjects"], properties: { slot: { properties: { kind: { const: "conversation" } } } } } },
    { if: { required: ["expanded"] }, then: { properties: { slot: { properties: { kind: { enum: ["conversation", "discussion"] } } } } } },
    { if: { required: ["home_order"] }, then: { properties: { slot: { properties: { kind: { const: "home" } } } } } },
  ] } as const;
const ACTION_SCHEMA = { type: "object", additionalProperties: false, required: ["ref", "primary"], properties: { ref: text(PRESENTATION_LIMITS.action_ref), primary: { type: "boolean" },
  provider_id: text(200), prepared_input: { type: "object", additionalProperties: text(PRESENTATION_LIMITS.field_key) }, consequence: { type: "array", items: { enum: SURFACE_CONSEQUENCES }, uniqueItems: true } },
  if: { properties: { ref: { enum: SURFACE_GENERIC_OPERATIONS } } }, then: { not: { required: ["provider_id"] } },
  else: { required: ["provider_id"], properties: { ref: { pattern: "^[^@\\s]+@[1-9]\\d*$" } } } };
const NOTICE_SCHEMA = { type: "object", additionalProperties: false, required: ["reason"], properties: {
  reason: OWNED_TEXT_REF_SCHEMA, next: { ...ACTION_SCHEMA, required: [...ACTION_SCHEMA.required, "provider_id"] },
} };
const MERGED_SCHEMA = { type: "object", additionalProperties: false, required: ["subject", "owner_plugin_id", "relation"],
  properties: { subject: ACTION_SUBJECT_SCHEMA, owner_plugin_id: text(200), relation: { enum: Object.values(CONTEXT_RELATION_TYPES) } } };
const ITEM_SCHEMA = { type: "object", additionalProperties: false, required: ["subject", "owner_plugin_id", "form", "state", "fields", "actions"], properties: {
  subject: ACTION_SUBJECT_SCHEMA, owner_plugin_id: text(200), form: { enum: PRESENTATION_FORM_KINDS }, state: { enum: PRESENTATION_VALUE_STATES },
  read_at: { type: "string", format: "date-time" },
  fields: { type: "array", maxItems: PRESENTATION_LIMITS.fields, items: { type: "object", additionalProperties: false, required: ["key", "role"],
    properties: { key: text(PRESENTATION_LIMITS.field_key), role: { enum: PRESENTATION_FIELD_ROLES } } } },
  actions: { type: "array", items: ACTION_SCHEMA }, notices: { type: "array", items: NOTICE_SCHEMA }, merged: { type: "array", items: MERGED_SCHEMA } },
  if: { properties: { state: { const: "stale" } } }, then: {}, else: { not: { required: ["read_at"] } } };
const EXCLUSION_SCHEMA = { type: "object", additionalProperties: false, required: ["reason"],
  properties: { reason: { const: "disabled" }, count: { type: "integer", minimum: 1 }, owner_plugin_id: text(200) } };
const REVISION = text(PRESENTATION_LIMITS.revision);
const INSTALLATION = { type: "object", additionalProperties: false, required: ["scope", "install_id", "installation_generation", "version", "manifest_digest"],
  properties: { scope: { enum: ["project", "home"] }, install_id: text(200), installation_generation: text(200), version: text(200), manifest_digest: text(200) } } as const;
export const PROJECT_INSTALLATION = { ...INSTALLATION, properties: { ...INSTALLATION.properties, scope: { const: "project" } } } as const;
const HOME_INSTALLATION = { ...INSTALLATION, properties: { ...INSTALLATION.properties, scope: { const: "home" } } };
const CARD_ACTION = { type: "object", additionalProperties: false, required: ["ref", "provider_id", "primary"], properties: {
  ref: { ...ACTION_SCHEMA.properties.ref, ...ACTION_SCHEMA.else.properties.ref }, provider_id: ACTION_SCHEMA.properties.provider_id,
  primary: ACTION_SCHEMA.properties.primary, consequence: ACTION_SCHEMA.properties.consequence,
} };
const START_SCHEMA = { oneOf: [
  { type: "object", additionalProperties: false, required: ["kind", "action", "installation"],
    properties: { kind: { const: "invoke" }, action: CARD_ACTION, installation: INSTALLATION } },
  { type: "object", additionalProperties: false, required: ["kind", "action", "installation", "view_id", "panel"],
    properties: { kind: { const: "form" }, action: CARD_ACTION, installation: INSTALLATION,
      view_id: text(PRESENTATION_LIMITS.start_view_id), panel: text(PRESENTATION_LIMITS.start_panel) } },
] };
const ENABLE_SCHEMA = { oneOf: [
  { type: "object", additionalProperties: false, required: ["kind", "installation", "action", "expected_revision"],
    properties: { kind: { const: "project_membership" }, installation: PROJECT_INSTALLATION, action: CARD_ACTION, expected_revision: REVISION } },
  { type: "object", additionalProperties: false, required: ["kind", "installation", "action"],
    properties: { kind: { const: "project_installation" }, installation: PROJECT_INSTALLATION, action: CARD_ACTION } },
  { type: "object", additionalProperties: false, required: ["kind", "installation"],
    properties: { kind: { const: "home_plugin_settings" }, installation: HOME_INSTALLATION } },
] };
const PLUGIN_CARD_SCHEMA = { type: "object", additionalProperties: false, properties: {
  summary: OWNED_TEXT_REF_SCHEMA, note: OWNED_TEXT_REF_SCHEMA,
  start: { type: "array", minItems: 1, maxItems: PRESENTATION_LIMITS.overview_start, uniqueItems: true, items: START_SCHEMA },
  open: { type: "object", additionalProperties: false, required: ["kind", "installation", "view_id"],
    properties: { kind: { const: "stage" }, installation: INSTALLATION, view_id: text(PRESENTATION_LIMITS.start_view_id) } },
  enable: ENABLE_SCHEMA,
} };
const GROUP_SCHEMA = { type: "object", additionalProperties: false, required: ["kind", "state", "items"], properties: {
  kind: { enum: ["attention", "continue", "plugin", "slot"] }, owner_plugin_id: text(200), state: { enum: ["ok", "unreadable", "stale", "disabled", "undeclared"] },
  read_at: { type: "string", format: "date-time" }, excluded: { type: "array", items: EXCLUSION_SCHEMA },
  hidden_above: { type: "object", additionalProperties: false, required: ["count", "label"], properties: { count: { type: "integer", minimum: 1 }, label: OWNED_TEXT_REF_SCHEMA } },
  overflow: { type: "object", additionalProperties: false, required: ["count"], properties: { count: { type: "integer", minimum: 1 }, label: OWNED_TEXT_REF_SCHEMA } },
  plugin_card: PLUGIN_CARD_SCHEMA, title: OWNED_TEXT_REF_SCHEMA, items: { type: "array", items: ITEM_SCHEMA } },
  if: { properties: { kind: { const: "plugin" } } }, then: {}, else: { not: { required: ["plugin_card"] } } };
const DESCRIPTION_SCHEMA = { type: "object", additionalProperties: false, required: ["composed_by", "revision", "corrections_revision", "groups"], properties: {
  composed_by: { enum: ["rules", "assistant"] }, revision: REVISION, corrections_revision: REVISION, groups: { type: "array", items: GROUP_SCHEMA }, reason: OWNED_TEXT_REF_SCHEMA } };
// `expected_revision` stays a top-level property, where the Kernel looks for the version a command commits from.
const CORRECTION_SCHEMA = { type: "object", additionalProperties: false, required: ["slot", "correction", "expected_revision"], properties: {
  slot: SLOT_SCHEMA, subject: ACTION_SUBJECT_SCHEMA, correction: { enum: ["form", "remove", "pin", "reset"] }, form: { enum: PRESENTATION_FORM_KINDS },
  position: { type: "integer", minimum: 0, maximum: PRESENTATION_LIMITS.values_subjects - 1 }, expected_revision: REVISION },
  oneOf: [
    { properties: { correction: { const: "form" } }, required: ["form"], not: { required: ["position"] } },
    { properties: { correction: { const: "remove" } }, required: ["subject"], not: { anyOf: [{ required: ["form"] }, { required: ["position"] }] } },
    { properties: { correction: { const: "pin" } }, required: ["subject", "position"], not: { required: ["form"] } },
    { properties: { correction: { const: "reset" } }, not: { anyOf: [{ required: ["form"] }, { required: ["position"] }] } },
  ] } as const;

/** Declared only: the composition service registers both (batch 15 S-1). The first slice is for the person and for plugins (§10 item 4). */
export const surfaceCompositionActions = {
  /** Deterministic in the first slice: no model is called. Concurrent because it waits for each owner's values action. */
  compose: {
    capability_id: "surfaces.compose",
    version: /* @version action.surfaces.compose */ 1,
    operation: "query",
    action: { title: "组合操作面", description: "按调用方、位置和对象排出该显示哪些东西、各用什么形态、显示哪些字段、带哪些操作；不含对象字段的值或预备输入；不调用模型",
      kind: "query", scope: "project", effect: "read", scheduling: "concurrent", audiences: ["user", "plugin"], permissions: [], subject_kinds: [],
      input_schema: inputSchemaFor<SurfaceRequest>()(REQUEST_SCHEMA), output_schema: DESCRIPTION_SCHEMA, output_type: "surfaces.description" },
  } as ActionDefinition<SurfaceRequest, SurfaceDescription>,
  /** The person's own layout, so only the person corrects it. Committed from the corrections revision the description gave. */
  correct: {
    capability_id: "surfaces.correct",
    version: /* @version action.surfaces.correct */ 1,
    operation: "command",
    action: { title: "纠正操作面", description: "记住你在这个位置换的形态、移走或固定的东西，下次先照这个排；只影响你自己",
      kind: "operation", scope: "project", effect: "write", audiences: ["user"], permissions: [], subject_kinds: [],
      input_schema: inputSchemaFor<SurfaceCorrectionInput>()(CORRECTION_SCHEMA),
      output_schema: { type: "object", additionalProperties: false, required: ["corrections_revision"], properties: { corrections_revision: REVISION } } },
  } as ActionDefinition<SurfaceCorrectionInput, SurfaceCorrectionResult>,
};
