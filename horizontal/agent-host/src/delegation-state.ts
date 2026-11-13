import { isDeepStrictEqual } from "node:util";
import { isRecord } from "@molis-ai/molis-work-plugin-sdk";
import type { AgentDelegationMode, AgentDelegationSelection, AgentDelegationState, AgentDelegationSubject } from "@molis-ai/molis-work-contracts/services/agent-host";
import { validDelegationScope } from "./delegation-scopes.js";
import { agentErrors } from "./errors.js";

export interface StoredDelegationState extends AgentDelegationState { readonly schema: 1; readonly submission_id: string }
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value === value.trim();
const integer = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const keys = (value: Record<string, unknown>, required: readonly string[]) => Object.keys(value).length === required.length && required.every(key => Object.hasOwn(value, key));
export const delegationModeRank = (mode: AgentDelegationMode): number => ({ automatic: 0, confirm: 1, "read-only": 2 })[mode];
export const validDelegationMode = (value: unknown): value is AgentDelegationMode => value === "automatic" || value === "confirm" || value === "read-only";
export function delegationDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

export function validDelegationSubject(value: unknown): value is AgentDelegationSubject {
  if (!isRecord(value) || !text(value.actor_id) || value.project_id !== null && !text(value.project_id) || !isRecord(value.executor)
    || !keys(value.executor, ["plugin_id", "install_id", "installation_generation", "role_id"])
    || !Object.values(value.executor).every(text)) return false;
  if (value.kind === "ongoing") return keys(value, ["kind", "actor_id", "project_id", "executor"]);
  return value.kind === "work" && keys(value, ["kind", "actor_id", "project_id", "executor", "work"])
    && isRecord(value.work) && keys(value.work, ["owner_id", "id"]) && Object.values(value.work).every(text);
}

function selection(value: unknown): value is AgentDelegationSelection {
  return isRecord(value) && keys(value, ["id", "revision", "mode", "scopes", "expires_at", "granted_by", "granted_at", "revoked_at", "supersedes"])
    && text(value.id) && integer(value.revision) && validDelegationMode(value.mode)
    && Array.isArray(value.scopes) && value.scopes.every(validDelegationScope)
    && (value.mode !== "automatic" || value.scopes.length > 0)
    && text(value.granted_by) && delegationDate(value.granted_at)
    && (value.expires_at === null || delegationDate(value.expires_at)) && (value.revoked_at === null || delegationDate(value.revoked_at))
    && (value.supersedes === null || text(value.supersedes) && value.supersedes !== value.id);
}

function validState(value: unknown, subject?: AgentDelegationSubject): value is StoredDelegationState {
  if (!isRecord(value) || !keys(value, ["schema", "submission_id", "subject", "storage_version", "epoch", "lifecycle", "ended_at", "ended_reason", "selection_id", "selections"])
    || value.schema !== 1 || !text(value.submission_id) || !validDelegationSubject(value.subject)
    || subject && !isDeepStrictEqual(subject, value.subject) || !integer(value.storage_version) || !text(value.epoch)
    || value.lifecycle !== "open" && value.lifecycle !== "ending" && value.lifecycle !== "ended"
    || !Array.isArray(value.selections) || !value.selections.every(selection)) return false;
  const actor = value.subject.actor_id;
  if (
    new Set(value.selections.map(row => row.id)).size !== value.selections.length
    || value.selections.some(row => row.granted_by !== actor)
    || (value.selection_id === null ? value.selections.length !== 0 : !text(value.selection_id) || !value.selections.some(row => row.id === value.selection_id))
    || value.selections.some(row => row.id !== value.selection_id && row.revoked_at === null)
    || (value.lifecycle === "open" ? value.ended_at !== null || value.ended_reason !== null : !delegationDate(value.ended_at) || !text(value.ended_reason))
    || value.lifecycle !== "open" && value.selections.some(row => row.revoked_at === null)
    || value.subject.kind === "ongoing" && value.lifecycle !== "open") return false;
  return true;
}

/** Missing is different from corrupt: never turn a damaged permission record into an unset work. */
export function readDelegationState(value: unknown, subject?: AgentDelegationSubject): StoredDelegationState {
  if (!validState(value, subject)) throw agentErrors.delegation_unreadable("工作授权记录不可读，不能当作未选择权限");
  return structuredClone(value);
}

export function currentDelegation(state: AgentDelegationState | undefined): AgentDelegationSelection | undefined {
  return state?.selections.find(row => row.id === state.selection_id);
}

export function delegationSnapshot(state: StoredDelegationState): AgentDelegationState {
  const { schema: _schema, submission_id: _submission, ...snapshot } = state;
  return structuredClone(snapshot);
}
