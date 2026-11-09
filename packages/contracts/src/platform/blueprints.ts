import type { RoleTemplate } from "../modules/characters.js";
import { ACTION_SUBJECT_SCHEMA, inputSchemaFor, type ActionReference, type ActionSchema, type ActionSubject, type InferActionInput } from "./actions.js";
import { BLUEPRINT_PART_ORIGIN_SCHEMA, type BlueprintPartOrigin } from "./blueprint-source.js";
import { closedObjectSchema } from "./closed-object-schema.js";
import type { PluginRequirementDeclaration } from "./plugin-manifest.js";
import type { SandboxJson, SandboxSchema } from "./plugin-sandbox.js";
import type { SettingLayer } from "./settings.js";
import type { TextRef } from "./ui-text.js";

export { BLUEPRINT_PART_ORIGIN_SCHEMA, BLUEPRINT_SOURCE_SCHEMA, type BlueprintPartOrigin, type BlueprintSource } from "./blueprint-source.js";

export const BLUEPRINT_LIMITS = { parts: 128, steps: 128 } as const;

/** The reusable content of a scene package or draft. Its identity comes from the caller. */
export interface Blueprint {
  title: TextRef;
  parts: BlueprintPart[];
  purpose: { audience: TextRef; work: TextRef; inputs: TextRef; outputs: TextRef; first_result: TextRef };
  steps: Array<{ step_id: string; title: TextRef; part_ids: string[] }>;
  example_task: { title: TextRef; input: TextRef; step_ids: string[]; result: { part_id: string; location: TextRef } };
}

export interface BlueprintPart {
  /** Unique within the blueprint and stable across versions. */
  part_id: string;
  required: boolean;
  layer: SettingLayer;
  proposal: BlueprintProposal;
}

export type BlueprintProposal =
  | { kind: "capability"; requires: PluginRequirementDeclaration }
  | { kind: "skill"; skill: { pack: string; skill_id: string }; state: "auto" | "manual" }
  | { kind: "role"; template: RoleTemplate }
  | { kind: "setting"; key: string; value: SandboxJson }
  | { kind: "connection"; category: string; purpose: TextRef }
  | { kind: "content"; type: string; body: SandboxJson };

type OwnerActionReference = Pick<ActionReference, "capability_id" | "version">;

/** One content type accepted by the owner of the referenced actions. The type name does not convey authority. */
export interface AdoptsDeclaration {
  type: string;
  title: TextRef;
  schema: SandboxSchema;
  adopt: OwnerActionReference;
  read: OwnerActionReference;
  revert?: OwnerActionReference;
}

export type AdoptionRevision = string | number;
export const ADOPTION_OUTCOMES = ["created", "reused", "modified"] as const;
export type AdoptionOutcome = (typeof ADOPTION_OUTCOMES)[number];

export type ContentAdoptionSelection =
  | { kind: "create" }
  | { kind: "reuse" | "update"; subject: ActionSubject; expected_revision: AdoptionRevision };

export interface ContentAdoptionInput<Body = SandboxJson> {
  request_id: string;
  blueprint: BlueprintPartOrigin;
  selection: ContentAdoptionSelection;
  body: Body;
}

export interface ContentAdoptionResult {
  outcome: AdoptionOutcome;
  subject: ActionSubject;
  revision: AdoptionRevision;
}

export type ContentAdoptionQuery<Body = SandboxJson> =
  | { by: "proposal"; type: string; blueprint: BlueprintPartOrigin; body: Body }
  | { by: "subject"; subject: ActionSubject }
  | { by: "request"; operation: "adopt" | "revert"; request_id: string };

export interface ContentAdoptionReadInput<Body = SandboxJson> { queries: ContentAdoptionQuery<Body>[] }

export type ContentAdoptionCurrent<Value = SandboxJson> =
  | { state: "present"; value: Value; revision: AdoptionRevision; origin: BlueprintPartOrigin | null }
  | { state: "missing" }
  | { state: "unavailable"; reason: string };

export type ContentAdoptionReadResult<Value = SandboxJson> =
  | { kind: "proposal"; candidates: Array<{ subject: ActionSubject; current: ContentAdoptionCurrent<Value> }> }
  | { kind: "subject"; current: ContentAdoptionCurrent<Value> }
  | { kind: "receipt"; operation: "adopt"; request_id: string; receipt: ContentAdoptionResult; current: ContentAdoptionCurrent<Value> }
  | { kind: "receipt"; operation: "revert"; request_id: string; receipt: ContentAdoptionRevertResult; current: ContentAdoptionCurrent<Value> }
  | { kind: "missing"; operation: "adopt" | "revert"; request_id: string };

export interface ContentAdoptionReadOutput<Value = SandboxJson> {
  results: ContentAdoptionReadResult<Value>[];
}

export interface ContentAdoptionRevertInput {
  adopt_request_id: string;
  request_id: string;
  subject: ActionSubject;
  expected_revision: AdoptionRevision;
}

export interface ContentAdoptionRevertResult {
  outcome: "restored" | "detached";
  subject: ActionSubject;
  revision: AdoptionRevision;
}

const token = { type: "string", pattern: "\\S" } as const;
const nullValue = { type: "null" } as const;
const json = { type: ["null", "boolean", "number", "string", "array", "object"] } as const;
const adoptionOperation = { enum: ["adopt", "revert"] } as const;
const batch = <const S extends object>(items: S) => ({ type: "array", minItems: 1, maxItems: BLUEPRINT_LIMITS.parts, items } as const);

/** An owner token is echoed without converting a numeric version into a string. */
export const ADOPTION_REVISION_SCHEMA = { oneOf: [token, { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER }] } as const;

const selection = { oneOf: [
  closedObjectSchema({ kind: { const: "create" } }),
  closedObjectSchema({ kind: { enum: ["reuse", "update"] }, subject: ACTION_SUBJECT_SCHEMA, expected_revision: ADOPTION_REVISION_SCHEMA }),
] } as const;

type BodyEnvelope = InferActionInput<SandboxSchema>;

/** The owner supplies just the bounded schema for the proposal's body. */
export function contentAdoptionInputSchema(body: SandboxSchema): ActionSchema {
  return inputSchemaFor<ContentAdoptionInput<BodyEnvelope>>()(closedObjectSchema({
    request_id: token, blueprint: BLUEPRINT_PART_ORIGIN_SCHEMA, selection, body,
  }));
}

export const CONTENT_ADOPTION_RESULT_SCHEMA = closedObjectSchema({
  outcome: { enum: ADOPTION_OUTCOMES }, subject: ACTION_SUBJECT_SCHEMA, revision: ADOPTION_REVISION_SCHEMA,
});

/** Services can add distinct read queries while keeping the common owner's query branches. */
export function contentAdoptionReadInputSchema(body: SandboxSchema, extraQueries: readonly ActionSchema[] = []): ActionSchema {
  const branches = [
    closedObjectSchema({ by: { const: "proposal" }, type: token, blueprint: BLUEPRINT_PART_ORIGIN_SCHEMA, body }),
    closedObjectSchema({ by: { const: "subject" }, subject: ACTION_SUBJECT_SCHEMA }),
    closedObjectSchema({ by: { const: "request" }, operation: adoptionOperation, request_id: token }),
  ] as const;
  const base = inputSchemaFor<ContentAdoptionReadInput<BodyEnvelope>>()(closedObjectSchema({ queries: batch({ oneOf: branches }) }));
  return extraQueries.length === 0 ? base : closedObjectSchema({ queries: batch({ oneOf: [...branches, ...extraQueries] }) });
}

const current = { oneOf: [
  closedObjectSchema({ state: { const: "present" }, revision: ADOPTION_REVISION_SCHEMA, value: json,
    origin: { oneOf: [BLUEPRINT_PART_ORIGIN_SCHEMA, nullValue] } }),
  closedObjectSchema({ state: { const: "missing" } }),
  closedObjectSchema({ state: { const: "unavailable" }, reason: token }),
] };

export function contentAdoptionReadOutputSchema(extraResults: readonly ActionSchema[] = []): ActionSchema {
  const receipt = { kind: { const: "receipt" }, request_id: token, current } as const;
  return closedObjectSchema({ results: batch({ oneOf: [
    closedObjectSchema({ kind: { const: "proposal" }, candidates: { type: "array", maxItems: BLUEPRINT_LIMITS.parts, items: closedObjectSchema({ subject: ACTION_SUBJECT_SCHEMA, current }) } }),
    closedObjectSchema({ kind: { const: "subject" }, current }),
    closedObjectSchema({ ...receipt, operation: { const: "adopt" }, receipt: CONTENT_ADOPTION_RESULT_SCHEMA }),
    closedObjectSchema({ ...receipt, operation: { const: "revert" }, receipt: CONTENT_ADOPTION_REVERT_RESULT_SCHEMA }),
    closedObjectSchema({ kind: { const: "missing" }, operation: adoptionOperation, request_id: token }),
    ...extraResults,
  ] }) });
}

export const CONTENT_ADOPTION_REVERT_INPUT_SCHEMA = inputSchemaFor<ContentAdoptionRevertInput>()(closedObjectSchema({
  adopt_request_id: token, request_id: token, subject: ACTION_SUBJECT_SCHEMA, expected_revision: ADOPTION_REVISION_SCHEMA,
}));

export const CONTENT_ADOPTION_REVERT_RESULT_SCHEMA = closedObjectSchema({
  outcome: { enum: ["restored", "detached"] }, subject: ACTION_SUBJECT_SCHEMA, revision: ADOPTION_REVISION_SCHEMA,
});
