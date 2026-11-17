import { isDeepStrictEqual } from "node:util";
import { canonicalJsonText, isRecord } from "@molis-ai/molis-work-plugin-sdk";
import type { ActionDelegationEffect } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentActionDelegationScope, AgentDelegationScope, AgentDelegationOperationScope, AgentDelegationTargetOwner } from "@molis-ai/molis-work-contracts/services/agent-host";

const text = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value === value.trim();
const keys = (value: Record<string, unknown>, expected: readonly string[]) => Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
const exactAction = (value: unknown) => isRecord(value) && keys(value, ["capability_id", "version", "provider_id"])
  && text(value.capability_id) && text(value.provider_id) && Number.isSafeInteger(value.version) && Number(value.version) > 0;
const targetOwner = (value: unknown) => isRecord(value) && keys(value, ["provider_id", "installation_generation", "kind"])
  && [value.provider_id, value.installation_generation, value.kind].every(text);

function targetSet(value: unknown): boolean {
  if (!isRecord(value) || !keys(value, ["owner", "ids"]) || !Array.isArray(value.ids) || !value.ids.length
    || new Set(value.ids).size !== value.ids.length) return false;
  if (value.owner === null) return value.ids.length === 1 && value.ids[0] === "";
  return targetOwner(value.owner) && value.ids.every(id => text(id) && id !== "*");
}

function operation(value: unknown): boolean {
  return isRecord(value) && keys(value, ["key", "targets"]) && text(value.key) && isRecord(value.targets)
    && Object.keys(value.targets).length > 0 && Object.keys(value.targets).every(text) && Object.values(value.targets).every(targetSet);
}

/** Stored exact arguments must be complete canonical JSON, not a lossy stringify of undefined/functions or duplicate keys. */
function canonicalInput(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try { return canonicalJsonText(JSON.parse(value)) === value; }
  catch { return false; }
}

export function validDelegationScope(value: unknown): value is AgentDelegationScope {
  if (!isRecord(value)) return false;
  if (value.kind === "action-objects") return keys(value, ["kind", "action", "declaration_digest", "provider_installation_generation", "operations"])
    && exactAction(value.action) && text(value.declaration_digest) && text(value.provider_installation_generation)
    && Array.isArray(value.operations) && value.operations.length > 0 && value.operations.every(operation);
  if (!canonicalInput(value.input_json)) return false;
  if (value.kind === "action-exact") return keys(value, ["kind", "action", "declaration_digest", "provider_installation_generation", "input_json"])
    && exactAction(value.action) && text(value.declaration_digest) && text(value.provider_installation_generation);
  if (value.kind === "mcp-exact") return keys(value, ["kind", "source_id", "connection_identity", "tool", "tool_digest", "input_json"])
    && [value.source_id, value.connection_identity, value.tool, value.tool_digest].every(text);
  return value.kind === "command-exact" && keys(value, ["kind", "workspace_id", "workspace_path", "input_json"])
    && text(value.workspace_id) && text(value.workspace_path);
}

function sameAction(left: AgentActionDelegationScope, right: AgentActionDelegationScope): boolean {
  return isDeepStrictEqual(left.action, right.action) && left.declaration_digest === right.declaration_digest
    && left.provider_installation_generation === right.provider_installation_generation;
}

function rowSubset(next: AgentDelegationOperationScope, previous: AgentDelegationOperationScope): boolean {
  return next.key === previous.key && keys(next.targets, Object.keys(previous.targets))
    && Object.entries(next.targets).every(([key, target]) => {
      const old = previous.targets[key]!;
      return isDeepStrictEqual(target.owner, old.owner) && target.ids.every(id => old.ids.includes(id));
    });
}

/** Every new row must fit wholly inside one old row. No widening by mixing separate target combinations. */
export function delegationScopesNarrow(previous: readonly AgentDelegationScope[], next: readonly AgentDelegationScope[]): boolean {
  return next.every(scope => validDelegationScope(scope) && previous.some(old => {
    if (scope.kind !== "action-objects" || old.kind !== "action-objects") return isDeepStrictEqual(scope, old);
    return sameAction(scope, old) && scope.operations.every(row => old.operations.some(previousRow => rowSubset(row, previousRow)));
  }));
}

/** Called only after original input validation/extraction and trusted owner resolution, never from display text. */
export function actionDelegationMatches(scope: AgentActionDelegationScope, call: Omit<AgentActionDelegationScope, "operations"> & {
  operations: readonly ActionDelegationEffect[]; target_owners: Readonly<Record<string, AgentDelegationTargetOwner | null>>;
}): boolean {
  if (!validDelegationScope(scope) || !sameAction(scope, { ...call, operations: [] }) || !call.operations.length) return false;
  return call.operations.every(effect => scope.operations.some(row => row.key === effect.key && keys(row.targets, Object.keys(effect.targets))
    && Object.entries(effect.targets).every(([key, id]) => Object.hasOwn(call.target_owners, key)
      && isDeepStrictEqual(row.targets[key]!.owner, call.target_owners[key]) && row.targets[key]!.ids.includes(id))));
}
