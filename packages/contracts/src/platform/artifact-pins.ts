import { ActionError, type ActionCallContext, type ActionClient, type ActionDefinition, type ActionReference } from "./actions.js";
import type { ActionSubject } from "./action-subjects.js";
import type { ArtifactReference } from "../modules/artifacts.js";

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
