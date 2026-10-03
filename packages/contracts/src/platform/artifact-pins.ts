import { ActionError, type ActionCallContext, type ActionClient, type ActionDefinition, type ActionExecutionContext, type ActionHandlerBinding, type ActionReference } from "./actions.js";
import type { ActionSubject } from "./action-subjects.js";
import type { ArtifactReference, ArtifactVersionRecord } from "../modules/artifacts.js";

/**
 * How a work object is pinned into the 成果库 on the spot (specs/artifact-positioning A5): the owner fixes its current
 * revision as a new version and says which one. Callers such as a Goal handing in a deliverable find the owner by the
 * object's kind through these types, never by a list of plugins.
 */
export const ARTIFACT_PIN_INPUT_TYPE = "molis.artifacts.pin.request.v1";
export const ARTIFACT_PIN_OUTPUT_TYPE = "molis.artifacts.pin.v1";
export interface ArtifactPinInput { subject_id: string }
/** `recovered`: an interrupted earlier pin of the same revision was finished instead of writing another version. */
export interface ArtifactPinResult { artifact: ArtifactReference; recovered: boolean }

const id = { type: "string", minLength: 1 };
export const ARTIFACT_PIN_INPUT_SCHEMA = { type: "object", properties: { subject_id: id }, required: ["subject_id"], additionalProperties: false };
export const ARTIFACT_PIN_OUTPUT_SCHEMA = { type: "object", properties: {
  artifact: { type: "object", properties: { artifact_id: id, version: { type: "integer", minimum: 1 } }, required: ["artifact_id", "version"], additionalProperties: false },
  recovered: { type: "boolean" } }, required: ["artifact", "recovered"], additionalProperties: false };

export function defineArtifactPinAction(capabilityId: string, subjectKind: string, typeTitle: string, permissions: readonly string[]): ActionDefinition<ArtifactPinInput, ArtifactPinResult> {
  return { capability_id: capabilityId, version: 1, operation: "command", action: {
    title: `固定${typeTitle}的当前版本`, description: `把这份${typeTitle}的当前内容存为成果库里的新一版并返回它；原对象之后仍可修改，已固定的版本不变。`,
    kind: "operation", scope: "project", audiences: ["user", "agent", "workflow", "mcp"], permissions: [...permissions], subject_kinds: [subjectKind],
    input_type: ARTIFACT_PIN_INPUT_TYPE, output_type: ARTIFACT_PIN_OUTPUT_TYPE, input_schema: ARTIFACT_PIN_INPUT_SCHEMA, output_schema: ARTIFACT_PIN_OUTPUT_SCHEMA } };
}

export function isArtifactPinAction(action: { input_type?: string; output_type?: string }): boolean {
  return action.input_type === ARTIFACT_PIN_INPUT_TYPE && action.output_type === ARTIFACT_PIN_OUTPUT_TYPE;
}

/** The kinds of work object the caller can pin right now: one owner each. */
export async function pinnableSubjectKinds(client: ActionClient, caller: ActionCallContext): Promise<string[]> {
  const kinds = (await client.discover(caller)).filter(view => isArtifactPinAction(view.action) && view.availability.available).flatMap(view => view.action.subject_kinds);
  return [...new Set(kinds)].filter(kind => kinds.indexOf(kind) === kinds.lastIndexOf(kind));
}

/** Pins one object through its owner, with the original caller's authority. Discovery confers no authority. */
export async function pinActionSubject(client: ActionClient, caller: ActionCallContext, subject: ActionSubject): Promise<ArtifactPinResult> {
  const matches = (await client.discover(caller)).filter(view => isArtifactPinAction(view.action) && view.action.subject_kinds.includes(subject.kind));
  const available = matches.filter(view => view.availability.available);
  if (available.length > 1) throw new ActionError("actions.subject_ambiguous", "有多个插件能固定这类对象，不能任意选择");
  const selected = available[0];
  if (!selected) {
    const state = matches[0]?.availability;
    throw new ActionError(state && !state.available ? state.code : "actions.subject_unavailable", state && !state.available ? state.reason : "没有插件能把这类对象固定为成果");
  }
  const owner: ActionReference = { capability_id: selected.capability_id, version: selected.version, provider_id: selected.provider.provider_id };
  return await client.invoke(caller, owner, { subject_id: subject.id }) as ArtifactPinResult;
}

/**
 * Whether a pinned version still matches its work object (A4b, 「原文已改」): the owner compares the version's content with
 * the object as it is now. Revisions alone cannot tell: owners bump them for renames, stars and the pin itself.
 */
export const ARTIFACT_COMPARE_INPUT_TYPE = "molis.artifacts.compare.request.v1";
export const ARTIFACT_COMPARE_OUTPUT_TYPE = "molis.artifacts.compare.v1";
export type ArtifactCompareState = "same" | "changed" | "missing";
export interface ArtifactCompareInput { artifact: ArtifactVersionRecord }
export interface ArtifactCompareResult { state: ArtifactCompareState }

export function defineArtifactCompareAction(capabilityId: string, typeTitle: string, permissions: readonly string[]): ActionDefinition<ArtifactCompareInput, ArtifactCompareResult> {
  return { capability_id: capabilityId, version: 1, operation: "query", action: {
    title: `比较${typeTitle}与原对象`, description: `判断固定下来的这一版${typeTitle}与原对象现在的内容是否相同；不修改数据。`,
    kind: "query", scope: "project", scheduling: "concurrent", audiences: ["user"], plugin: false, permissions: [...permissions], subject_kinds: [],
    input_type: ARTIFACT_COMPARE_INPUT_TYPE, output_type: ARTIFACT_COMPARE_OUTPUT_TYPE,
    input_schema: { type: "object", properties: { artifact: { type: "object" } }, required: ["artifact"], additionalProperties: false },
    output_schema: { type: "object", properties: { state: { enum: ["same", "changed", "missing"] } }, required: ["state"], additionalProperties: false } } };
}

export function isArtifactCompareAction(action: { input_type?: string; output_type?: string }): boolean {
  return action.input_type === ARTIFACT_COMPARE_INPUT_TYPE && action.output_type === ARTIFACT_COMPARE_OUTPUT_TYPE;
}

/**
 * The owner's half: the work object a version was pinned from (origin `pinned`, this owner's type), read as it is now and
 * compared with the version's content; null when the object is gone.
 */
export function bindArtifactCompare(definition: ActionDefinition<ArtifactCompareInput, ArtifactCompareResult>, artifactTypeId: string,
  current: (objectId: string, caller: ActionCallContext) => unknown | null, same: (payload: unknown, object: unknown) => boolean): ActionHandlerBinding {
  return { capability_id: definition.capability_id, version: definition.version, execution: "sync", handle: (caller, input) => {
    const artifact = (input as ArtifactCompareInput).artifact;
    if (artifact?.artifact_type_id !== artifactTypeId || artifact.origin?.kind !== "pinned") throw new ActionError("actions.input_invalid", "这一版不是这个插件固定下来的");
    const object = current(artifact.origin.subject.id, caller);
    return { state: object == null ? "missing" : same(artifact.payload, object) ? "same" : "changed" } satisfies ArtifactCompareResult;
  } };
}

/**
 * The content fields of a pinned payload equal the object's. Both sides go through the JSON round trip the version went
 * through and are compared with sorted keys: the 成果库 stores payloads canonically, owners keep their own key order.
 */
export function sameArtifactFields(payload: unknown, object: unknown, fields: readonly string[]): boolean {
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])])) : value;
  const pick = (value: unknown) => JSON.stringify(canonical(fields.map(field => value && typeof value === "object" ? (value as Record<string, unknown>)[field] ?? null : null)));
  return pick(JSON.parse(JSON.stringify(payload ?? null))) === pick(JSON.parse(JSON.stringify(object ?? null)));
}

/** An owner's read of one of its objects for a comparison: null when it is gone (its `not_found`), other failures stand. */
export function objectOrMissing<T>(read: () => T): T | null {
  try { return read(); } catch (error) {
    if (/not_found$/u.test(String((error as { code?: unknown }).code ?? ""))) return null;
    throw error;
  }
}

/**
 * 「从这一版继续」 (A4b): a plugin starts a new work object of its own from a version in the 成果库 and says where it opens.
 * The version itself never changes. A plugin declares it on the types it can continue from, its own or another's
 * (Pages continues from imported text files).
 */
export const ARTIFACT_CONTINUE_INPUT_TYPE = "molis.artifacts.continue.request.v1";
export const ARTIFACT_CONTINUE_OUTPUT_TYPE = "molis.artifacts.continue.v1";
export interface ArtifactContinueInput { artifact: ArtifactVersionRecord }
export interface ArtifactContinueResult { open: { surface: string; id: string; title: string } }

export function defineArtifactContinueAction(capabilityId: string, objectTitle: string, permissions: readonly string[]): ActionDefinition<ArtifactContinueInput, ArtifactContinueResult> {
  const id = { type: "string", minLength: 1 };
  return { capability_id: capabilityId, version: 1, operation: "command", action: {
    title: `从这一版新建${objectTitle}`, description: `用成果库里的一版新建一份${objectTitle}继续编辑；这一版本身不变。`,
    kind: "operation", scope: "project", audiences: ["user"], plugin: false, permissions: [...permissions], subject_kinds: [],
    input_type: ARTIFACT_CONTINUE_INPUT_TYPE, output_type: ARTIFACT_CONTINUE_OUTPUT_TYPE,
    input_schema: { type: "object", properties: { artifact: { type: "object" } }, required: ["artifact"], additionalProperties: false },
    output_schema: { type: "object", properties: { open: { type: "object", properties: { surface: id, id, title: { type: "string" } }, required: ["surface", "id", "title"], additionalProperties: false } },
      required: ["open"], additionalProperties: false } } };
}

export function isArtifactContinueAction(action: { input_type?: string; output_type?: string }): boolean {
  return action.input_type === ARTIFACT_CONTINUE_INPUT_TYPE && action.output_type === ARTIFACT_CONTINUE_OUTPUT_TYPE;
}

/** The plugin's half: a new object from the version, for the types it declared; a version it cannot read is refused. */
export function bindArtifactContinue(definition: ActionDefinition<ArtifactContinueInput, ArtifactContinueResult>, artifactTypeIds: readonly string[],
  start: (artifact: ArtifactVersionRecord, caller: ActionExecutionContext) => ArtifactContinueResult["open"] | Promise<ArtifactContinueResult["open"]>): ActionHandlerBinding {
  return { capability_id: definition.capability_id, version: definition.version, handle: async (caller, input) => {
    const artifact = (input as ArtifactContinueInput).artifact;
    if (!artifact || !artifactTypeIds.includes(artifact.artifact_type_id) || artifact.availability !== "available") throw new ActionError("actions.input_invalid", "这一版不能在这个插件里继续");
    return { open: await start(artifact, caller) } satisfies ArtifactContinueResult;
  } };
}
